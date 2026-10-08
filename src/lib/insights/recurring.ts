import Decimal from "decimal.js";
import { normalizeMerchant } from "../parser/merchants";
import type { Tx } from "../types";

export type RecurringSuggestion = {
  key: string;
  merchant: string;
  category: string;
  currency: string;
  amount: string;
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  occurrences: number;
  lastDate: string;
  nextDue: string;
  confidence: number;
};

const DAY = 864e5;
const BANDS = { WEEKLY: [6, 8], MONTHLY: [27, 34], YEARLY: [350, 380] } as const;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function addPeriod(d: Date, f: RecurringSuggestion["frequency"]) {
  if (f === "WEEKLY") return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 12);
  if (f === "YEARLY") return new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(), 12);
  const last = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), last), 12);
}

/**
 * Finds same-merchant, similar-amount (±5%) expenses that repeat on a weekly, monthly or yearly rhythm.
 * Results are only suggestions; the user confirms them.
 */
export function detectRecurring(txs: Tx[], now = new Date()): RecurringSuggestion[] {
  const groups = new Map<string, Tx[]>();
  for (const t of txs) {
    if (t.type !== "EXPENSE" || !t.merchant) continue;
    const k = `${t.currency}|${normalizeMerchant(t.merchant)}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  const out: RecurringSuggestion[] = [];
  for (const [key, list] of groups) {
    const med = median(list.map((t) => Number(t.amount)));
    const same = list.filter((t) => Math.abs(Number(t.amount) - med) <= med * 0.05).sort((a, b) => a.date.localeCompare(b.date));
    if (same.length < 2) continue;

    const times = same.map((t) => +new Date(t.date));
    const gaps = times.slice(1).map((x, i) => (x - times[i]) / DAY);
    const mid = median(gaps);
    const frequency = (Object.keys(BANDS) as (keyof typeof BANDS)[]).find((f) => mid >= BANDS[f][0] && mid <= BANDS[f][1]);
    if (!frequency) continue;
    const [lo, hi] = BANDS[frequency];
    const consistent = gaps.filter((g) => g >= lo - 2 && g <= hi + 2).length / gaps.length;
    const enough = frequency === "YEARLY" ? same.length >= 2 : same.length >= 3;
    if (!enough || consistent < 0.7) continue;

    const last = new Date(same[same.length - 1].date);
    const nextDue = addPeriod(last, frequency);
    // Stopped long ago: a subscription that hasn't charged for two periods is probably cancelled.
    if (+addPeriod(nextDue, frequency) < +now) continue;

    out.push({
      key, merchant: same[same.length - 1].merchant, category: same[same.length - 1].category, currency: same[0].currency,
      amount: new Decimal(med).toFixed(2), frequency, occurrences: same.length, lastDate: last.toISOString(),
      nextDue: nextDue.toISOString(), confidence: Math.min(1, Math.round((0.5 + 0.08 * same.length + 0.3 * consistent) * 100) / 100),
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Monthly-equivalent cost of a recurring payment. */
export function monthlyCost(amount: string, frequency: RecurringSuggestion["frequency"]): Decimal {
  const a = new Decimal(amount);
  return frequency === "MONTHLY" ? a : frequency === "WEEKLY" ? a.times(52).div(12) : a.div(12);
}

/** The next due date on or after `from`, rolling a stored date forward by whole periods. */
export function nextOccurrence(due: string, frequency: RecurringSuggestion["frequency"], from = new Date()): Date {
  let d = new Date(due);
  const floor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 1000 && d < floor; i++) d = addPeriod(d, frequency);
  return d;
}
