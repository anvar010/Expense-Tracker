import { describe, expect, it } from "vitest";
import { categorize, type CategoryRule } from "./categorize";
import { extractDate, findDuplicate, parseMessage } from "./parse";
import type { Tx } from "../types";

describe("parseMessage: spec examples", () => {
  it("card debit with merchant, date, ref and balance", () => {
    const r = parseMessage("Your card ending 1234 was debited AED 45.00 at TALABAT on 08/10/2026. Available balance AED 2,450.00.");
    expect(r).toMatchObject({
      isTransaction: true, type: "EXPENSE", amount: "45.00", currency: "AED", merchant: "Talabat",
      category: "Food & Dining", accountRef: "1234", balance: "2450.00", needsReview: false, templateId: "card-debit-at-merchant",
    });
    const d = new Date(r.date);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 8]);
  });
  it("card spend at Carrefour", () => {
    const r = parseMessage("AED 135.75 spent using your card at CARREFOUR UAE.");
    expect(r).toMatchObject({ type: "EXPENSE", amount: "135.75", merchant: "Carrefour", category: "Groceries", needsReview: false });
  });
  it("salary credit", () => {
    const r = parseMessage("Salary credit of AED 5000 received in your account.");
    expect(r).toMatchObject({ type: "INCOME", amount: "5000", category: "Salary", needsReview: false });
  });
  it("transfer", () => {
    const r = parseMessage("AED 200 transferred from your account to another account.");
    expect(r).toMatchObject({ type: "TRANSFER", amount: "200", category: "Transfers", needsReview: false });
  });
});

describe("parseMessage: safety and edge cases", () => {
  it("ignores OTP messages", () => {
    const r = parseMessage("Your OTP for AED 500 payment at AMAZON is 482913. Do not share.");
    expect(r.isTransaction).toBe(false);
  });
  it("ignores non-financial text", () => {
    expect(parseMessage("Hey, lunch at 1pm?").isTransaction).toBe(false);
    expect(parseMessage("").isTransaction).toBe(false);
  });
  it("does not treat the balance as the amount", () => {
    const r = parseMessage("Available balance AED 9,999.00. AED 12.50 debited at ENOC on 01/10/2026.");
    expect(r.amount).toBe("12.50");
  });
  it("handles Rs. and thousands separators", () => {
    const r = parseMessage("Rs. 1,250.50 debited from a/c XX4321 at ZOMATO on 05-10-2026");
    expect(r).toMatchObject({ currency: "INR", amount: "1250.50", accountRef: "4321" });
  });
  it("sends ambiguous merchants to review (Amazon, Careem)", () => {
    expect(parseMessage("AED 80 spent at AMAZON.AE on 02/10/2026").needsReview).toBe(true);
    expect(parseMessage("AED 25 spent at CAREEM on 02/10/2026").needsReview).toBe(true);
  });
  it("Careem Ride is confidently Transportation", () => {
    const r = parseMessage("AED 25 spent at CAREEM RIDE on 02/10/2026");
    expect(r).toMatchObject({ category: "Transportation", needsReview: false });
  });
  it("unknown merchant needs review", () => {
    expect(parseMessage("AED 99 debited at XYZ TRADING on 02/10/2026").needsReview).toBe(true);
  });
  it("amount without a transaction verb is not a transaction", () => {
    expect(parseMessage("Your bill of AED 300 is due soon").isTransaction).toBe(false);
  });
  it("assumes received date when none present", () => {
    const r = parseMessage("AED 135.75 spent using your card at CARREFOUR UAE.", { receivedAt: new Date(2026, 0, 5, 9) });
    expect(r.dateAssumed).toBe(true);
  });
});

describe("extractDate", () => {
  it("day-first by default and validates", () => {
    expect(new Date(extractDate("on 13/10/2026")!.iso).getMonth()).toBe(9);
    expect(extractDate("on 31/02/2026")).toBeNull();
  });
  it("month names and ISO", () => {
    expect(new Date(extractDate("08-Oct-2026")!.iso).getDate()).toBe(8);
    expect(new Date(extractDate("2026-10-08")!.iso).getMonth()).toBe(9);
  });
});

describe("categorize priority", () => {
  const rule = (o: Partial<CategoryRule>): CategoryRule => ({ id: "1", pattern: "talabat", category: "Entertainment", source: "rule", enabled: true, ...o });
  it("user rule beats known merchant", () => {
    expect(categorize({ merchant: "Talabat", type: "EXPENSE" }, [rule({})])).toMatchObject({ category: "Entertainment", source: "rule", confidence: 1 });
  });
  it("user rule beats earlier correction; disabled rules ignored", () => {
    const rules = [rule({ source: "correction", category: "Shopping" }), rule({ category: "Education" })];
    expect(categorize({ merchant: "Talabat", type: "EXPENSE" }, rules).category).toBe("Education");
    expect(categorize({ merchant: "Talabat", type: "EXPENSE" }, [rule({ enabled: false })]).category).toBe("Food & Dining");
  });
  it("falls back to description keywords, then Other", () => {
    expect(categorize({ merchant: "Al Noor Pharmacy", type: "EXPENSE" }).category).toBe("Healthcare");
    expect(categorize({ merchant: "Zzz", type: "EXPENSE" })).toMatchObject({ category: "Other", confidence: 0.3 });
  });
});

describe("findDuplicate", () => {
  const existing: Tx = { id: "1", amount: "45.00", currency: "AED", type: "EXPENSE", category: "Food & Dining", merchant: "Talabat", notes: "", date: new Date(2026, 9, 8, 12).toISOString() };
  const cand = { amount: "45", currency: "AED", date: new Date(2026, 9, 8, 20).toISOString(), merchant: "TALABAT" };
  it("matches same amount/day/merchant", () => expect(findDuplicate(cand, [existing])).toBe(existing));
  it("does not match different amount or currency", () => {
    expect(findDuplicate({ ...cand, amount: "46" }, [existing])).toBeUndefined();
    expect(findDuplicate({ ...cand, currency: "USD" }, [existing])).toBeUndefined();
  });
});

import { cleanMerchantRaw, containsSecurityCode } from "./parse";

describe("bank emails (Mashreq)", () => {
  const email = `Dear Customer,

Thank you for banking with Mashreq Bank.

Please note the details of a recent transaction on your Mashreq Card.

Your NEO VISA Debit Card Card ending with 7666 was used for a purchase of AED 6.00 at AL SHAHAMA SUPERMARKET DUBAI AE on 09-OCT-2026 02:04 PM. Available limit is AED  1000

This is a system generated alert. We request you not to reply to this message.`;
  const footer = "\n\nMashreq will never ask for your PIN, OTP or password over email or phone. Never share them with anyone.";

  it("parses amount, card, date, merchant and category", () => {
    const r = parseMessage(email);
    expect(r).toMatchObject({ type: "EXPENSE", amount: "6.00", currency: "AED", merchant: "Al Shahama Supermarket", category: "Groceries", accountRef: "7666", balance: "1000", needsReview: false });
    const d = new Date(r.date);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 9]);
  });
  it("is not rejected by a security disclaimer that only mentions PIN/OTP/password", () => {
    expect(parseMessage(email + footer)).toMatchObject({ isTransaction: true, amount: "6.00" });
  });
});

describe("security code detection", () => {
  it("flags messages that deliver a code", () => {
    for (const t of ["Your OTP is 482913", "482913 is your verification code", "Use one-time password 7391 to approve AED 50", "CVV: 123", "Your OTP for AED 500 payment at AMAZON is 482913"])
      expect(containsSecurityCode(t)).toBe(true);
  });
  it("lets through messages that merely mention them", () => {
    for (const t of ["We will never ask for your PIN, OTP or password.", "Never share your OTP with anyone. AED 45.00 debited at TALABAT"])
      expect(containsSecurityCode(t)).toBe(false);
  });
});

describe("cleanMerchantRaw", () => {
  it("drops trailing city and country but keeps real names", () => {
    expect(cleanMerchantRaw("AL SHAHAMA SUPERMARKET DUBAI AE")).toBe("AL SHAHAMA SUPERMARKET");
    expect(cleanMerchantRaw("SPINNEYS ABU DHABI AE")).toBe("SPINNEYS");
    expect(cleanMerchantRaw("TALABAT")).toBe("TALABAT");
    expect(cleanMerchantRaw("DUBAI")).toBe("DUBAI");
  });
});
