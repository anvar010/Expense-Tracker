"use client";

import Decimal from "decimal.js";
import { Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GuestImportBanner } from "@/components/guest-import-banner";
import { AnimatedNumber, Bar, Item, Ring, Stagger } from "@/components/motion";
import { TxItem } from "@/components/tx-row";
import { fmt, summarize } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { inPeriod, PERIODS, type PeriodId } from "@/lib/periods";
import { budgetProgress } from "@/lib/budgets";
import { accountBalance } from "@/lib/balances";
import { nextOccurrence } from "@/lib/insights/recurring";
import { useData } from "@/lib/store/data-provider";
import { useCollection } from "@/lib/store/use-collection";
import type { Account, Budget, Recurring } from "@/lib/types";

const PALETTE = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#ec4899", "#64748b"];

function Stat({ label, children, sub, tone }: { label: string; children: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <Item className="card p-4 transition-transform hover:-translate-y-0.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("num mt-1 text-xl font-semibold tracking-tight sm:text-2xl", tone)}>{children}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Item>
  );
}

export default function Dashboard() {
  const { mode } = useData();
  return mode === "loading" ? <p className="text-sm text-muted">Loading…</p> : <DashboardBody />;
}

function DashboardBody() {
  const { txs } = useData();
  const recurring = useCollection<Recurring>("recurring");
  const accounts = useCollection<Account>("accounts");
  const budgets = useCollection<Budget>("budgets");
  const [period, setPeriod] = useState<PeriodId>("month");
  const [picked, setPicked] = useState<string | null>(null);

  const currencies = useMemo(() => [...new Set(txs.map((t) => t.currency))], [txs]);
  const currency = picked && currencies.includes(picked as never) ? picked : (currencies.includes("AED") ? "AED" : currencies[0] ?? "AED");

  const current = useMemo(() => summarize(inPeriod(txs, period), currency), [txs, period, currency]);
  const previous = useMemo(
    () => (period === "month" ? summarize(inPeriod(txs, "last"), currency) : null),
    [txs, period, currency],
  );
  const change = previous && previous.expenses.gt(0)
    ? current.expenses.minus(previous.expenses).div(previous.expenses).times(100).toDecimalPlaces(0).toNumber()
    : null;
  const upcomingPayments = useMemo(() => recurring.items
    .filter((r) => r.status === "ACTIVE" && r.currency === currency)
    .map((r) => ({ r, due: nextOccurrence(r.nextDueDate, r.frequency) }))
    .filter(({ due }) => +due - Date.now() < 30 * 864e5)
    .sort((a, b) => +a.due - +b.due).slice(0, 5), [recurring.items, currency]);
  // Total across non-card accounts in this currency (cards are liabilities, shown on Accounts).
  const cash = useMemo(() => {
    const own = accounts.items.filter((a) => a.currency === currency && a.type !== "CREDIT_CARD" && a.active);
    return own.length ? own.reduce((s, a) => s.plus(accountBalance(a, txs)), new Decimal(0)) : null;
  }, [accounts.items, txs, currency]);
  const overall = budgets.items.find((b) => b.category === "" && b.period === "MONTHLY" && b.currency === currency);
  const overallProgress = overall ? budgetProgress(overall, txs) : null;
  const recent = useMemo(() => inPeriod(txs, period).filter((t) => t.currency === currency).slice(0, 6), [txs, period, currency]);

  const money = (n: number) => fmt(n, currency);
  const periodLabel = PERIODS.find((p) => p.id === period)?.label.toLowerCase() ?? "";
  const savings = current.savings.toNumber();
  const tiles = 2 + (cash ? 1 : 0) + (overallProgress ? 1 : 0);

  return (
    <div className="space-y-6">
      <GuestImportBanner />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">{currency} · {periodLabel}</p>
        </div>
        <div className="flex gap-2">
          {currencies.length > 1 && (
            <select aria-label="Currency" className="input !w-auto" value={currency} onChange={(e) => setPicked(e.target.value)}>
              {currencies.map((c) => <option key={c}>{c}</option>)}
            </select>
          )}
          <select aria-label="Period" className="input !w-auto" value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
            {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {txs.length === 0 ? (
        <Stagger className="card grid place-items-center gap-2 p-12 text-center">
          <Item className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent"><Wallet size={26} /></Item>
          <Item><p className="text-lg font-semibold">No transactions yet</p></Item>
          <Item><p className="max-w-sm text-sm text-muted">Press Add in the bar below to record your first expense, or paste a bank message on the Messages page.</p></Item>
        </Stagger>
      ) : (
        <Stagger className="space-y-4">
          <Item className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0b1224_0%,#12203d_55%,#0c3b35_100%)] p-6 text-white shadow-[0_24px_60px_-28px_rgb(16_185_129/0.55)] sm:p-8">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-emerald-400/20 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/4 size-64 rounded-full bg-blue-500/15 blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div className="min-w-0">
                <p className="text-sm text-white/70">{savings < 0 ? "Overspent" : "Left after spending"}, {periodLabel}</p>
                <p className={cn("num mt-2 text-4xl font-semibold tracking-tight sm:text-6xl", savings < 0 && "text-red-300")}>
                  <AnimatedNumber value={savings} format={money} />
                </p>
                <p className="num mt-3 text-sm text-white/70">Earned {fmt(current.income, currency)} · Spent {fmt(current.expenses, currency)}</p>
                {change !== null && (
                  <p className={cn("mt-2 inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs", change > 0 ? "bg-red-400/20 text-red-200" : "bg-emerald-400/20 text-emerald-200")}>
                    {change > 0 ? "↑" : "↓"} {Math.abs(change)}% vs last month
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <Ring pct={current.savingsRate} size={104}>
                  <span className="num text-xl font-semibold">{Math.max(0, current.savingsRate)}%</span>
                </Ring>
                <p className="max-w-[9rem] text-sm text-white/70">of your income {savings < 0 ? "was not covered" : "was saved"} {periodLabel}</p>
              </div>
            </div>
          </Item>

          <div className={cn("grid grid-cols-2 gap-3", { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" }[tiles])}>
            {cash && <Stat label="Available balance" sub={`${accounts.items.filter((a) => a.type !== "CREDIT_CARD" && a.currency === currency).length} account${accounts.items.filter((a) => a.type !== "CREDIT_CARD" && a.currency === currency).length === 1 ? "" : "s"}`} tone={cash.lt(0) ? "text-danger" : undefined}><AnimatedNumber value={cash.toNumber()} format={money} /></Stat>}
            <Stat label="Income" tone="text-accent"><AnimatedNumber value={current.income.toNumber()} format={money} /></Stat>
            <Stat label="Expenses" sub={`${current.count} transactions`}><AnimatedNumber value={current.expenses.toNumber()} format={money} /></Stat>
            {overallProgress && overall && (
              <Stat label="Monthly budget used" tone={overallProgress.status === "over" ? "text-danger" : overallProgress.status === "ok" ? undefined : "text-warning"}
                sub={overallProgress.remaining.lt(0) ? `${fmt(overallProgress.remaining.abs(), currency)} over` : `${fmt(overallProgress.remaining, currency)} left`}>
                <AnimatedNumber value={Math.round(overallProgress.pct)} format={(n) => `${Math.round(n)}%`} />
              </Stat>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Item className="card p-5 lg:col-span-3">
              <h2 className="mb-3 text-sm font-semibold">Daily activity</h2>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={current.byDay.map((d) => ({ day: d.day.slice(5), Expenses: d.expenses.toNumber(), Income: d.income.toNumber() }))}>
                    <defs>
                      <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                      <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                    </defs>
                    <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="#94a3b8" />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)" }} />
                    <Area type="monotone" dataKey="Income" stroke="#10b981" strokeWidth={2} fill="url(#gi)" />
                    <Area type="monotone" dataKey="Expenses" stroke="#3b82f6" strokeWidth={2} fill="url(#ge)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Item>

            <Item className="card p-5 lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold">Spending by category</h2>
              {current.byCategory.length === 0 ? <p className="py-16 text-center text-sm text-muted">No spending in this period.</p> : (
                <>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={current.byCategory.filter((c) => c.value.gt(0)).map((c) => ({ name: c.name, value: c.value.toNumber() }))}
                          dataKey="value" innerRadius={44} outerRadius={70} paddingAngle={2} stroke="none">
                          {current.byCategory.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {current.byCategory.slice(0, 5).map((c, i) => (
                      <li key={c.name} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 truncate"><span className="size-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{c.name}</span>
                        <span className="num text-muted">{fmt(c.value, currency)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Item>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Item className="card p-5">
              <h2 className="mb-3 text-sm font-semibold">Top merchants</h2>
              {current.byMerchant.length === 0 ? <p className="py-6 text-sm text-muted">Add a merchant name to see this.</p> : (
                <ul className="space-y-3 text-sm">
                  {current.byMerchant.map((m) => {
                    const pct = current.expenses.gt(0) ? Decimal.min(100, m.value.div(current.expenses).times(100)).toNumber() : 0;
                    return (
                      <li key={m.name}>
                        <div className="mb-1 flex justify-between"><span>{m.name}</span><span className="num text-muted">{fmt(m.value, currency)}</span></div>
                        <Bar pct={pct} trackClassName="h-1.5 rounded-full bg-surface-2" className="h-full rounded-full bg-secondary" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Item>
            <Item className="card p-5">
              <h2 className="mb-1 text-sm font-semibold">Recent</h2>
              <ul className="divide-y divide-border">{recent.map((t) => <TxItem key={t.id} t={t} />)}</ul>
              {recent.length === 0 && <p className="py-6 text-sm text-muted">Nothing in this period.</p>}
            </Item>
            {upcomingPayments.length > 0 && (
              <Item className="card p-5 lg:col-span-2">
                <h2 className="mb-2 text-sm font-semibold">Upcoming payments</h2>
                <ul className="divide-y divide-border text-sm">
                  {upcomingPayments.map(({ r, due }) => (
                    <li key={r.id} className="flex justify-between gap-2 py-2"><span>{r.name} <span className="text-xs text-muted">· {due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></span><span className="num">{fmt(r.amount, r.currency)}</span></li>
                  ))}
                </ul>
              </Item>
            )}
          </div>
        </Stagger>
      )}
    </div>
  );
}
