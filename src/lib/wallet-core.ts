import { createHmac } from "node:crypto";
import { parseMessage } from "./parser/parse";
import { CURRENCIES, type Tx } from "./types";

type Currency = Tx["currency"];

const SYMBOLS: Record<string, Currency> = { "$": "USD", "€": "EUR", "£": "GBP", "₹": "INR", "د.إ": "AED" };

/** Turns what the Shortcut sends ("AED 1,250.50", "$12.30", 45) into a plain amount and a supported currency. */
export function parseWalletAmount(raw: unknown): { amount: string; currency: Currency } | { error: string } {
  const text = String(raw ?? "").trim();
  const num = text.match(/\d[\d.,\s]*/)?.[0].replace(/\s/g, "");
  if (!num) return { error: "No amount found" };
  // "1.250,50" and "1,250.50" both mean one thousand two hundred fifty and a half; "12,50" is 12.50.
  const lastDot = num.lastIndexOf("."), lastComma = num.lastIndexOf(",");
  let clean = num;
  if (lastDot >= 0 && lastComma >= 0) clean = lastComma > lastDot ? num.replace(/\./g, "").replace(",", ".") : num.replace(/,/g, "");
  else if (lastComma >= 0) clean = /,\d{1,2}$/.test(num) && num.indexOf(",") === lastComma ? num.replace(",", ".") : num.replace(/,/g, "");
  const value = Number(clean.replace(/[.,]$/, ""));
  if (!Number.isFinite(value) || value <= 0 || value >= 1e12) return { error: "Invalid amount" };

  const code = text.match(/\b([A-Za-z]{3})\b/)?.[1].toUpperCase();
  let currency: Currency | undefined = (CURRENCIES as readonly string[]).includes(code ?? "") ? (code as Currency) : undefined;
  if (!currency) for (const [sym, cur] of Object.entries(SYMBOLS)) if (text.includes(sym)) { currency = cur; break; }
  if (!currency && code) return { error: `Unsupported currency ${code}` }; // a currency code we can't store
  return { amount: value.toFixed(2), currency: currency ?? "AED" };
}

/**
 * What the iPhone sends can vary, so this reads it generously: a JSON object, "Amount: AED 45 / Merchant: X" pairs,
 * three plain lines (amount, merchant, card), or a sentence like "AED 45.00 at Talabat".
 */
export function bodyFromText(text: string): Record<string, unknown> {
  const t = text.trim();
  if (t.startsWith("{")) { try { return JSON.parse(t); } catch {} }
  const lines = t.split(/\r?\n|\|/).map((l) => l.trim()).filter(Boolean);

  const labelled: Record<string, string> = {};
  for (const l of lines) {
    const m = l.match(/^([A-Za-z][A-Za-z ]{1,20})\s*[:=]\s*(.+)$/);
    if (m) labelled[m[1].trim()] = m[2].trim();
  }
  if (Object.keys(labelled).length) return labelled;

  // One sentence ("Paid AED 45.00 at Talabat"): borrow the bank-message reader.
  if (lines.length === 1 && /[A-Za-z]{3,}.*\d|\d.*[A-Za-z]{3,}/.test(lines[0]) && !/^[^A-Za-z]*[A-Z]{3}?\s?[\d.,]+$/.test(lines[0])) {
    const m = parseMessage(lines[0]);
    if (m.isTransaction && m.amount) return { amount: m.amount, currency: m.currency, merchant: m.merchant };
  }
  const [amount = "", merchant = "", card = ""] = lines;
  return { amount, merchant, card };
}

export type WalletPayload = { amount: string; currency: Currency; merchant: string; card: string };

/** Accepts the JSON body (or form fields) the Shortcut sends. Field names are matched loosely. */
export function parseWalletPayload(body: Record<string, unknown>): WalletPayload | { error: string } {
  const pick = (...names: string[]) => {
    for (const k of Object.keys(body)) if (names.includes(k.toLowerCase().replace(/[\s_-]/g, ""))) return body[k];
    return undefined;
  };
  const amount = parseWalletAmount(pick("amount", "total", "price"));
  if ("error" in amount) return amount;
  const merchant = String(pick("merchant", "name", "store", "shop") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const card = String(pick("card", "cardorpass", "pass") ?? "").trim().slice(0, 80);
  const explicit = String(pick("currency") ?? "").trim().toUpperCase();
  const currency = (CURRENCIES as readonly string[]).includes(explicit) ? (explicit as Currency) : amount.currency;
  return { amount: amount.amount, currency, merchant, card };
}

/** The key for a user whose key was created at this moment. Same inputs always give the same key. */
export function deriveWalletKey(secret: string, userId: string, createdAt: Date) {
  const sig = createHmac("sha256", secret).update(`wallet:${userId}:${createdAt.getTime()}`).digest("base64url");
  return `etw_${userId}_${sig}`;
}

/** The user id a key claims to be for, or null if it isn't shaped like a key. */
export const walletKeyUser = (key: string) => key.match(/^etw_([0-9a-f-]{36})_[A-Za-z0-9_-]{43}$/)?.[1] ?? null;
