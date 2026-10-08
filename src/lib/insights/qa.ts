import Decimal from "decimal.js";
import { fmt } from "../analytics";
import { normalizeMerchant } from "../parser/merchants";
import { DEFAULT_CATEGORIES, type Tx } from "../types";
import { spend } from "./engine";
import { detectRecurring, monthlyCost } from "./recurring";

export type Answer = { answer: string; facts: string };

type Range = { label: string; start: Date; end: Date };
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function periodFrom(q: string, now: Date): Range {
  const t = dayStart(now);
  const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const monday = add(t, -((t.getDay() + 6) % 7));
  if (/\btoday\b/.test(q)) return { label: "today", start: t, end: add(t, 1) };
  if (/\byesterday\b/.test(q)) return { label: "yesterday", start: add(t, -1), end: t };
  if (/\blast week\b/.test(q)) return { label: "last week", start: add(monday, -7), end: monday };
  if (/\bthis week\b/.test(q)) return { label: "this week", start: monday, end: add(monday, 7) };
  if (/\blast month\b/.test(q)) return { label: "last month", start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) };
  if (/\b(this year|year)\b/.test(q)) return { label: "this year", start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
  if (/\b(all time|ever|overall)\b/.test(q)) return { label: "all time", start: new Date(2000, 0, 1), end: new Date(2100, 0, 1) };
  return { label: "this month", start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
}

const SYNONYMS: [RegExp, string][] = [
  [/\b(food|dining|restaurants?|eating|delivery)\b/, "Food & Dining"], [/\bgroceries|grocery|supermarket\b/, "Groceries"],
  [/\b(transport|transportation|taxi|rides?|fuel|petrol|commute)\b/, "Transportation"], [/\bshopping\b/, "Shopping"], [/\brent\b/, "Rent"],
  [/\b(utilities|bills?|electricity|water)\b/, "Utilities"], [/\bentertainment\b/, "Entertainment"], [/\b(health|healthcare|medical)\b/, "Healthcare"],
  [/\b(subscriptions?)\b/, "Subscriptions"], [/\beducation\b/, "Education"], [/\btravel\b/, "Travel"], [/\binsurance\b/, "Insurance"],
];

function resolveSubject(q: string, txs: Tx[]): { kind: "category" | "merchant"; name: string } | null {
  for (const c of DEFAULT_CATEGORIES) if (q.includes(c.toLowerCase())) return { kind: "category", name: c };
  for (const [re, c] of SYNONYMS) if (re.test(q)) return { kind: "category", name: c };
  const merchants = [...new Set(txs.map((t) => t.merchant).filter(Boolean))].sort((a, b) => b.length - a.length);
  const hit = merchants.find((m) => q.includes(normalizeMerchant(m)));
  return hit ? { kind: "merchant", name: hit } : null;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Answers from the user's own transactions with exact arithmetic. No SQL, no model involved. */
export function answerQuestion(question: string, txs: Tx[], opts: { now?: Date; currency?: string } = {}): Answer {
  const now = opts.now ?? new Date();
  const q = question.toLowerCase().replace(/[?!.]+$/g, "");
  const counts = new Map<string, number>();
  txs.forEach((t) => counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1));
  const currency = opts.currency ?? [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!currency) return { answer: "There are no transactions yet, so I have nothing to answer from.", facts: "No transactions." };

  const mine = txs.filter((t) => t.currency === currency);
  const r = periodFrom(q, now);
  const inRange = (t: Tx) => { const d = new Date(t.date); return d >= r.start && d < r.end; };
  const note = counts.size > 1 ? ` (${currency} only; other currencies are not combined)` : "";
  const done = (answer: string, facts: string): Answer => ({ answer: answer + note, facts: `${facts}\nPeriod: ${r.label}. Currency: ${currency}.` });

  if (/\b(compare|versus|vs\.?)\b/.test(q)) {
    const thisM = [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)] as const;
    const lastM = [new Date(now.getFullYear(), now.getMonth() - 1, 1), thisM[0]] as const;
    const a = spend(mine, currency, ...thisM), b = spend(mine, currency, ...lastM);
    const diff = a.minus(b);
    const rel = b.gt(0) ? ` (${diff.gte(0) ? "+" : "−"}${diff.abs().div(b).times(100).toDecimalPlaces(0)}%)` : "";
    return done(`This month you've spent ${fmt(a, currency)} so far, compared with ${fmt(b, currency)} for all of last month${rel}. Last month is a full month, so this month will keep growing.`,
      `This month so far: ${a}. Last month total: ${b}. Difference: ${diff}.`);
  }

  if (/\b(biggest|largest|highest|most expensive)\b/.test(q)) {
    const top = mine.filter((t) => t.type === "EXPENSE" && inRange(t)).sort((x, y) => Number(y.amount) - Number(x.amount))[0];
    return top
      ? done(`Your biggest expense ${r.label} was ${fmt(top.amount, currency)}${top.merchant ? ` at ${top.merchant}` : ""} (${top.category}) on ${new Date(top.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`, `Largest expense: ${top.amount} ${top.merchant} ${top.category} ${top.date.slice(0, 10)}.`)
      : done(`I found no expenses ${r.label}.`, "No expenses in period.");
  }

  const topN = q.match(/\btop (\w+) merchants?\b/) ?? (/\btop merchants?\b/.test(q) ? ["", "5"] : null);
  if (topN) {
    const n = NUMBER_WORDS[topN[1]] ?? (Number(topN[1]) || 5);
    const totals = new Map<string, Decimal>();
    for (const t of mine.filter((x) => (x.type === "EXPENSE" || x.type === "REFUND") && x.merchant && inRange(x)))
      totals.set(t.merchant, (totals.get(t.merchant) ?? new Decimal(0)).plus(t.type === "REFUND" ? new Decimal(t.amount).neg() : t.amount));
    const rows = [...totals].sort((a, b) => b[1].cmp(a[1])).slice(0, n);
    return rows.length
      ? done(`Your top ${rows.length} merchants ${r.label}: ${rows.map(([m, v], i) => `${i + 1}. ${m} ${fmt(v, currency)}`).join(", ")}.`, rows.map(([m, v]) => `${m}: ${v}`).join("\n"))
      : done(`No merchant spending ${r.label}.`, "No merchant spending.");
  }

  if (/\bsubscriptions?\b/.test(q) && /\b(which|what|list|pay|paying|do i)\b/.test(q)) {
    const subs = detectRecurring(mine, now).filter((s) => s.category === "Subscriptions");
    if (!subs.length) return done("I couldn't find any recurring subscriptions yet. They need at least three similar charges.", "No subscriptions detected.");
    const total = subs.reduce((s, x) => s.plus(monthlyCost(x.amount, x.frequency)), new Decimal(0));
    return done(`You pay for ${subs.map((s) => `${s.merchant} (${fmt(s.amount, currency)} ${s.frequency.toLowerCase()})`).join(", ")}, about ${fmt(total, currency)} per month in total.`, subs.map((s) => `${s.merchant}: ${s.amount} ${s.frequency}`).join("\n") + `\nMonthly total: ${total}`);
  }

  if (/\b(save|saved|saving|savings)\b/.test(q)) {
    const inc = mine.filter((t) => t.type === "INCOME" && inRange(t)).reduce((s, t) => s.plus(t.amount), new Decimal(0));
    const exp = spend(mine, currency, r.start, r.end);
    const net = inc.minus(exp);
    return done(`${r.label[0].toUpperCase() + r.label.slice(1)} you earned ${fmt(inc, currency)} and spent ${fmt(exp, currency)}, so you ${net.gte(0) ? "saved" : "overspent by"} ${fmt(net.abs(), currency)}.`, `Income: ${inc}. Spending: ${exp}. Net: ${net}.`);
  }

  if (/\b(income|earn|earned|salary)\b/.test(q) && !/\bspen[dt]\b/.test(q)) {
    const inc = mine.filter((t) => t.type === "INCOME" && inRange(t)).reduce((s, t) => s.plus(t.amount), new Decimal(0));
    return done(`Your income ${r.label} was ${fmt(inc, currency)}.`, `Income: ${inc}.`);
  }

  if (/\b(spend|spent|spending|cost|pay|paid)\b/.test(q)) {
    const subject = resolveSubject(q, mine);
    const pick = (t: Tx) => (!subject ? true : subject.kind === "category" ? t.category === subject.name : normalizeMerchant(t.merchant) === normalizeMerchant(subject.name));
    const total = spend(mine, currency, r.start, r.end, pick);
    const n = mine.filter((t) => t.type === "EXPENSE" && inRange(t) && pick(t)).length;
    const what = subject ? (subject.kind === "category" ? ` on ${subject.name}` : ` at ${subject.name}`) : "";
    return done(`You spent ${fmt(total, currency)}${what} ${r.label}${n ? ` across ${n} transaction${n > 1 ? "s" : ""}` : ""}.`, `Spending${what}: ${total}. Transactions: ${n}.`);
  }

  return { answer: "I can answer questions like “How much did I spend on food this month?”, “What was my biggest expense last week?”, “Show my top five merchants”, “Compare this month with last month”, “Which subscriptions do I pay for?” and “How much did I save?”", facts: "" };
}
