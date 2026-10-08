import Decimal from "decimal.js";
import type { Budget, Tx } from "./types";

export const THRESHOLDS = [80, 90, 100] as const;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** [start, end) of the budget period containing `now`. */
export function budgetRange(b: Pick<Budget, "period" | "startDate" | "endDate">, now = new Date()): [Date, Date] {
  const today = startOfDay(now);
  if (b.period === "WEEKLY") {
    const s = new Date(+today - ((today.getDay() + 6) % 7) * 864e5);
    return [s, new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7)];
  }
  if (b.period === "CUSTOM" && b.startDate && b.endDate) {
    const e = startOfDay(new Date(b.endDate));
    return [startOfDay(new Date(b.startDate)), new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1)];
  }
  return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
}

export function spentIn(txs: Tx[], range: [Date, Date], currency: string, category = ""): Decimal {
  let total = new Decimal(0);
  for (const t of txs) {
    if (t.currency !== currency || (t.type !== "EXPENSE" && t.type !== "REFUND")) continue;
    if (category && t.category !== category) continue;
    const d = new Date(t.date);
    if (d < range[0] || d >= range[1]) continue;
    total = t.type === "REFUND" ? total.minus(t.amount) : total.plus(t.amount);
  }
  return total;
}

export type Progress = {
  spent: Decimal; remaining: Decimal; pct: number; range: [Date, Date];
  status: "ok" | "warn" | "danger" | "over"; crossed: number[];
};

export function budgetProgress(b: Budget, txs: Tx[], now = new Date()): Progress {
  const range = budgetRange(b, now);
  const spent = spentIn(txs, range, b.currency, b.category);
  const amount = new Decimal(b.amount);
  const pct = amount.gt(0) ? spent.div(amount).times(100).toDecimalPlaces(1).toNumber() : 0;
  return {
    spent, range, pct, remaining: amount.minus(spent),
    status: pct >= 100 ? "over" : pct >= 90 ? "danger" : pct >= 80 ? "warn" : "ok",
    crossed: THRESHOLDS.filter((t) => pct >= t),
  };
}

/** Spending vs the budget amount for the last `n` months, newest last (for monthly budgets). */
export function monthlyHistory(b: Budget, txs: Tx[], n = 6, now = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return {
      month: start.toLocaleDateString("en-GB", { month: "short" }),
      spent: spentIn(txs, [start, end], b.currency, b.category).toNumber(),
      budget: Number(b.amount),
    };
  });
}

/** Suggest budgets for categories with no budget: 3-month average of full months, rounded up to the next 10. */
export function suggestBudgets(txs: Tx[], budgets: Budget[], currency: string, now = new Date()) {
  const covered = new Set(budgets.filter((b) => b.currency === currency && b.period === "MONTHLY").map((b) => b.category));
  const months = [1, 2, 3].map((k) => [new Date(now.getFullYear(), now.getMonth() - k, 1), new Date(now.getFullYear(), now.getMonth() - k + 1, 1)] as [Date, Date]);
  const cats = new Set(txs.filter((t) => t.currency === currency && t.type === "EXPENSE").map((t) => t.category));
  return [...cats]
    .filter((c) => !covered.has(c))
    .map((category) => {
      const total = months.reduce((s, r) => s.plus(spentIn(txs, r, currency, category)), new Decimal(0));
      const avg = total.div(3);
      return { category, average: avg, suggested: avg.div(10).ceil().times(10) };
    })
    .filter((s) => s.average.gt(0))
    .sort((a, b) => b.average.cmp(a.average))
    .slice(0, 5);
}
