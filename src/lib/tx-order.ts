import type { Tx } from "./types";

type Ordered = Pick<Tx, "date" | "createdAt">;

/**
 * Newest first: by calendar day, then by when the entry was added. Typed entries are stored at noon while ones
 * that arrive by themselves (Apple Pay) carry the real time of day, so the time of day must not decide the order.
 */
export const newestFirst = (a: Ordered, b: Ordered) =>
  b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)) ||
  (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
  b.date.localeCompare(a.date);
