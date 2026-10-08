"use client";

import { Bell, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bar as ProgressBar, ItemLi, StaggerList } from "@/components/motion";
import { fmt } from "@/lib/analytics";
import { budgetProgress, monthlyHistory, suggestBudgets } from "@/lib/budgets";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/store/data-provider";
import { useCollection } from "@/lib/store/use-collection";
import { BUDGET_PERIODS, CURRENCIES, DEFAULT_CATEGORIES, budgetInputSchema, type Budget, type BudgetInput } from "@/lib/types";

const blank: BudgetInput = { category: "", amount: "", currency: "AED", period: "MONTHLY" };
const BAR = { ok: "bg-accent", warn: "bg-warning", danger: "bg-warning", over: "bg-danger" } as const;

function BudgetForm({ initial, onSave, onCancel }: { initial?: Budget; onSave: (b: BudgetInput) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState<BudgetInput>(initial ?? blank);
  const [error, setError] = useState("");
  const set = <K extends keyof BudgetInput>(k: K, val: BudgetInput[K]) => setV((x) => ({ ...x, [k]: val }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = budgetInputSchema.safeParse(v);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    try { await onSave(parsed.data); } catch (err) { setError(err instanceof Error ? err.message : "Could not save"); }
  }
  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="font-medium">{initial ? "Edit budget" : "New budget"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="b-cat">Category</label>
          <select id="b-cat" className="input" value={v.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Overall (all spending)</option>{DEFAULT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label" htmlFor="b-amt">Amount</label><input id="b-amt" inputMode="decimal" className="input num" value={v.amount} onChange={(e) => set("amount", e.target.value)} /></div>
        <div><label className="label" htmlFor="b-cur">Currency</label>
          <select id="b-cur" className="input" value={v.currency} onChange={(e) => set("currency", e.target.value as BudgetInput["currency"])}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label" htmlFor="b-per">Period</label>
          <select id="b-per" className="input" value={v.period} onChange={(e) => set("period", e.target.value as BudgetInput["period"])}>
            {BUDGET_PERIODS.map((p) => <option key={p} value={p}>{p.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</option>)}</select></div>
        {v.period === "CUSTOM" && (<>
          <div><label className="label" htmlFor="b-s">Start</label><input id="b-s" type="date" className="input" value={v.startDate?.slice(0, 10) ?? ""} onChange={(e) => set("startDate", e.target.value)} /></div>
          <div><label className="label" htmlFor="b-e">End</label><input id="b-e" type="date" className="input" value={v.endDate?.slice(0, 10) ?? ""} onChange={(e) => set("endDate", e.target.value)} /></div>
        </>)}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2"><button className="btn-primary">Save</button><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export default function BudgetsPage() {
  const { txs, mode } = useData();
  const { items, offline, loaded, create, update, remove } = useCollection<Budget>("budgets");
  const [editing, setEditing] = useState<Budget | "new" | null>(null);
  const [histId, setHistId] = useState("");
  const [perm, setPerm] = useState<string>(typeof Notification === "undefined" ? "unsupported" : Notification.permission);

  const rows = useMemo(() => items.map((b) => ({ b, p: budgetProgress(b, txs) })), [items, txs]);
  const hist = items.find((b) => b.id === histId) ?? items.find((b) => b.period === "MONTHLY");
  const currency = items[0]?.currency ?? "AED";
  const suggestions = useMemo(() => suggestBudgets(txs, items, currency), [txs, items, currency]);

  if (mode === "loading" || !loaded) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Budgets</h1>
        <div className="flex gap-2">
          {perm === "default" && <button className="btn-ghost" onClick={async () => setPerm(await Notification.requestPermission())}><Bell size={16} /> Enable alerts</button>}
          <button className="btn-primary" onClick={() => setEditing("new")} disabled={offline}><Plus size={16} /> Add budget</button>
        </div>
      </div>
      <p className="text-sm text-muted">You'll be alerted at 80%, 90% and 100% of each budget{perm === "granted" ? " (browser notifications on)" : "; alerts always appear under the bell"}.</p>
      {offline && <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">Showing saved budgets. Changes need a database connection.</p>}

      {editing && <BudgetForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)}
        onSave={async (v) => { editing === "new" ? await create(v) : await update(editing.id, v); setEditing(null); }} />}

      {rows.length === 0 && !editing ? (
        <div className="card p-10 text-center text-sm text-muted">Set a monthly budget to see progress and get warnings before you overspend.</div>
      ) : (
        <StaggerList className="grid gap-3 md:grid-cols-2">
          {rows.map(({ b, p }) => (
            <ItemLi key={b.id} className="card space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{b.category || "Overall"}</p>
                  <p className="text-xs text-muted">{b.period.toLowerCase()} · {p.range[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {new Date(+p.range[1] - 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                </div>
                <div className="flex gap-1">
                  <button aria-label="Edit budget" className="btn-ghost size-9 !min-h-9 !p-0" onClick={() => setEditing(b)} disabled={offline}><Pencil size={15} /></button>
                  <button aria-label="Delete budget" className="btn-ghost size-9 !min-h-9 !p-0 hover:text-danger" disabled={offline} onClick={() => confirm("Delete this budget?") && remove(b.id)}><Trash2 size={15} /></button>
                </div>
              </div>
              <ProgressBar pct={p.pct} className={cn("h-full rounded-full", BAR[p.status])} />
              <div className="num flex justify-between text-sm">
                <span>{fmt(p.spent, b.currency)} <span className="text-muted">of {fmt(b.amount, b.currency)}</span></span>
                <span className={cn(p.remaining.lt(0) ? "text-danger" : "text-muted")}>{p.remaining.lt(0) ? `${fmt(p.remaining.abs(), b.currency)} over` : `${fmt(p.remaining, b.currency)} left`}</span>
              </div>
              {p.status !== "ok" && <p role="status" className={cn("text-xs", p.status === "over" ? "text-danger" : "text-warning")}>{p.status === "over" ? "Over budget" : `${p.pct}% used`}</p>}
            </ItemLi>
          ))}
        </StaggerList>
      )}

      {rows.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-medium">Budget vs actual</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows.map(({ b, p }) => ({ name: b.category || "Overall", Budget: Number(b.amount), Spent: p.spent.toNumber() }))}>
                <CartesianGrid vertical={false} stroke="#94a3b833" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="#94a3b8" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} stroke="#94a3b8" />
                <Tooltip /><Legend />
                <Bar dataKey="Budget" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Spent" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {hist && (
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">History (last 6 months)</h2>
            <select aria-label="Budget" className="input !w-auto" value={hist.id} onChange={(e) => setHistId(e.target.value)}>
              {items.filter((b) => b.period === "MONTHLY").map((b) => <option key={b.id} value={b.id}>{b.category || "Overall"}</option>)}
            </select>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyHistory(hist, txs)}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="#94a3b8" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} stroke="#94a3b8" />
                <Tooltip /><Bar dataKey="spent" name="Spent" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-muted">Monthly budget: {fmt(hist.amount, hist.currency)}</p>
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-medium">Suggested budgets</h2>
          <p className="mb-2 text-xs text-muted">Based on your average spending over the last three full months.</p>
          <ul className="divide-y divide-border">
            {suggestions.map((s) => (
              <li key={s.category} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{s.category} <span className="text-muted">· avg {fmt(s.average.toDecimalPlaces(0), currency)}</span></span>
                <button className="btn-ghost !min-h-8 text-xs" disabled={offline}
                  onClick={() => create({ category: s.category, amount: s.suggested.toFixed(2), currency: currency as Budget["currency"], period: "MONTHLY" })}>
                  Set {fmt(s.suggested, currency)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
