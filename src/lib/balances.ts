import Decimal from "decimal.js";
import type { Account, Tx } from "./types";

/**
 * Balance of an account, derived only from the opening balance and recorded transactions.
 * - Cash-like accounts: the money held.
 * - Credit cards: the outstanding amount owed (purchases raise it, payments lower it).
 * Transactions in another currency than the account are ignored (no implicit conversion).
 * Amount conventions: TRANSFER / CARD_PAYMENT leave `accountId` and arrive at `toAccountId`.
 * ADJUSTMENT amounts are signed and are added to the account's balance figure.
 */
export function accountBalance(account: Account, txs: Tx[]): Decimal {
  const card = account.type === "CREDIT_CARD";
  let bal = new Decimal(account.openingBalance || 0);
  for (const t of txs) {
    if (t.currency !== account.currency) continue;
    const a = new Decimal(t.amount);
    const out = t.accountId === account.id;
    const into = t.toAccountId === account.id;
    if (!out && !into) continue;

    if (t.type === "ADJUSTMENT") {
      if (out) bal = bal.plus(a);
    } else if (t.type === "TRANSFER" || t.type === "CARD_PAYMENT") {
      if (out) bal = card ? bal.plus(a) : bal.minus(a); // money leaving (a card "transfer out" is a cash advance)
      if (into) bal = card ? bal.minus(a) : bal.plus(a); // money arriving; on a card it reduces what is owed
    } else if (out) {
      const credit = t.type === "INCOME" || t.type === "REFUND";
      bal = card ? (credit ? bal.minus(a) : bal.plus(a)) : credit ? bal.plus(a) : bal.minus(a);
    }
  }
  return bal;
}

export function cardUtilization(account: Account, balance: Decimal): number | null {
  if (account.type !== "CREDIT_CARD" || !account.creditLimit) return null;
  const limit = new Decimal(account.creditLimit);
  return limit.gt(0) ? balance.div(limit).times(100).toDecimalPlaces(0).toNumber() : null;
}

/** Amount to record as an ADJUSTMENT so the computed balance equals what the bank reports. */
export const reconciliationDifference = (actual: string, computed: Decimal) =>
  new Decimal(actual).minus(computed);

/** Next due date (as a Date) for a card whose statement is due on `dueDay` of the month. */
export function nextDueDate(dueDay: number, now = new Date()): Date {
  const clamp = (y: number, m: number) => new Date(y, m, Math.min(dueDay, new Date(y, m + 1, 0).getDate()));
  const thisMonth = clamp(now.getFullYear(), now.getMonth());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return thisMonth >= today ? thisMonth : clamp(now.getFullYear(), now.getMonth() + 1);
}
