"use client";

import Decimal from "decimal.js";
import { Pencil, Plus, Scale, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, ItemLi, StaggerList } from "@/components/motion";
import { summarize, fmt } from "@/lib/analytics";
import { accountBalance, cardUtilization, nextDueDate, reconciliationDifference } from "@/lib/balances";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/store/data-provider";
import { useCollection } from "@/lib/store/use-collection";
import { ACCOUNT_TYPES, CURRENCIES, accountInputSchema, type Account, type AccountInput } from "@/lib/types";

const typeLabel = (t: string) => t.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const blank: AccountInput = { name: "", bankName: "", type: "BANK", currency: "AED", openingBalance: "0", creditLimit: "", maskedReference: "", minPayment: "", active: true };

function AccountForm({ initial, onSave, onCancel }: { initial?: Account; onSave: (a: AccountInput) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState<AccountInput>(initial ?? blank);
  const [error, setError] = useState("");
  const set = <K extends keyof AccountInput>(k: K, val: AccountInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const card = v.type === "CREDIT_CARD";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = accountInputSchema.safeParse(v);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    try { await onSave(parsed.data); } catch (err) { setError(err instanceof Error ? err.message : "Could not save"); }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="font-medium">{initial ? "Edit account" : "New account"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="a-name">Name</label><input id="a-name" className="input" value={v.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className="label" htmlFor="a-bank">Bank</label><input id="a-bank" className="input" value={v.bankName} onChange={(e) => set("bankName", e.target.value)} /></div>
        <div><label className="label" htmlFor="a-type">Type</label>
          <select id="a-type" className="input" value={v.type} onChange={(e) => set("type", e.target.value as AccountInput["type"])}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}</select></div>
        <div><label className="label" htmlFor="a-cur">Currency</label>
          <select id="a-cur" className="input" value={v.currency} onChange={(e) => set("currency", e.target.value as AccountInput["currency"])}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label" htmlFor="a-open">{card ? "Amount already owed" : "Opening balance"}</label>
          <input id="a-open" inputMode="decimal" className="input num" value={v.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} /></div>
        <div><label className="label" htmlFor="a-ref">Last 4 digits (optional)</label>
          <input id="a-ref" inputMode="numeric" maxLength={4} className="input num" value={v.maskedReference} onChange={(e) => set("maskedReference", e.target.value)} /></div>
        {card && (<>
          <div><label className="label" htmlFor="a-limit">Credit limit</label><input id="a-limit" inputMode="decimal" className="input num" value={v.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} /></div>
          <div><label className="label" htmlFor="a-due">Payment due day (1–31)</label>
            <input id="a-due" type="number" min={1} max={31} className="input num" value={v.dueDay ?? ""} onChange={(e) => set("dueDay", e.target.value ? Number(e.target.value) : undefined)} /></div>
          <div><label className="label" htmlFor="a-min">Minimum payment</label><input id="a-min" inputMode="decimal" className="input num" value={v.minPayment} onChange={(e) => set("minPayment", e.target.value)} /></div>
        </>)}
      </div>
      <p className="text-xs text-muted">Never enter full card numbers, CVVs, PINs or banking passwords. Only the last 4 digits are accepted.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2"><button className="btn-primary">Save</button><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export default function AccountsPage() {
  const { txs, add, mode } = useData();
  const { items, offline, loaded, create, update, remove } = useCollection<Account>("accounts");
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [actual, setActual] = useState("");
  const [msg, setMsg] = useState("");

  const rows = useMemo(() => items.map((a) => {
    const mine = txs.filter((t) => t.accountId === a.id);
    const bal = accountBalance(a, txs);
    return { a, bal, util: cardUtilization(a, bal), s: summarize(mine, a.currency) };
  }), [items, txs]);

  async function reconcile(a: Account, bal: Decimal) {
    if (!/^-?\d+(\.\d{1,2})?$/.test(actual)) return setMsg("Enter the balance your bank shows.");
    const diff = reconciliationDifference(actual, bal);
    if (diff.isZero()) { setMsg("Already matches your bank."); return setReconciling(null); }
    await add({ amount: diff.toFixed(2), currency: a.currency, type: "ADJUSTMENT", category: "Other", merchant: "Reconciliation", date: new Date().toISOString(), notes: "Balance reconciliation", accountId: a.id });
    setMsg(`Recorded an adjustment of ${fmt(diff, a.currency)}.`);
    setReconciling(null); setActual("");
  }

  if (mode === "loading" || !loaded) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Accounts</h1>
        <button className="btn-primary" onClick={() => setEditing("new")} disabled={offline}><Plus size={16} /> Add account</button>
      </div>
      {offline && <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">Showing saved data. You can change accounts again once the database is reachable.</p>}
      {msg && <p role="status" className="text-sm text-accent">{msg}</p>}

      {editing && (
        <AccountForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)}
          onSave={async (v) => { editing === "new" ? await create(v) : await update(editing.id, v); setEditing(null); }} />
      )}

      {rows.length === 0 && !editing ? (
        <div className="card p-10 text-center text-sm text-muted">Add a bank account, card or wallet to see balances here.</div>
      ) : (
        <StaggerList className="grid gap-3 md:grid-cols-2">
          {rows.map(({ a, bal, util, s }) => {
            const card = a.type === "CREDIT_CARD";
            return (
              <ItemLi key={a.id} className="card space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted">{[a.bankName, typeLabel(a.type), a.maskedReference && `•••• ${a.maskedReference}`].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button aria-label="Edit account" className="btn-ghost size-9 !min-h-9 !p-0" onClick={() => setEditing(a)} disabled={offline}><Pencil size={15} /></button>
                    <button aria-label="Delete account" className="btn-ghost size-9 !min-h-9 !p-0 hover:text-danger" disabled={offline}
                      onClick={() => confirm(`Delete ${a.name}? Its transactions are kept but unlinked.`) && remove(a.id)}><Trash2 size={15} /></button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted">{card ? "Outstanding" : "Balance"}</p>
                  <p className={cn("num text-2xl font-semibold tracking-tight", !card && bal.lt(0) && "text-danger")}>{fmt(bal, a.currency)}</p>
                </div>
                {card && util !== null && (
                  <div>
                    <div className="flex justify-between text-xs text-muted"><span>Utilization {util}%</span><span>Limit {fmt(a.creditLimit, a.currency)}</span></div>
                    <div className="mt-1"><Bar pct={util} trackClassName="h-1.5 rounded-full bg-surface-2" className={cn("h-full rounded-full", util >= 90 ? "bg-danger" : util >= 70 ? "bg-warning" : "bg-accent")} /></div>
                  </div>
                )}
                {card && a.dueDay && (
                  <p className="text-xs text-muted">Due {nextDueDate(a.dueDay).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{a.minPayment && ` · minimum ${fmt(a.minPayment, a.currency)}`}</p>
                )}
                <p className="num text-xs text-muted">In {fmt(s.income, a.currency)} · Spent {fmt(s.expenses, a.currency)} · {s.count} transactions</p>

                {reconciling === a.id ? (
                  <div className="flex gap-2">
                    <input aria-label="Balance shown by your bank" inputMode="decimal" placeholder="Balance per bank" className="input num" value={actual} onChange={(e) => setActual(e.target.value)} />
                    <button className="btn-primary" onClick={() => reconcile(a, bal)}>Reconcile</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Link href={`/transactions?account=${a.id}`} className="btn-ghost !min-h-9 text-xs">View transactions</Link>
                    <button className="btn-ghost !min-h-9 text-xs" onClick={() => { setReconciling(a.id); setMsg(""); }}><Scale size={14} /> Reconcile</button>
                  </div>
                )}
              </ItemLi>
            );
          })}
        </StaggerList>
      )}
    </div>
  );
}
