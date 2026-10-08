import { describe, expect, it } from "vitest";
import { accountBalance, cardUtilization, nextDueDate, reconciliationDifference } from "./balances";
import { summarize } from "./analytics";
import { accountInputSchema, txInputSchema, type Account, type Tx } from "./types";

const acc = (o: Partial<Account>): Account => ({
  id: "a", name: "Main", bankName: "", type: "BANK", currency: "AED", openingBalance: "1000",
  creditLimit: "", maskedReference: "", minPayment: "", active: true, ...o,
});
const tx = (o: Partial<Tx>): Tx => ({
  id: crypto.randomUUID(), amount: "100", currency: "AED", type: "EXPENSE", category: "Other",
  merchant: "", notes: "", date: "2026-10-01T10:00:00.000Z", ...o,
});

describe("accountBalance", () => {
  it("bank: opening + income − expenses", () => {
    const b = accountBalance(acc({}), [
      tx({ accountId: "a", type: "INCOME", amount: "500" }),
      tx({ accountId: "a", amount: "120.10" }),
      tx({ accountId: "a", type: "REFUND", amount: "20.10" }),
      tx({ accountId: "other", amount: "999" }),
    ]);
    expect(b.toString()).toBe("1400");
  });
  it("card purchases raise what is owed, and do not touch the bank balance until paid", () => {
    const bank = acc({ id: "bank" });
    const card = acc({ id: "card", type: "CREDIT_CARD", openingBalance: "0", creditLimit: "5000" });
    const txs = [tx({ accountId: "card", amount: "300" })];
    expect(accountBalance(card, txs).toString()).toBe("300");
    expect(accountBalance(bank, txs).toString()).toBe("1000");
  });
  it("card payment moves money bank→card once, and is not spending", () => {
    const bank = acc({ id: "bank" });
    const card = acc({ id: "card", type: "CREDIT_CARD", openingBalance: "0", creditLimit: "5000" });
    const txs = [
      tx({ accountId: "card", amount: "300" }),
      tx({ type: "CARD_PAYMENT", amount: "300", accountId: "bank", toAccountId: "card" }),
    ];
    expect(accountBalance(card, txs).toString()).toBe("0");
    expect(accountBalance(bank, txs).toString()).toBe("700");
    expect(summarize(txs, "AED").expenses.toString()).toBe("300"); // not 600
  });
  it("internal transfer conserves money", () => {
    const a = acc({ id: "a" }), b = acc({ id: "b", openingBalance: "0" });
    const txs = [tx({ type: "TRANSFER", amount: "250", accountId: "a", toAccountId: "b" })];
    expect(accountBalance(a, txs).plus(accountBalance(b, txs)).toString()).toBe("1000");
  });
  it("ignores other currencies", () => {
    expect(accountBalance(acc({}), [tx({ accountId: "a", currency: "USD", amount: "50" })]).toString()).toBe("1000");
  });
  it("reconciliation adjustment makes the computed balance match the bank", () => {
    const base = [tx({ accountId: "a", amount: "100" })];
    const diff = reconciliationDifference("880.50", accountBalance(acc({}), base));
    const after = accountBalance(acc({}), [...base, tx({ type: "ADJUSTMENT", accountId: "a", amount: diff.toString() })]);
    expect(after.toString()).toBe("880.5");
  });
});

describe("card helpers and validation", () => {
  it("utilization", () => {
    const card = acc({ type: "CREDIT_CARD", creditLimit: "4000", openingBalance: "0" });
    expect(cardUtilization(card, accountBalance(card, [tx({ accountId: "a", amount: "1000" })]).plus(0))).toBe(25);
  });
  it("next due date rolls to next month and clamps to month length", () => {
    expect(nextDueDate(5, new Date(2026, 9, 8)).getMonth()).toBe(10);
    expect(nextDueDate(31, new Date(2026, 1, 10)).getDate()).toBe(28);
  });
  it("rejects full card numbers and negative non-adjustments", () => {
    expect(accountInputSchema.safeParse({ name: "x", type: "BANK", currency: "AED", maskedReference: "4111111111111111" }).success).toBe(false);
    const base = { currency: "AED", category: "Other", date: new Date().toISOString() };
    expect(txInputSchema.safeParse({ ...base, type: "EXPENSE", amount: "-5" }).success).toBe(false);
    expect(txInputSchema.safeParse({ ...base, type: "ADJUSTMENT", amount: "-5" }).success).toBe(true);
  });
});
