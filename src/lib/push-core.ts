import { fmt } from "./analytics";
import type { Tx } from "./types";

export type PushMessage = { title: string; body: string; url: string };

/** The alert for a new entry, or null for entries that aren't a plain debit or credit (transfers, adjustments…). */
export function transactionMessage(t: Pick<Tx, "type" | "amount" | "currency" | "category" | "merchant">): PushMessage | null {
  const credit = t.type === "INCOME" || t.type === "REFUND";
  if (!credit && t.type !== "EXPENSE") return null;
  const where = t.merchant && t.merchant !== t.category ? ` · ${t.merchant}` : "";
  return {
    title: `${credit ? "Credited" : "Debited"} ${fmt(t.amount, t.currency)}`,
    body: `${t.category}${where}`,
    url: "/transactions",
  };
}
