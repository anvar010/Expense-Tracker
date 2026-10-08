"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { COLLECTION_CACHE_KEYS, KEYS, ls, newId } from "./storage";
import type { Session, Tx, TxInput } from "@/lib/types";

type Op =
  | { kind: "create"; tempId: string; input: TxInput }
  | { kind: "update"; id: string; input: TxInput }
  | { kind: "delete"; id: string };

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
    res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
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

  const setList = useCallback((next: Tx[], persistTo: string) => {
    setTxs(next);
    ls.write(persistTo, next);
  }, []);

  const loadGuest = useCallback(() => {
    const list = ls.read<Tx[]>(KEYS.guest, []);
    setTxs(list);
    setGuestCount(list.length);
    setSync("synced");
    setPending(0);
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    const outbox = ls.read<Op[]>(KEYS.outbox, []);
    if (!outbox.length) return;
    flushing.current = true;
    setSync("syncing");
    const idMap = new Map<string, string>();
    const rest: Op[] = [];
    let blocked = false;
    for (const op of outbox) {
      if (blocked) { rest.push(op); continue; }
      try {
        if (op.kind === "create") {
          const t = await api<Tx>("/api/transactions", {
            method: "POST", body: JSON.stringify({ ...op.input, idempotencyKey: op.tempId }),
          });
          idMap.set(op.tempId, t.id);
        } else if (op.kind === "update") {
          await api(`/api/transactions/${idMap.get(op.id) ?? op.id}`, { method: "PUT", body: JSON.stringify(op.input) });
        } else {
          await api(`/api/transactions/${idMap.get(op.id) ?? op.id}`, { method: "DELETE" });
        }
      } catch (e) {
        if (e instanceof Unreachable) { blocked = true; rest.push(op); }
        // A rejected op (validation, already deleted) is dropped so it can't block the queue forever.
      }
    }
    ls.write(KEYS.outbox, rest);
    setPending(rest.length);
    flushing.current = false;
    setSync(rest.length ? "offline" : "synced");
  }, []);

  const loadRemote = useCallback(async () => {
    await flush();
    try {
      const list = await api<Tx[]>("/api/transactions");
      // Keep unsynced local creates visible until they reach the server.
      const outbox = ls.read<Op[]>(KEYS.outbox, []);
      if (outbox.length) {
        setTxs(ls.read<Tx[]>(KEYS.cache, list));
        setPending(outbox.length);
        setSync("offline");
        return;
      }
      setList(list, KEYS.cache);
      setSync("synced");
    } catch (e) {
      if (e instanceof Unreachable) {
        setTxs(ls.read<Tx[]>(KEYS.cache, []));
        setPending(ls.read<Op[]>(KEYS.outbox, []).length);
        setSync("offline");
      }
    }
  }, [flush, setList]);

  const enterUser = useCallback(async (s: Session) => {
    setSession(s);
    setMode("user");
    setGuestCount(ls.read<Tx[]>(KEYS.guest, []).length);
    setTxs(ls.read<Tx[]>(KEYS.cache, []));
    await loadRemote();
  }, [loadRemote]);

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

  const queue = (op: Op) => {
    const next = [...ls.read<Op[]>(KEYS.outbox, []), op];
    ls.write(KEYS.outbox, next);
    setPending(next.length);
    setSync("offline");
    // Ask the browser to wake us for a retry when connectivity returns (Chromium; harmless elsewhere).
    navigator.serviceWorker?.ready.then((r) => (r as unknown as { sync?: { register(t: string): Promise<void> } }).sync?.register("et-sync")).catch(() => {});
  };

  const add = useCallback(async (input: TxInput) => {
    if (mode === "guest") {
      const next = [{ ...input, id: newId() }, ...txs].sort((a, b) => b.date.localeCompare(a.date));
      setList(next, KEYS.guest);
      setGuestCount(next.length);
      return;
    }
    const tempId = newId();
    const local: Tx = { ...input, id: tempId };
    setList([local, ...txs].sort((a, b) => b.date.localeCompare(a.date)), KEYS.cache);
    queue({ kind: "create", tempId, input });
    await flush();
    await loadRemote();
  }, [mode, txs, setList, flush, loadRemote]);

  const addMany = useCallback(async (inputs: TxInput[]) => {
    if (!inputs.length) return;
    const created: Tx[] = inputs.map((i) => ({ ...i, id: newId() }));
    const merged = [...created, ...txs].sort((a, b) => b.date.localeCompare(a.date));
    if (mode === "guest") {
      setList(merged, KEYS.guest);
      setGuestCount(merged.length);
      return;
    }
    setList(merged, KEYS.cache);
    const ops: Op[] = created.map((t) => ({ kind: "create", tempId: t.id, input: inputs[created.indexOf(t)] }));
    const next = [...ls.read<Op[]>(KEYS.outbox, []), ...ops];
    ls.write(KEYS.outbox, next);
    setPending(next.length);
    await flush();
    await loadRemote();
  }, [mode, txs, setList, flush, loadRemote]);

  const update = useCallback(async (id: string, input: TxInput) => {
    const next = txs.map((t) => (t.id === id ? { ...t, ...input, id } : t));
    if (mode === "guest") return setList(next, KEYS.guest);
    setList(next, KEYS.cache);
    const outbox = ls.read<Op[]>(KEYS.outbox, []);
    const pendingCreate = outbox.find((o) => o.kind === "create" && o.tempId === id);
    if (pendingCreate && pendingCreate.kind === "create") {
      pendingCreate.input = input; // still unsynced: just rewrite the create
      ls.write(KEYS.outbox, outbox);
    } else queue({ kind: "update", id, input });
    await flush();
    await loadRemote();
  }, [mode, txs, setList, flush, loadRemote]);

  const remove = useCallback(async (id: string) => {
    const next = txs.filter((t) => t.id !== id);
    if (mode === "guest") {
      setList(next, KEYS.guest);
      setGuestCount(next.length);
      return;
    }
    setList(next, KEYS.cache);
    const outbox = ls.read<Op[]>(KEYS.outbox, []);
    if (outbox.some((o) => o.kind === "create" && o.tempId === id)) {
      const kept = outbox.filter((o) => !("tempId" in o && o.tempId === id));
      ls.write(KEYS.outbox, kept);
      setPending(kept.length);
    } else queue({ kind: "delete", id });
    await flush();
    await loadRemote();
  }, [mode, txs, setList, flush, loadRemote]);

  const importGuest = useCallback(async () => {
    const guest = ls.read<Tx[]>(KEYS.guest, []);
    for (const g of guest) queue({ kind: "create", tempId: g.id, input: toInput(g) });
    ls.remove(KEYS.guest);
    setGuestCount(0);
    await loadRemote();
  }, [loadRemote]);

  const signedIn = enterUser;

  const signOut = useCallback(async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch {}
    // Account data must not outlive the session on this device.
    ls.remove(KEYS.cache);
    ls.remove(KEYS.outbox);
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
