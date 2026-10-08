"use client";

import { useCallback, useEffect, useState } from "react";
import { ls } from "./storage";

/** A small persisted list in localStorage (rules, review queue). Loads after mount to stay hydration-safe. */
export function useLocalList<T>(key: string) {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => setItems(ls.read<T[]>(key, [])), [key]);
  const set = useCallback((next: T[] | ((prev: T[]) => T[])) => {
    setItems((prev) => {
      const value = typeof next === "function" ? (next as (p: T[]) => T[])(prev) : next;
      ls.write(key, value);
      return value;
    });
  }, [key]);
  return [items, set] as const;
}
