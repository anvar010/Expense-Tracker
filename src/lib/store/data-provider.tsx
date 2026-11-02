"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { COLLECTION_CACHE_KEYS, KEYS, ls, newId, resetCollectionFreshness } from "./storage";
import { newestFirst } from "@/lib/tx-order";
import type { Session, Tx, TxInput } from "@/lib/types";

type OpBody =
  | { kind: "create"; tempId: string; input: TxInput }
  | { kind: "update"; id: string; input: TxInput }
  | { kind: "delete"; id: string };
/** A queued change. opId identifies it so it can be found again while a newer change is queued behind it. */
type Op = OpBody & { opId: string };

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

/** The queue, oldest first. Entries saved by an older version have no opId yet, so they get one. */
function readOutbox(): Op[] {
  const raw = ls.read<(OpBody & { opId?: string })[]>(KEYS.outbox, []);
  let fixed = false;
  const ops = raw.map((o) => (o.opId ? o : (fixed = true, { ...o, opId: newId() }))) as Op[];
  if (fixed) ls.write(KEYS.outbox, ops);
  return ops;
}

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

  const setAll = useCallback((next: Tx[]) => {
    txsRef.current = next;
    setTxs(next);
  }, []);

  const commit = useCallback((next: Tx[], persistTo: string) => {
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
    const idMap = ls.read<Record<string, string>>(KEYS.idmap, {});
    const real = (id: string) => idMap[id] ?? id;
    let blocked = false;
    try {
      for (;;) {
        const op = readOutbox()[0];
        if (!op) break;
        let created: Tx | undefined;
        try {
          if (op.kind === "create") {
            created = await api<Tx>("/api/transactions", { method: "POST", body: JSON.stringify({ ...op.input, idempotencyKey: op.tempId }) });
            idMap[op.tempId] = created.id;
            ls.write(KEYS.idmap, idMap);
            const saved = created;
            commit(txsRef.current.map((t) => (t.id === op.tempId ? saved : t)), KEYS.cache); // swap in the server's version
          } else if (op.kind === "update") {
            await api(`/api/transactions/${real(op.id)}`, { method: "PUT", body: JSON.stringify(op.input) });
          } else {
            await api(`/api/transactions/${real(op.id)}`, { method: "DELETE" });
          }
        } catch (e) {
          if (e instanceof Unreachable) { blocked = true; break; }
          // A rejected change (validation, already deleted) is dropped so it can't block the queue forever.
        }
        // Settle this change against the queue as it is now: it may have been edited or removed while it was sending.
        const cur = readOutbox();
        const at = cur.findIndex((o) => o.opId === op.opId);
        const next = cur.filter((o) => o.opId !== op.opId);
        if (op.kind === "create" && created) {
          const now = at >= 0 ? cur[at] : undefined;
          if (!now) next.unshift({ kind: "delete", id: created.id, opId: newId() }); // deleted while sending
          else if (now.kind === "create" && JSON.stringify(now.input) !== JSON.stringify(op.input)) {
            next.splice(at, 0, { kind: "update", id: created.id, input: now.input, opId: newId() }); // edited while sending
          }
        }
        writeOutbox(next);
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
    try {
      const list = await api<Tx[]>("/api/transactions");
      // Keep unsynced local creates visible until they reach the server.
      const outbox = readOutbox();
      if (outbox.length) {
        setAll(ls.read<Tx[]>(KEYS.cache, list));
        setPending(outbox.length);
        setSync("offline");
        return;
      }
      commit(list, KEYS.cache);
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
    const t = setInterval(() => sync === "offline" && retry(), 30000);
    return () => { window.removeEventListener("online", retry); navigator.serviceWorker?.removeEventListener("message", onSw); clearInterval(t); };
  }, [mode, sync, loadRemote]);

  const queue = (...bodies: OpBody[]) => {
    writeOutbox([...readOutbox(), ...bodies.map((b) => ({ ...b, opId: newId() }) as Op)]);
    // Ask the browser to wake us for a retry when connectivity returns (Chromium; harmless elsewhere).
    navigator.serviceWorker?.ready.then((r) => (r as unknown as { sync?: { register(t: string): Promise<void> } }).sync?.register("et-sync")).catch(() => {});
  };

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
    queue({ kind: "create", tempId, input });
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
    queue(...created.map((t, i): OpBody => ({ kind: "create", tempId: t.id, input: inputs[i] })));
    void flush();
  }, [mode, commit, flush]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(async (id: string, input: TxInput) => {
    const next = txsRef.current.map((t) => (t.id === id ? { ...t, ...input, id } : t));
    if (mode === "guest") return commit(next, KEYS.guest);
    commit(next, KEYS.cache);
    const outbox = readOutbox();
    const pendingCreate = outbox.find((o) => o.kind === "create" && o.tempId === id);
    if (pendingCreate && pendingCreate.kind === "create") {
      pendingCreate.input = input; // still unsynced: just rewrite the create
      writeOutbox(outbox);
    } else queue({ kind: "update", id, input });
    void flush();
  }, [mode, commit, flush, writeOutbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback(async (id: string) => {
    const next = txsRef.current.filter((t) => t.id !== id);
    if (mode === "guest") {
      commit(next, KEYS.guest);
      setGuestCount(next.length);
      return;
    }
    commit(next, KEYS.cache);
    const outbox = readOutbox();
    if (outbox.some((o) => o.kind === "create" && o.tempId === id)) {
      writeOutbox(outbox.filter((o) => !(o.kind === "create" && o.tempId === id)));
    } else queue({ kind: "delete", id });
    void flush();
  }, [mode, commit, flush, writeOutbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const importGuest = useCallback(async () => {
    const guest = ls.read<Tx[]>(KEYS.guest, []);
    queue(...guest.map((g): OpBody => ({ kind: "create", tempId: g.id, input: toInput(g) })));
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
    add, addMany, update, remove, refresh: loadRemote, importGuest, signedIn, signOut,
  }), [mode, session, txs, sync, pending, guestCount, add, addMany, update, remove, loadRemote, importGuest, signedIn, signOut]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
