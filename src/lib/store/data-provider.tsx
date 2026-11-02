"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { opTarget, readOutbox, type Op, type OpBody } from "./outbox";
import { COLLECTION_CACHE_KEYS, KEYS, ls, newId, resetCollectionFreshness } from "./storage";
import { newestFirst } from "@/lib/tx-order";
import type { Session, Tx, TxInput } from "@/lib/types";

export type Mode = "loading" | "guest" | "user";
export type SyncState = "synced" | "offline" | "syncing";

type Ctx = {
  mode: Mode;
  session: Session | null;
  txs: Tx[];
  sync: SyncState;
  pending: number;
  guestCount: number;
  add: (input: TxInput) => Promise<void>;
  addMany: (inputs: TxInput[]) => Promise<void>;
  update: (id: string, input: TxInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Queue a change to accounts, budgets or recurring items; it shows on screen at once and is sent when possible. */
  queueChange: (body: OpBody) => void;
  importGuest: () => Promise<void>;
  signedIn: (s: Session) => Promise<void>;
  signOut: () => Promise<void>;
};

const DataCtx = createContext<Ctx | null>(null);
export const useData = () => {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData outside DataProvider");
  return c;
};

class Unreachable extends Error {}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    // A stalled connection counts as offline, so the queue keeps the change instead of hanging.
    res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Unreachable();
  }
  const body = await res.json().catch(() => null);
  if (res.status === 503 || res.status >= 502) throw new Unreachable();
  if (!res.ok) throw new Error(body?.error ?? "Request failed");
  return body.data as T;
}

const toInput = (t: Tx): TxInput => ({
  amount: t.amount, currency: t.currency, type: t.type, category: t.category,
  merchant: t.merchant, date: t.date, notes: t.notes, source: t.source,
});

export function DataProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [sync, setSync] = useState<SyncState>("synced");
  const [pending, setPending] = useState(0);
  const [guestCount, setGuestCount] = useState(0);
  const flushing = useRef(false);
  // Always the latest list, so several quick changes build on each other instead of on a stale render.
  const txsRef = useRef<Tx[]>([]);
  // Counts local changes, so a server refresh that started before one of them can be thrown away instead of undoing it.
  const epoch = useRef(0);

  const setAll = useCallback((next: Tx[]) => {
    txsRef.current = next;
    setTxs(next);
  }, []);

  const commit = useCallback((next: Tx[], persistTo: string) => {
    epoch.current++;
    setAll(next);
    ls.write(persistTo, next);
  }, [setAll]);

  const writeOutbox = useCallback((ops: Op[]) => {
    ls.write(KEYS.outbox, ops);
    setPending(ops.length);
  }, []);

  const loadGuest = useCallback(() => {
    const list = ls.read<Tx[]>(KEYS.guest, []);
    setAll(list);
    setGuestCount(list.length);
    setSync("synced");
    setPending(0);
  }, [setAll]);

  /**
   * Sends the queue to the server one change at a time, oldest first (first come, first served), so entries
   * land in the order they were added. If the network drops, it stops and keeps everything that is left.
   */
  const flush = useCallback(async (): Promise<void> => {
    if (flushing.current || !readOutbox().length) return;
    flushing.current = true;
    setSync("syncing");
    const idMap = ls.read<Record<string, string>>(KEYS.idmap, {}); // transactions only: temp id -> server id
    const real = (op: Op) => (op.kind === "create" ? op.tempId : idMap[op.id] ?? op.id);
    let blocked = false;
    try {
      for (;;) {
        const op = readOutbox()[0];
        if (!op) break;
        const isTx = op.entity === "transactions";
        let createdId: string | undefined;
        try {
          if (op.kind === "create") {
            if (isTx) {
              const created = await api<Tx>("/api/transactions", { method: "POST", body: JSON.stringify({ ...(op.input as TxInput), idempotencyKey: op.tempId }) });
              idMap[op.tempId] = created.id;
              ls.write(KEYS.idmap, idMap);
              createdId = created.id;
              commit(txsRef.current.map((t) => (t.id === op.tempId ? created : t)), KEYS.cache); // swap in the server's version
            } else {
              // The id chosen on this device is the id on the server, so a retried create can't make a second copy.
              await api(`/api/${op.entity}`, { method: "POST", body: JSON.stringify({ ...(op.input as object), id: op.tempId }) });
              createdId = op.tempId;
            }
          } else if (op.kind === "update") {
            await api(`/api/${op.entity}/${real(op)}`, { method: "PUT", body: JSON.stringify(op.input) });
          } else {
            await api(`/api/${op.entity}/${real(op)}`, { method: "DELETE" });
          }
        } catch (e) {
          if (e instanceof Unreachable) { blocked = true; break; }
          // A rejected change (validation, already deleted) is dropped so it can't block the queue forever.
        }
        // Settle this change against the queue as it is now: it may have been edited or removed while it was sending.
        const cur = readOutbox();
        const at = cur.findIndex((o) => o.opId === op.opId);
        const next = cur.filter((o) => o.opId !== op.opId);
        if (op.kind === "create" && createdId) {
          const now = at >= 0 ? cur[at] : undefined;
          if (!now) next.unshift({ kind: "delete", entity: op.entity, id: createdId, opId: newId() }); // deleted while sending
          else if (now.kind === "create" && JSON.stringify(now.input) !== JSON.stringify(op.input)) {
            next.splice(at, 0, { kind: "update", entity: op.entity, id: createdId, input: now.input, opId: newId() }); // edited while sending
          }
        }
        writeOutbox(next);
        // Lists of accounts/budgets/recurring re-read once their last waiting change is on the server.
        if (!isTx && !next.some((o) => o.entity === op.entity)) window.dispatchEvent(new CustomEvent("et:collection-changed", { detail: op.entity }));
      }
    } finally {
      flushing.current = false;
    }
    const left = readOutbox().length;
    setPending(left);
    setSync(blocked || left ? "offline" : "synced");
  }, [commit, writeOutbox]);

  const loadRemote = useCallback(async () => {
    await flush();
    const started = epoch.current;
    try {
      const list = await api<Tx[]>("/api/transactions");
      if (epoch.current !== started) return; // something changed here while this was loading; the next refresh catches up
      // Keep unsynced local creates visible until they reach the server.
      const outbox = readOutbox();
      if (outbox.some((o) => o.entity === "transactions")) {
        setAll(ls.read<Tx[]>(KEYS.cache, list));
        setPending(outbox.length);
        setSync("offline");
        return;
      }
      commit([...list].sort(newestFirst), KEYS.cache);
      setSync("synced");
    } catch (e) {
      if (e instanceof Unreachable) {
        setAll(ls.read<Tx[]>(KEYS.cache, []));
        setPending(readOutbox().length);
        setSync("offline");
      }
    }
  }, [flush, commit, setAll]);

  const enterUser = useCallback(async (s: Session) => {
    resetCollectionFreshness();
    setSession(s);
    setMode("user");
    setGuestCount(ls.read<Tx[]>(KEYS.guest, []).length);
    setAll(ls.read<Tx[]>(KEYS.cache, []));
    await loadRemote();
  }, [loadRemote, setAll]);

  // Boot: the signed cookie tells us who we are even when the database is down.
  useEffect(() => {
    (async () => {
      try {
        const s = await api<Session | null>("/api/auth/me");
        if (s) return void (await enterUser(s));
      } catch {}
      setSession(null);
      setMode("guest");
      loadGuest();
    })();
  }, [enterUser, loadGuest]);

  // Retry when the connection returns, and periodically while offline.
  useEffect(() => {
    if (mode !== "user") return;
    const retry = () => void loadRemote();
    const onSw = (e: MessageEvent) => e.data?.type === "flush" && retry();
    window.addEventListener("online", retry);
    navigator.serviceWorker?.addEventListener("message", onSw);
    // Entries can also arrive from outside the app (Apple Pay, another device), so look again when the app comes
    // back into view and every minute while it is open. While offline, keep retrying more often.
    const onVisible = () => document.visibilityState === "visible" && retry();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", retry);
    const t = setInterval(() => (sync === "offline" || document.visibilityState === "visible") && retry(), sync === "offline" ? 30000 : 60000);
    return () => {
      window.removeEventListener("online", retry); window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onSw); clearInterval(t);
    };
  }, [mode, sync, loadRemote]);

  /** Adds changes to the queue. An edit or delete of something that hasn't been sent yet is folded into its create. */
  const queue = (...bodies: OpBody[]) => {
    let ops = readOutbox();
    for (const body of bodies) {
      const target = body.kind === "create" ? body.tempId : body.id;
      const pendingCreate = ops.find((o) => o.kind === "create" && o.entity === body.entity && o.tempId === target);
      if (body.kind === "update" && pendingCreate && pendingCreate.kind === "create") { pendingCreate.input = body.input; continue; }
      if (body.kind === "delete" && pendingCreate) { ops = ops.filter((o) => !(o.entity === body.entity && opTarget(o) === target)); continue; }
      ops = [...ops, { ...body, opId: newId() } as Op];
    }
    writeOutbox(ops);
    // Ask the browser to wake us for a retry when connectivity returns (Chromium; harmless elsewhere).
    navigator.serviceWorker?.ready.then((r) => (r as unknown as { sync?: { register(t: string): Promise<void> } }).sync?.register("et-sync")).catch(() => {});
  };

  const queueChange = useCallback((body: OpBody) => { queue(body); void flush(); }, [flush]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changes show up instantly and are saved in the background (see flush), so nothing waits on the network.
  const add = useCallback(async (input: TxInput) => {
    const entry = { ...input, createdAt: new Date().toISOString() };
    if (mode === "guest") {
      const next = [{ ...entry, id: newId() }, ...txsRef.current].sort(newestFirst);
      commit(next, KEYS.guest);
      setGuestCount(next.length);
      return;
    }
    const tempId = newId();
    commit([{ ...entry, id: tempId }, ...txsRef.current].sort(newestFirst), KEYS.cache);
    queue({ kind: "create", entity: "transactions", tempId, input });
    void flush();
  }, [mode, commit, flush]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMany = useCallback(async (inputs: TxInput[]) => {
    if (!inputs.length) return;
    const now = new Date().toISOString();
    const created: Tx[] = inputs.map((i) => ({ ...i, id: newId(), createdAt: now }));
    const merged = [...created, ...txsRef.current].sort(newestFirst);
    if (mode === "guest") {
      commit(merged, KEYS.guest);
      setGuestCount(merged.length);
      return;
    }
    commit(merged, KEYS.cache);
    queue(...created.map((t, i): OpBody => ({ kind: "create", entity: "transactions", tempId: t.id, input: inputs[i] })));
    void flush();
  }, [mode, commit, flush]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(async (id: string, input: TxInput) => {
    const next = txsRef.current.map((t) => (t.id === id ? { ...t, ...input, id } : t));
    if (mode === "guest") return commit(next, KEYS.guest);
    commit(next, KEYS.cache);
    queue({ kind: "update", entity: "transactions", id, input });
    void flush();
  }, [mode, commit, flush]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback(async (id: string) => {
    const next = txsRef.current.filter((t) => t.id !== id);
    if (mode === "guest") {
      commit(next, KEYS.guest);
      setGuestCount(next.length);
      return;
    }
    commit(next, KEYS.cache);
    queue({ kind: "delete", entity: "transactions", id });
    void flush();
  }, [mode, commit, flush]); // eslint-disable-line react-hooks/exhaustive-deps

  const importGuest = useCallback(async () => {
    const guest = ls.read<Tx[]>(KEYS.guest, []);
    queue(...guest.map((g): OpBody => ({ kind: "create", entity: "transactions", tempId: g.id, input: toInput(g) })));
    ls.remove(KEYS.guest);
    setGuestCount(0);
    await loadRemote();
  }, [loadRemote]); // eslint-disable-line react-hooks/exhaustive-deps

  const signedIn = enterUser;

  const signOut = useCallback(async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch {}
    // Account data must not outlive the session on this device.
    ls.remove(KEYS.cache);
    ls.remove(KEYS.outbox);
    ls.remove(KEYS.idmap);
    resetCollectionFreshness();
    COLLECTION_CACHE_KEYS.forEach(ls.remove);
    setSession(null);
    setMode("guest");
    loadGuest();
  }, [loadGuest]);

  const value = useMemo<Ctx>(() => ({
    mode, session, txs, sync, pending, guestCount,
    add, addMany, update, remove, refresh: loadRemote, queueChange, importGuest, signedIn, signOut,
  }), [mode, session, txs, sync, pending, guestCount, add, addMany, update, remove, loadRemote, queueChange, importGuest, signedIn, signOut]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
