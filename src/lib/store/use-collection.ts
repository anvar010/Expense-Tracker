"use client";

import { useCallback, useEffect, useState } from "react";
import { useData } from "./data-provider";
import { hasPending, type Entity } from "./outbox";
import { collectionFetchedAt as fetchedAt, ls, newId } from "./storage";

const EVENT = "et:collection-changed";

// Switching tabs within this window reuses what is already on screen instead of asking the server again.
const FRESH_MS = 20_000;

/**
 * Per-user list (accounts, budgets, recurring). Guests: localStorage. Signed in: the list is kept on the device and
 * every change shows at once; changes are queued and sent to the server in order, also after a lost connection.
 */
export function useCollection<T extends { id: string }>(name: Extract<Entity, "accounts" | "budgets" | "recurring">) {
  const { mode, queueChange } = useData();
  const cacheKey = mode === "guest" ? `et:guest:${name}` : `et:cache:${name}`;
  // Start from what this device already has, so a page opens filled in instead of empty while the network answers.
  const cached = ls.read<T[] | null>(cacheKey, null);
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
    // Changes of ours are still waiting to be sent, so the server's copy is behind: keep showing the local one.
    if (hasPending(name)) {
      setItems(ls.read<T[]>(`et:cache:${name}`, []));
      return setLoaded(true);
    }
    if (!force && Date.now() - (fetchedAt.get(name) ?? 0) < FRESH_MS) return setLoaded(true);
    try {
      const res = await fetch(`/api/${name}`);
      if (!res.ok) throw new Error();
      const data = ((await res.json()) as { data: T[] }).data;
      if (hasPending(name)) return; // something was changed here while this was loading; the next load catches up
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

  /** Rewrites the list this device holds (the guest list, or the signed-in cache) and tells every open view. */
  const write = useCallback((change: (list: T[]) => T[]) => {
    const key = mode === "guest" ? `et:guest:${name}` : `et:cache:${name}`;
    ls.write(key, change(ls.read<T[]>(key, [])));
    notify();
  }, [mode, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = useCallback(async (input: Omit<T, "id">) => {
    const item = { ...input, id: newId() } as T;
    if (mode === "user") queueChange({ kind: "create", entity: name, tempId: item.id, input }); // queued first, so views don't refetch over the change
    write((list) => [...list, item]);
    return item;
  }, [mode, name, write, queueChange]);

  const update = useCallback(async (id: string, input: Omit<T, "id">) => {
    if (mode === "user") queueChange({ kind: "update", entity: name, id, input });
    write((list) => list.map((x) => (x.id === id ? ({ ...input, id } as T) : x)));
  }, [mode, name, write, queueChange]);

  const remove = useCallback(async (id: string) => {
    if (mode === "user") queueChange({ kind: "delete", entity: name, id });
    write((list) => list.filter((x) => x.id !== id));
  }, [mode, name, write, queueChange]);

  return { items, offline, loaded, create, update, remove };
}
