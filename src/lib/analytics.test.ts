import { describe, expect, it } from "vitest";
import { summarize } from "./analytics";
import type { Tx } from "./types";

const base = { merchant: "", notes: "", date: "2026-10-01T10:00:00.000Z" };
const tx = (o: Partial<Tx>): Tx => ({ id: crypto.randomUUID(), amount: "1", currency: "AED", type: "EXPENSE", category: "Other", ...base, ...o });

describe("summarize", () => {
  it("uses exact decimal math", () => {
    const s = summarize([tx({ amount: "0.10" }), tx({ amount: "0.20" })], "AED");
    expect(s.expenses.toString()).toBe("0.3");
  });
  it("never mixes currencies", () => {
    const s = summarize([tx({ amount: "100" }), tx({ amount: "50", currency: "USD" })], "AED");
    expect(s.expenses.toString()).toBe("100");
    expect(s.count).toBe(1);
  });
  it("excludes transfers and card payments from spending, subtracts refunds", () => {
    const s = summarize([
      tx({ amount: "100" }), tx({ amount: "30", type: "REFUND" }),
      tx({ amount: "500", type: "TRANSFER" }), tx({ amount: "400", type: "CARD_PAYMENT" }),
      tx({ amount: "1000", type: "INCOME", category: "Salary" }),
    ], "AED");
    expect(s.expenses.toString()).toBe("70");
    expect(s.savings.toString()).toBe("930");
    expect(s.savingsRate).toBe(93);
  });
});
