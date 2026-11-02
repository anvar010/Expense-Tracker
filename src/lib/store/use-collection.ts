"use client";

import { useCallback, useEffect, useState } from "react";
import { useData } from "./data-provider";
import { collectionFetchedAt as fetchedAt, ls, newId } from "./storage";

const EVENT = "et:collection-changed";

// Switching tabs within this window reuses what is already on screen instead of asking the server again.
const FRESH_MS = 20_000;

/**
 * Per-user list (accounts, budgets). Guests: localStorage. Signed in: API, with a cached read-only copy
 * when the database is unreachable (writes need a connection and say so).
 */
export function useCollection<T extends { id: string }>(name: "accounts" | "budgets" | "recurring") {
  const { mode } = useData();
  // Start from what this device already has, so a page opens filled in instead of empty while the network answers.
  const cached = ls.read<T[] | null>(mode === "guest" ? `et:guest:${name}` : `et:cache:${name}`, null);
  const [items, setItems] = useState<T[]>(cached ?? []);
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(cached !== null);

  const load = useCallback(async (force = false) => {
    if (mode === "loading") return;
    if (mode === "guest") {
      setItems(ls.read<T[]>(`et:guest:${name}`, []));
      setOffline(false);
      return setLoaded(true);
    }
    if (!force && Date.now() - (fetchedAt.get(name) ?? 0) < FRESH_MS) return setLoaded(true);
    try {
      const res = await fetch(`/api/${name}`);
      if (!res.ok) throw new Error();
      const data = ((await res.json()) as { data: T[] }).data;
      setItems(data);
      ls.write(`et:cache:${name}`, data);
      fetchedAt.set(name, Date.now());
      setOffline(false);
    } catch {
      setItems(ls.read<T[]>(`et:cache:${name}`, []));
      setOffline(true);
    }
    setLoaded(true);
  }, [mode, name]);

  useEffect(() => {
    void load();
    const h = (e: Event) => (e as CustomEvent).detail === name && void load(true);
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, [load, name]);

  const notify = () => window.dispatchEvent(new CustomEvent(EVENT, { detail: name }));

  async function call(method: string, url: string, body?: unknown) {
    let res: Response;
    try {
      res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error("You're offline. Reconnect to change this.");
    }
    const json = await res.json().catch(() => null);
    if (res.status === 503) throw new Error("Database is not reachable right now. Try again shortly.");
    if (!res.ok) throw new Error(json?.error ?? "Request failed");
    return json.data as T;
  }

  const create = useCallback(async (input: Omit<T, "id">) => {
    if (mode === "guest") {
      const item = { ...input, id: newId() } as T;
      ls.write(`et:guest:${name}`, [...ls.read<T[]>(`et:guest:${name}`, []), item]);
      notify();
      return item;
    }
    const item = await call("POST", `/api/${name}`, input);
    notify();
    return item;
  }, [mode, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(async (id: string, input: Omit<T, "id">) => {
    if (mode === "guest") {
      ls.write(`et:guest:${name}`, ls.read<T[]>(`et:guest:${name}`, []).map((x) => (x.id === id ? ({ ...input, id } as T) : x)));
    } else await call("PUT", `/api/${name}/${id}`, input);
    notify();
  }, [mode, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback(async (id: string) => {
    if (mode === "guest") ls.write(`et:guest:${name}`, ls.read<T[]>(`et:guest:${name}`, []).filter((x) => x.id !== id));
    else await call("DELETE", `/api/${name}/${id}`);
    notify();
  }, [mode, name]); // eslint-disable-line react-hooks/exhaustive-deps

  return { items, offline, loaded, create, update, remove };
}
