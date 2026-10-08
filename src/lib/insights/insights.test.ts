import { describe, expect, it } from "vitest";
import { generateInsights } from "./engine";
import { answerQuestion } from "./qa";
import { detectRecurring } from "./recurring";
import type { Tx } from "../types";

const now = new Date(2026, 9, 20, 12); // 20 Oct 2026
const T = (o: Partial<Tx> & { d: [number, number, number] }): Tx => {
  const { d, ...rest } = o;
  return { id: crypto.randomUUID(), amount: "100", currency: "AED", type: "EXPENSE", category: "Other", merchant: "", notes: "", date: new Date(d[0], d[1], d[2], 12).toISOString(), ...rest };
};
const monthly = (merchant: string, amount: string, category: string, months: number[]) => months.map((m) => T({ d: [2026, m, 5], merchant, amount, category }));

describe("detectRecurring", () => {
  it("finds a monthly subscription and predicts the next date", () => {
    const r = detectRecurring(monthly("Netflix", "55", "Subscriptions", [6, 7, 8, 9]), now);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ merchant: "Netflix", frequency: "MONTHLY", amount: "55.00", occurrences: 4 });
    expect(new Date(r[0].nextDue).getMonth()).toBe(10);
  });
  it("tolerates small amount drift, rejects irregular or big-variance charges", () => {
    expect(detectRecurring([...monthly("Spotify", "20", "Subscriptions", [7, 8]), T({ d: [2026, 9, 5], merchant: "Spotify", amount: "20.5", category: "Subscriptions" })], now)).toHaveLength(1);
    const irregular = [T({ d: [2026, 6, 2], merchant: "Cafe", amount: "30" }), T({ d: [2026, 6, 19], merchant: "Cafe", amount: "30" }), T({ d: [2026, 8, 3], merchant: "Cafe", amount: "30" })];
    expect(detectRecurring(irregular, now)).toHaveLength(0);
    expect(detectRecurring([T({ d: [2026, 7, 5], merchant: "Shop", amount: "10" }), T({ d: [2026, 8, 5], merchant: "Shop", amount: "200" }), T({ d: [2026, 9, 5], merchant: "Shop", amount: "900" })], now)).toHaveLength(0);
  });
  it("drops subscriptions that stopped long ago and never mixes currencies", () => {
    expect(detectRecurring(monthly("Old", "30", "Subscriptions", [0, 1, 2]), now)).toHaveLength(0);
    const mixed = [...monthly("Netflix", "55", "Subscriptions", [7, 8]), T({ d: [2026, 9, 5], merchant: "Netflix", amount: "55", currency: "USD" })];
    expect(detectRecurring(mixed, now)).toHaveLength(0);
  });
});

describe("generateInsights", () => {
  const food = (m: number, d: number, a: string) => T({ d: [2026, m, d], category: "Food & Dining", amount: a, merchant: "Talabat" });
  it("compares like-for-like days and reports rises", () => {
    const txs = [food(8, 3, "200"), food(8, 25, "900"), food(9, 4, "250"), food(9, 12, "250")]; // last month by day 20 = 200; this month = 500
    const i = generateInsights(txs, "AED", now);
    expect(i.find((x) => x.id === "up-Food & Dining")?.title).toContain("increased by 150%");
    expect(i.find((x) => x.id === "delivery")?.title).toContain("500.00");
  });
  it("reports subscriptions cost per month and unusual expenses", () => {
    const txs = [...monthly("Netflix", "55", "Subscriptions", [7, 8, 9]), ...monthly("Spotify", "20", "Subscriptions", [7, 8, 9]),
      ...[1, 2, 3, 4, 5, 6].map((d) => T({ d: [2026, 8, d], category: "Shopping", amount: "50", merchant: "Shop" })), T({ d: [2026, 9, 15], category: "Shopping", amount: "600", merchant: "Mall" })];
    const i = generateInsights(txs, "AED", now);
    expect(i.find((x) => x.id === "subs")?.title).toContain("75.00");
    expect(i.some((x) => x.title.startsWith("Unusual expense") && x.title.includes("Mall"))).toBe(true);
  });
  it("savings rate", () => {
    const i = generateInsights([T({ d: [2026, 9, 1], type: "INCOME", amount: "5000", category: "Salary" }), T({ d: [2026, 9, 2], amount: "1000" })], "AED", now);
    expect(i.find((x) => x.id === "save")?.title).toContain("80%");
  });
});

describe("answerQuestion", () => {
  const txs = [
    T({ d: [2026, 9, 2], category: "Food & Dining", amount: "45", merchant: "Talabat" }), T({ d: [2026, 9, 9], category: "Food & Dining", amount: "30", merchant: "Starbucks" }),
    T({ d: [2026, 9, 10], category: "Groceries", amount: "135.75", merchant: "Carrefour" }), T({ d: [2026, 8, 20], category: "Groceries", amount: "300", merchant: "Carrefour" }),
    T({ d: [2026, 9, 1], type: "INCOME", amount: "5000", category: "Salary" }), T({ d: [2026, 9, 14], category: "Shopping", amount: "999", merchant: "Amazon" }),
    ...monthly("Netflix", "55", "Subscriptions", [7, 8, 9]),
  ];
  const ask = (q: string) => answerQuestion(q, txs, { now }).answer;
  it("category spend", () => expect(ask("How much did I spend on food this month?")).toContain("75.00"));
  it("merchant spend across periods", () => {
    expect(ask("How much did I spend at Carrefour?")).toContain("135.75");
    expect(ask("how much did i spend at carrefour last month")).toContain("300.00");
  });
  it("biggest expense", () => expect(ask("What was my biggest expense this month?")).toContain("Amazon"));
  it("top merchants", () => expect(ask("Show my top three merchants")).toMatch(/1\. Amazon.*2\. Carrefour/));
  it("compare", () => expect(ask("Compare this month with last month")).toContain("compared with"));
  it("subscriptions", () => expect(ask("Which subscriptions do I pay for?")).toContain("Netflix"));
  it("saved", () => expect(ask("How much money did I save this month?")).toContain("saved"));
  it("unknown questions give help, and empty data is handled", () => {
    expect(ask("what's the weather")).toContain("I can answer");
    expect(answerQuestion("how much did I spend", [], { now }).answer).toContain("no transactions");
  });
  it("never mixes currencies", () => {
    const withUsd = [...txs, T({ d: [2026, 9, 3], currency: "USD", amount: "1000", category: "Food & Dining" })];
    expect(answerQuestion("how much did I spend on food this month", withUsd, { now }).answer).toContain("75.00");
  });
});

import { nextOccurrence } from "./recurring";
describe("nextOccurrence", () => {
  it("rolls forward by whole periods and keeps future dates", () => {
    expect(nextOccurrence(new Date(2026, 6, 5, 12).toISOString(), "MONTHLY", now).getMonth()).toBe(10); // 5 Nov
    expect(nextOccurrence(new Date(2026, 10, 5, 12).toISOString(), "MONTHLY", now).getMonth()).toBe(10);
    expect(nextOccurrence(new Date(2026, 0, 31, 12).toISOString(), "MONTHLY", new Date(2026, 1, 10)).getDate()).toBe(28);
  });
});
