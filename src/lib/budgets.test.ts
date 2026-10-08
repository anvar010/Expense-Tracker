import { describe, expect, it } from "vitest";
import { budgetProgress, budgetRange, monthlyHistory, suggestBudgets } from "./budgets";
import type { Budget, Tx } from "./types";

const now = new Date(2026, 9, 8, 12); // Thu 8 Oct 2026
const b = (o: Partial<Budget>): Budget => ({ id: "b", category: "", amount: "1000", currency: "AED", period: "MONTHLY", ...o });
const tx = (o: Partial<Tx>, d = new Date(2026, 9, 3, 12)): Tx => ({
  id: crypto.randomUUID(), amount: "100", currency: "AED", type: "EXPENSE", category: "Food & Dining", merchant: "", notes: "", date: d.toISOString(), ...o,
});

describe("budgetRange", () => {
  it("monthly and weekly (Monday start)", () => {
    expect(budgetRange(b({}), now)[0].getDate()).toBe(1);
    expect(budgetRange(b({ period: "WEEKLY" }), now)[0].getDate()).toBe(5);
  });
  it("custom range includes the end day", () => {
    const r = budgetRange(b({ period: "CUSTOM", startDate: "2026-10-01", endDate: "2026-10-10" }), now);
    expect(r[1].getDate()).toBe(11);
  });
});

describe("budgetProgress", () => {
  it("tracks remaining, percentage and thresholds", () => {
    const p = budgetProgress(b({}), [tx({ amount: "850" })], now);
    expect(p.remaining.toString()).toBe("150");
    expect(p.pct).toBe(85);
    expect(p.status).toBe("warn");
    expect(p.crossed).toEqual([80]);
  });
  it("overspend crosses all thresholds", () => {
    const p = budgetProgress(b({}), [tx({ amount: "1200" })], now);
    expect(p.status).toBe("over");
    expect(p.crossed).toEqual([80, 90, 100]);
    expect(p.remaining.toString()).toBe("-200");
  });
  it("category budgets only count that category; refunds reduce; other currencies and income ignored", () => {
    const txs = [tx({ amount: "300" }), tx({ amount: "50", category: "Shopping" }), tx({ amount: "100", type: "REFUND" }),
      tx({ amount: "900", currency: "USD" }), tx({ amount: "5000", type: "INCOME" })];
    expect(budgetProgress(b({ category: "Food & Dining" }), txs, now).spent.toString()).toBe("200");
    expect(budgetProgress(b({}), txs, now).spent.toString()).toBe("250");
  });
  it("ignores spending outside the period", () => {
    expect(budgetProgress(b({}), [tx({}, new Date(2026, 8, 30, 12))], now).spent.toString()).toBe("0");
  });
});

describe("history and suggestions", () => {
  it("history returns 6 months ending this month", () => {
    const h = monthlyHistory(b({}), [tx({ amount: "40" })], 6, now);
    expect(h).toHaveLength(6);
    expect(h[5].spent).toBe(40);
    expect(h[4].spent).toBe(0);
  });
  it("suggests from the 3-month average, skipping covered categories", () => {
    const txs = [1, 2, 3].map((k) => tx({ amount: "300" }, new Date(2026, 9 - k, 5, 12)));
    expect(suggestBudgets(txs, [], "AED", now)[0]).toMatchObject({ category: "Food & Dining", suggested: expect.anything() });
    expect(suggestBudgets(txs, [], "AED", now)[0].suggested.toString()).toBe("300");
    expect(suggestBudgets(txs, [b({ category: "Food & Dining" })], "AED", now)).toHaveLength(0);
  });
});
