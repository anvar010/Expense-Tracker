import type { Tx, TxType } from "../types";
import { categorize, AUTO_THRESHOLD, type CategoryRule } from "./categorize";
import { findKnownMerchant, normalizeMerchant, titleCase } from "./merchants";
import { TEMPLATES } from "./templates";

export type ParsedMessage = {
  isTransaction: boolean;
  reason?: string;
  type?: TxType;
  amount?: string;
  currency?: "AED" | "USD" | "INR" | "EUR" | "GBP";
  merchant: string;
  category: string;
  date: string; // ISO
  dateAssumed: boolean;
  accountRef?: string;
  balance?: string;
  confidence: number; // parsing confidence
  categoryConfidence: number;
  templateId?: string;
  needsReview: boolean;
};

const CURRENCY_MAP: Record<string, ParsedMessage["currency"]> = {
  AED: "AED", DH: "AED", DHS: "AED", USD: "USD", $: "USD", INR: "INR", RS: "INR", "₹": "INR",
  EUR: "EUR", "€": "EUR", GBP: "GBP", "£": "GBP",
};
const CUR = String.raw`(AED|DHS?\.?|USD|INR|RS\.?|EUR|GBP|\$|₹|€|£)`;
const AMT = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const normalizeMessage = (s: string) => s.replace(/\s+/g, " ").trim();

const currencyOf = (token: string) => CURRENCY_MAP[token.toUpperCase().replace(/\.$/, "")];

export function extractAmounts(text: string) {
  const found: { amount: string; currency: NonNullable<ParsedMessage["currency"]>; index: number; isBalance: boolean }[] = [];
  const push = (m: RegExpMatchArray, cur: string, amt: string) => {
    const currency = currencyOf(cur);
    if (!currency) return;
    const idx = m.index ?? 0;
    const before = text.slice(Math.max(0, idx - 28), idx);
    found.push({
      amount: amt.replace(/,/g, ""), currency, index: idx,
      isBalance: /(balance|bal|limit|avl|available)\W*(?:is|of|:)?\W*$/i.test(before),
    });
  };
  for (const m of text.matchAll(new RegExp(`${CUR}\\s?${AMT}`, "gi"))) push(m, m[1], m[2]);
  if (!found.length) for (const m of text.matchAll(new RegExp(`${AMT}\\s?${CUR}\\b`, "gi"))) push(m, m[2], m[1]);
  return found;
}

export function extractDate(text: string, dayFirst = true): { iso: string } | null {
  const make = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    const dt = new Date(y, m - 1, d, 12);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? { iso: dt.toISOString() } : null;
  };
  let m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return make(+m[1], +m[2], +m[3]);
  m = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (m) return dayFirst ? make(+m[3], +m[2], +m[1]) ?? make(+m[3], +m[1], +m[2]) : make(+m[3], +m[1], +m[2]) ?? make(+m[3], +m[2], +m[1]);
  m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    return (dayFirst ? make(y, b, a) ?? make(y, a, b) : make(y, a, b) ?? make(y, b, a));
  }
  m = text.match(/\b(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(\d{2,4})\b/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return make(+m[3], mi + 1, +m[1]);
  }
  return null;
}

export function detectType(text: string): TxType | undefined {
  const t = text.toLowerCase();
  if (/refund|reversal|reversed|cashback/.test(t)) return "REFUND";
  if (/credit card payment|payment (?:received )?(?:towards|for|to|on) (?:your )?(?:credit )?card|card payment received/.test(t)) return "CARD_PAYMENT";
  if (/transfer/.test(t)) return /credited|received|deposited/.test(t) && !/from your account/.test(t) ? "INCOME" : "TRANSFER";
  if (/debited|spent|purchase|paid|payment of|withdrawn|withdrawal|charged|deducted|\bpos\b/.test(t)) return "EXPENSE";
  if (/credited|received|deposit|salary|credit of/.test(t)) return "INCOME";
  return undefined;
}

export function extractMerchant(text: string): string {
  const m = text.match(
    /(?:\bat\b|@|\bpaid to\b|\bpurchase from\b)\s+((?:[^.,;]|\.(?=[A-Za-z0-9]))+?)(?=\s+(?:on|dated|date|from|using|with|via|ref|avl|avail|available|bal|balance)\b|[.,;]|$)/i,
  );
  const raw = m?.[1]?.trim() ?? "";
  return /^(your|the|a|an)\b/i.test(raw) ? "" : raw;
}

export function extractAccountRef(text: string): string | undefined {
  return (
    text.match(/(?:ending|ends)(?:\s+with|\s+in)?\s*[:-]?\s*(\d{4})\b/i)?.[1] ??
    text.match(/(?:card|a\/c|acct|account)\s*(?:no\.?\s*)?[x*•]+(\d{4})\b/i)?.[1]
  );
}

const SECRET = /\b(otp|one[- ]?time (?:password|code)|verification code|cvv|pin)\b/i;

export type ParseOptions = { rules?: CategoryRule[]; dayFirst?: boolean; receivedAt?: Date };

export function parseMessage(raw: string, opts: ParseOptions = {}): ParsedMessage {
  const empty = (reason: string): ParsedMessage => ({
    isTransaction: false, reason, merchant: "", category: "Other", date: new Date().toISOString(),
    dateAssumed: true, confidence: 0, categoryConfidence: 0, needsReview: false,
  });
  const text = normalizeMessage(raw);
  if (!text) return empty("Empty message");
  if (SECRET.test(text)) return empty("Contains an OTP or security code, so it was ignored");

  const amounts = extractAmounts(text);
  const main = amounts.find((a) => !a.isBalance);
  if (!main) return empty("No transaction amount found");

  const template = TEMPLATES.map((t) => ({ t, m: text.match(t.pattern) })).find((x) => x.m);
  const g = template?.m?.groups ?? {};

  const type = (template?.t.type ?? detectType(text)) as TxType | undefined;
  if (!type && !/\b(debit|credit|spent|paid|transfer|purchase|withdraw|salary|refund|deposit)/i.test(text)) {
    return empty("Doesn't look like a bank transaction");
  }

  const merchantRaw = (g.merchant ?? extractMerchant(text)).trim();
  const known = merchantRaw ? findKnownMerchant(merchantRaw) : undefined;
  const merchant = known?.display ?? (merchantRaw ? titleCase(merchantRaw) : "");

  const parsedDate = extractDate(text, opts.dayFirst ?? true);
  const balance = amounts.find((a) => a.isBalance)?.amount;
  const accountRef = g.last4 ?? extractAccountRef(text);

  const resolvedType = type ?? "EXPENSE";
  const cat = categorize({ merchant, description: text, type: resolvedType }, opts.rules);

  let confidence = 0.4;
  if (type) confidence += 0.25;
  if (resolvedType !== "EXPENSE" || merchant) confidence += 0.15;
  if (parsedDate) confidence += 0.1;
  if (accountRef || balance) confidence += 0.1;
  if (template) confidence = Math.min(1, confidence + 0.1);
  confidence = Math.round(confidence * 100) / 100;

  return {
    isTransaction: true,
    type: resolvedType,
    amount: main.amount,
    currency: main.currency,
    merchant,
    category: cat.category,
    date: parsedDate?.iso ?? (opts.receivedAt ?? new Date()).toISOString(),
    dateAssumed: !parsedDate,
    accountRef,
    balance,
    confidence,
    categoryConfidence: cat.confidence,
    templateId: template?.t.id,
    needsReview: !type || confidence < AUTO_THRESHOLD || cat.confidence < AUTO_THRESHOLD,
  };
}

/** Same currency + amount + calendar day, and the same merchant (or one side unknown). */
export function findDuplicate(c: { amount: string; currency: string; date: string; merchant: string }, existing: Tx[]) {
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA");
  const m = normalizeMerchant(c.merchant);
  return existing.find((t) => {
    const tm = normalizeMerchant(t.merchant);
    return t.currency === c.currency && Number(t.amount) === Number(c.amount) && day(t.date) === day(c.date) && (!m || !tm || m === tm);
  });
}
