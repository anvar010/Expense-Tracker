"use client";

import Decimal from "decimal.js";
import { CircleCheck, Lightbulb, Pause, Play, Repeat, Send, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { generateInsights } from "@/lib/insights/engine";
import { answerQuestion } from "@/lib/insights/qa";
import { detectRecurring, monthlyCost, nextOccurrence } from "@/lib/insights/recurring";
import { useData } from "@/lib/store/data-provider";
import { useCollection } from "@/lib/store/use-collection";
import { useLocalList } from "@/lib/store/use-local-list";
import type { Recurring } from "@/lib/types";

const TONE = {
  warning: { icon: TriangleAlert, cls: "text-warning bg-warning/10" },
  positive: { icon: CircleCheck, cls: "text-accent bg-accent/10" },
  info: { icon: Lightbulb, cls: "text-secondary bg-secondary/10" },
} as const;
const EXAMPLES = ["How much did I spend on food this month?", "What was my biggest expense last week?", "Show my top five merchants", "Compare this month with last month", "Which subscriptions do I pay for?", "How much did I save this month?"];

type Msg = { id: number; q: string; answer: string; facts: string; ai?: string; aiBusy?: boolean };

export default function InsightsPage() {
  const { txs, mode } = useData();
  const rec = useCollection<Recurring>("recurring");
  const [dismissed, setDismissed] = useLocalList<string>("et:dismissed-recurring");
  const [picked, setPicked] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [chat, setChat] = useState<Msg[]>([]);
  const [aiOn, setAiOn] = useState(false);
  const [error, setError] = useState("");

  const currencies = useMemo(() => [...new Set(txs.map((t) => t.currency))], [txs]);
  const currency = picked && currencies.includes(picked as never) ? picked : currencies.includes("AED") ? "AED" : currencies[0] ?? "AED";

  useEffect(() => {
    if (mode !== "user") return setAiOn(false);
    fetch("/api/ai/status").then((r) => r.json()).then((j) => setAiOn(!!j?.data?.enabled)).catch(() => setAiOn(false));
  }, [mode]);

  const insights = useMemo(() => generateInsights(txs, currency), [txs, currency]);
  const confirmedKeys = new Set(rec.items.map((r) => `${r.currency}|${r.name.toLowerCase()}`));
  const suggestions = useMemo(
    () => detectRecurring(txs).filter((s) => s.currency === currency && !dismissed.includes(s.key) && !confirmedKeys.has(`${s.currency}|${s.merchant.toLowerCase()}`)),
    [txs, currency, dismissed, rec.items], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const active = rec.items.filter((r) => r.currency === currency);
  const upcoming = active.filter((r) => r.status === "ACTIVE").map((r) => ({ r, due: nextOccurrence(r.nextDueDate, r.frequency) })).sort((a, b) => +a.due - +b.due);
  const forecast = upcoming.reduce((s, { r }) => s.plus(monthlyCost(r.amount, r.frequency)), new Decimal(0));

  async function guarded(fn: () => Promise<unknown>) {
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
  }

  function ask(text: string) {
    if (!text.trim()) return;
    const a = answerQuestion(text, txs, { currency });
    setChat((c) => [{ id: Date.now(), q: text, ...a }, ...c]);
    setQ("");
  }

  async function explain(m: Msg) {
    setChat((c) => c.map((x) => (x.id === m.id ? { ...x, aiBusy: true } : x)));
    const r = await fetch("/api/ai/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: m.q, facts: m.facts }) }).catch(() => null);
    const text = r?.ok ? (await r.json()).data.text : "Couldn't get an explanation right now.";
    setChat((c) => c.map((x) => (x.id === m.id ? { ...x, ai: text, aiBusy: false } : x)));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Insights</h1>
          <p className="mt-1 text-sm text-muted">Every figure is calculated from your own transactions.</p>
        </div>
        {currencies.length > 1 && (
          <select aria-label="Currency" className="input !w-auto" value={currency} onChange={(e) => setPicked(e.target.value)}>{currencies.map((c) => <option key={c}>{c}</option>)}</select>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <section className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Sparkles size={16} /> Ask about your spending</h2>
        <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-2">
          <input aria-label="Question" className="input" placeholder="How much did I spend on food this month?" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-primary" aria-label="Ask"><Send size={16} /></button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => <button key={e} type="button" className="btn-ghost !min-h-8 !px-3 text-xs" onClick={() => ask(e)}>{e}</button>)}
        </div>
        <ul className="mt-4 space-y-3">
          {chat.map((m) => (
            <li key={m.id} className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
              <p className="text-xs text-muted">{m.q}</p>
              <p>{m.answer}</p>
              {m.ai && <p className="border-l-2 border-secondary pl-3 text-muted">{m.ai}</p>}
              {aiOn && m.facts && !m.ai && <button className="text-xs text-secondary underline" disabled={m.aiBusy} onClick={() => explain(m)}>{m.aiBusy ? "Thinking…" : "Explain with AI"}</button>}
            </li>
          ))}
        </ul>
        {aiOn && <p className="mt-2 text-xs text-muted">“Explain with AI” sends only the computed figures above (account references removed), never your transactions.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">This month</h2>
        {insights.length === 0 ? <p className="card p-6 text-center text-sm text-muted">Add more transactions to see patterns. Insights compare this month with earlier months.</p> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {insights.map((i) => {
              const { icon: Icon, cls } = TONE[i.tone];
              return (
                <li key={i.id} className="card flex gap-3 p-4">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", cls)}><Icon size={18} /></span>
                  <div className="min-w-0"><p className="text-sm font-medium">{i.title}</p><p className="mt-1 text-xs text-muted">{i.detail}</p></div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-medium"><Repeat size={16} /> Recurring payments</h2>
        {suggestions.length > 0 && (
          <ul className="card divide-y divide-border">
            {suggestions.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span><b className="font-medium">{s.merchant}</b> · {fmt(s.amount, s.currency)} {s.frequency.toLowerCase()} <span className="text-muted">· seen {s.occurrences}× · {Math.round(s.confidence * 100)}% sure · next ~{new Date(s.nextDue).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></span>
                <span className="flex gap-2">
                  <button className="btn-primary !min-h-8 text-xs" disabled={rec.offline} onClick={() => guarded(() => rec.create({ name: s.merchant, category: s.category, currency: s.currency as Recurring["currency"], amount: s.amount, frequency: s.frequency, nextDueDate: s.nextDue, status: "ACTIVE" }))}>Confirm</button>
                  <button className="btn-ghost !min-h-8 text-xs" onClick={() => setDismissed((d) => [...d, s.key])}>Not recurring</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {suggestions.length > 0 && <p className="text-xs text-muted">Detected from your history. Nothing is tracked until you confirm.</p>}

        {active.length > 0 ? (
          <>
            <p className="text-sm text-muted">Forecast: about <b className="text-foreground">{fmt(forecast, currency)}</b> per month in confirmed recurring payments.</p>
            <ul className="card divide-y divide-border">
              {active.map((r) => {
                const due = nextOccurrence(r.nextDueDate, r.frequency);
                const days = Math.ceil((+due - Date.now()) / 864e5);
                return (
                  <li key={r.id} className={cn("flex items-center justify-between gap-2 p-3 text-sm", r.status === "PAUSED" && "opacity-55")}>
                    <span><b className="font-medium">{r.name}</b> · {fmt(r.amount, r.currency)} {r.frequency.toLowerCase()}
                      <span className="block text-xs text-muted">{r.status === "PAUSED" ? "Paused" : `Next ${due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} (${days <= 0 ? "today" : `in ${days} day${days > 1 ? "s" : ""}`})`}</span></span>
                    <span className="flex gap-1">
                      <button aria-label={r.status === "PAUSED" ? "Resume" : "Pause"} className="btn-ghost size-9 !min-h-9 !p-0" disabled={rec.offline} onClick={() => guarded(() => rec.update(r.id, { ...r, status: r.status === "PAUSED" ? "ACTIVE" : "PAUSED" }))}>{r.status === "PAUSED" ? <Play size={15} /> : <Pause size={15} />}</button>
                      <button aria-label="Remove" className="btn-ghost size-9 !min-h-9 !p-0 hover:text-danger" disabled={rec.offline} onClick={() => guarded(() => rec.remove(r.id))}><Trash2 size={15} /></button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : suggestions.length === 0 && <p className="card p-6 text-center text-sm text-muted">No recurring payments yet. They appear after three similar charges.</p>}
      </section>
    </div>
  );
}
