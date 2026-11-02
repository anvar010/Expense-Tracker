import { describe, expect, it } from "vitest";
import { bodyFromText, deriveWalletKey, parseWalletAmount, parseWalletPayload, walletKeyUser } from "./wallet-core";

describe("parseWalletAmount", () => {
  it.each([
    ["AED 45.00", "45.00", "AED"],
    ["45", "45.00", "AED"],
    ["$12.30", "12.30", "USD"],
    ["€9,99", "9.99", "EUR"],
    ["AED 1,250.50", "1250.50", "AED"],
    ["1.250,50 EUR", "1250.50", "EUR"],
    [12.5, "12.50", "AED"],
  ])("%s", (raw, amount, currency) => expect(parseWalletAmount(raw)).toEqual({ amount, currency }));

  it("rejects nothing, zero and unsupported currencies", () => {
    expect(parseWalletAmount("")).toHaveProperty("error");
    expect(parseWalletAmount("AED 0")).toHaveProperty("error");
    expect(parseWalletAmount("SAR 20")).toHaveProperty("error");
  });
});

describe("parseWalletPayload", () => {
  it("reads loosely named fields", () => {
    expect(parseWalletPayload({ Amount: "AED 38.30", Merchant: "  Al   Madhina ", "Card or Pass": "Visa 1234" })).toEqual({ amount: "38.30", currency: "AED", merchant: "Al Madhina", card: "Visa 1234" });
  });
  it("needs an amount", () => expect(parseWalletPayload({ merchant: "x" })).toHaveProperty("error"));
});

describe("bodyFromText", () => {
  it("reads amount, merchant and card from lines", () => {
    expect(parseWalletPayload(bodyFromText("AED 38.30\nAl Madhina\nVisa 1234\n"))).toEqual({ amount: "38.30", currency: "AED", merchant: "Al Madhina", card: "Visa 1234" });
  });
  it("reads labelled lines and a plain sentence", () => {
    expect(parseWalletPayload(bodyFromText("Amount: AED 45.00\nMerchant: Talabat\nCard or Pass: Visa 1234"))).toEqual({ amount: "45.00", currency: "AED", merchant: "Talabat", card: "Visa 1234" });
    expect(parseWalletPayload(bodyFromText("AED 45.00 spent at TALABAT"))).toMatchObject({ amount: "45.00", currency: "AED" });
  });
  it("also takes | separators and JSON", () => {
    expect(bodyFromText("12.5 | Cafe | Mastercard")).toEqual({ amount: "12.5", merchant: "Cafe", card: "Mastercard" });
    expect(bodyFromText('{"amount":"7","merchant":"X"}')).toEqual({ amount: "7", merchant: "X" });
  });
});

describe("wallet key", () => {
  const secret = "x".repeat(40), user = "123e4567-e89b-12d3-a456-426614174000", at = new Date("2026-11-02T10:00:00.123Z");
  it("is the same every time, so it can be shown again", () => expect(deriveWalletKey(secret, user, at)).toBe(deriveWalletKey(secret, user, new Date(at))));
  it("changes when re-created, or with another secret or user", () => {
    const k = deriveWalletKey(secret, user, at);
    expect(deriveWalletKey(secret, user, new Date(at.getTime() + 1))).not.toBe(k);
    expect(deriveWalletKey("y".repeat(40), user, at)).not.toBe(k);
    expect(deriveWalletKey(secret, "223e4567-e89b-12d3-a456-426614174000", at)).not.toBe(k);
  });
  it("names its user and rejects anything else", () => {
    expect(walletKeyUser(deriveWalletKey(secret, user, at))).toBe(user);
    expect(walletKeyUser("etw_nope")).toBeNull();
    expect(walletKeyUser("")).toBeNull();
  });
  it("reads a lone amount line", () => expect(parseWalletPayload(bodyFromText("AED 45.00"))).toMatchObject({ amount: "45.00", merchant: "" }));
});
