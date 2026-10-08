import Decimal from "decimal.js";
import { fmt } from "../analytics";
import { normalizeMerchant } from "../parser/merchants";
import type { Tx } from "../types";
import { detectRecurring, monthlyCost } from "./recurring";

export type Insight = { id: string; tone: "info" | "positive" | "warning"; title: string; detail: string };

const DELIVERY = ["talabat", "deliveroo", "noon food", "careem food", "zomato", "uber eats", "swiggy"];

/** Net spend (expenses minus refunds) in [start, end), optionally filtered. Single currency only. */
export function spend(txs: Tx[], currency: string, start: Date, end: Date, pick?: (t: Tx) => boolean): Decimal {
  let total = new Decimal(0);
  for (const t of txs) {
    if (t.currency !== currency || (t.type !== "EXPENSE" && t.type !== "REFUND")) continue;
    const d = new Date(t.date);
    if (d < start || d >= end || (pick && !pick(t))) continue;
    total = t.type === "REFUND" ? total.minus(t.amount) : total.plus(t.amount);
  }
  return total;
}

const pct = (cur: Decimal, prev: Decimal) => cur.minus(prev).div(prev).times(100).abs().toDecimalPlaces(0).toNumber();

export function generateInsights(txs: Tx[], currency: string, now = new Date()): Insight[] {
  const out: Insight[] = [];
  const y = now.getFullYear(), m = now.getMonth(), day = now.getDate();
  const monthStart = new Date(y, m, 1), tomorrow = new Date(y, m, day + 1);
  // Compare like with like: this month so far vs the same days of earlier months.
  const sameDays = (back: number) => [new Date(y, m - back, 1), new Date(y, m - back, day + 1)] as const;
  const cats = [...new Set(txs.filter((t) => t.currency === currency && t.type === "EXPENSE").map((t) => t.category))];

  for (const c of cats) {
    const pick = (t: Tx) => t.category === c;
    const cur = spend(txs, currency, monthStart, tomorrow, pick);
    const [ps, pe] = sameDays(1);
    const prev = spend(txs, currency, ps, pe, pick);
    if (prev.gte(50) && !cur.eq(prev)) {
      const p = pct(cur, prev);
      if (p >= 15 && cur.gt(prev)) {
        out.push({ id: `up-${c}`, tone: "warning", title: `Your ${c} spending increased by ${p}% compared with the same point last month`, detail: `${fmt(cur, currency)} so far this month vs ${fmt(prev, currency)} at this point last month.` });
      } else if (p >= 15 && cur.lt(prev)) {
        out.push({ id: `dn-${c}`, tone: "positive", title: `Your ${c} spending is down ${p}% compared with the same point last month`, detail: `${fmt(cur, currency)} vs ${fmt(prev, currency)}.` });
      }
    }

    const avg = [1, 2, 3].reduce((s, b) => s.plus(spend(txs, currency, ...sameDays(b), pick)), new Decimal(0)).div(3);
    if (avg.gte(50) && cur.lt(avg.times(0.8)) && cur.gt(0)) out.push({ id: `avg-${c}`, tone: "positive", title: `Your ${c} spending is lower than your three-month average`, detail: `${fmt(cur, currency)} so far vs an average of ${fmt(avg, currency)} at this point in the last three months.` });
  }

  const delivery = spend(txs, currency, monthStart, tomorrow, (t) => DELIVERY.some((d) => normalizeMerchant(t.merchant).startsWith(d)));
  if (delivery.gt(0)) out.push({ id: "delivery", tone: "info", title: `You spent ${fmt(delivery, currency)} on food delivery this month`, detail: "Counting Talabat, Deliveroo, Noon Food, Careem Food, Zomato, Uber Eats and Swiggy." });

  const recurring = detectRecurring(txs, now).filter((r) => r.currency === currency);
  const subs = recurring.filter((r) => r.category === "Subscriptions");
  if (subs.length) {
    const total = subs.reduce((s, r) => s.plus(monthlyCost(r.amount, r.frequency)), new Decimal(0));
    out.push({ id: "subs", tone: "info", title: `Your subscriptions cost ${fmt(total, currency)} per month`, detail: subs.map((r) => `${r.merchant} ${fmt(r.amount, currency)}/${r.frequency.toLowerCase().replace("ly", "").replace("month", "mo")}`).join(" · ") });
  }

  // Unusual: a recent expense far above the typical size for its category.
  const cutoff = new Date(+now - 30 * 864e5);
  for (const c of cats) {
    const hist = txs.filter((t) => t.currency === currency && t.type === "EXPENSE" && t.category === c).map((t) => ({ t, a: Number(t.amount) }));
    if (hist.length < 6) continue;
    const sorted = hist.map((h) => h.a).sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    for (const { t, a } of hist) {
      if (new Date(t.date) >= cutoff && a >= 100 && a > med * 4) {
        out.push({ id: `odd-${t.id}`, tone: "warning", title: `Unusual expense: ${fmt(a, currency)}${t.merchant ? ` at ${t.merchant}` : ""}`, detail: `That's about ${Math.round(a / med)}× the typical ${c} purchase of ${fmt(med, currency)}.` });
      }
    }
  }

  let income = new Decimal(0);
  for (const t of txs) {
    if (t.currency !== currency) continue;
    const d = new Date(t.date);
    if (d < monthStart || d >= tomorrow) continue;
    if (t.type === "INCOME") income = income.plus(t.amount);
  }
  const expenses = spend(txs, currency, monthStart, tomorrow);
  if (income.gt(0)) {
    const rate = income.minus(expenses).div(income).times(100).toDecimalPlaces(0).toNumber();
    out.push(rate < 0
      ? { id: "save", tone: "warning", title: "You've spent more than you earned this month", detail: `Income ${fmt(income, currency)}, spending ${fmt(expenses, currency)}.` }
      : { id: "save", tone: rate >= 20 ? "positive" : "info", title: `You've saved ${rate}% of your income this month`, detail: `${fmt(income.minus(expenses), currency)} left from ${fmt(income, currency)}.${rate < 20 ? " A common target is 20%." : ""}` });
  }
  return out;
}
