import { describe, expect, it } from "vitest";
import { transactionMessage } from "./push-core";

const base = { amount: "45.00", currency: "AED" as const, category: "Food & Dining", merchant: "Talabat" };

describe("transactionMessage", () => {
  it("debit for expenses, with amount, category and merchant", () => {
    const m = transactionMessage({ ...base, type: "EXPENSE" });
    expect(m?.title).toMatch(/^Debited .*45\.00/);
    expect(m?.body).toBe("Food & Dining · Talabat");
  });
  it("credit for income and refunds", () => {
    expect(transactionMessage({ ...base, type: "INCOME", category: "Salary", merchant: "" })).toMatchObject({ title: expect.stringMatching(/^Credited /), body: "Salary" });
    expect(transactionMessage({ ...base, type: "REFUND" })?.title).toMatch(/^Credited /);
  });
  it("no alert for transfers, card payments and adjustments", () => {
    for (const type of ["TRANSFER", "CARD_PAYMENT", "ADJUSTMENT"] as const) expect(transactionMessage({ ...base, type })).toBeNull();
  });
});
