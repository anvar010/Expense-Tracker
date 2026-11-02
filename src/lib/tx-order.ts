import type { Tx } from "./types";

/** Newest first: by transaction date, then by when the entry was added (entries on the same day all share noon). */
export const newestFirst = (a: Pick<Tx, "date" | "createdAt">, b: Pick<Tx, "date" | "createdAt">) =>
  b.date.localeCompare(a.date) || (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
