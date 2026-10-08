import Decimal from "decimal.js";
import type { Tx } from "./types";

export type Summary = {
  currency: string;
  income: Decimal;
  expenses: Decimal;
  savings: Decimal;
  savingsRate: number;
  count: number;
  byCategory: { name: string; value: Decimal }[];
  byMerchant: { name: string; value: Decimal }[];
  byDay: { day: string; expenses: Decimal; income: Decimal }[];
};

/** Aggregates one currency only; amounts in different currencies are never combined. */
export function summarize(txs: Tx[], currency: string): Summary {
  let income = new Decimal(0);
  let expenses = new Decimal(0);
  const cat = new Map<string, Decimal>();
  const mer = new Map<string, Decimal>();
  const day = new Map<string, { expenses: Decimal; income: Decimal }>();
  let count = 0;

  for (const t of txs) {
    if (t.currency !== currency) continue;
    count++;
    const a = new Decimal(t.amount);
    const d = t.date.slice(0, 10);
    const slot = day.get(d) ?? { expenses: new Decimal(0), income: new Decimal(0) };
    if (t.type === "INCOME") {
      income = income.plus(a);
      slot.income = slot.income.plus(a);
    } else if (t.type === "EXPENSE" || t.type === "REFUND") {
      // Refunds reduce spending. Transfers, card payments and adjustments are not spending.
      const signed = t.type === "REFUND" ? a.neg() : a;
      expenses = expenses.plus(signed);
      slot.expenses = slot.expenses.plus(signed);
      cat.set(t.category, (cat.get(t.category) ?? new Decimal(0)).plus(signed));
      if (t.merchant) mer.set(t.merchant, (mer.get(t.merchant) ?? new Decimal(0)).plus(signed));
    }
    day.set(d, slot);
  }

  const rank = (m: Map<string, Decimal>) =>
    [...m].map(([name, value]) => ({ name, value })).sort((x, y) => y.value.cmp(x.value));
  const savings = income.minus(expenses);
  return {
    currency, income, expenses, savings, count,
    savingsRate: income.gt(0) ? savings.div(income).times(100).toDecimalPlaces(1).toNumber() : 0,
    byCategory: rank(cat),
    byMerchant: rank(mer).slice(0, 5),
    byDay: [...day].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ day: d, ...v })),
  };
}

export const fmt = (v: Decimal.Value, currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).format(new Decimal(v).toNumber());
