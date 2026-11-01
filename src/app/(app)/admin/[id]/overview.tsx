"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ROLE_LABEL } from "@/lib/admin-types";
import { fmt } from "@/lib/analytics";
import { useData } from "@/lib/store/data-provider";
import type { Role, Tx } from "@/lib/types";
import { TxItem } from "@/components/tx-row";

type Money = { currency: string; income: string; expenses: string };
type Overview = {
  user: { id: string; name: string; email: string; role: Role; active: boolean; createdAt: string };
  transactions: number; accounts: number; budgets: number;
  allTime: Money[]; month: Money[];
  topCategories: { category: string; currency: string; amount: string }[];
  recent: Tx[];
};

export function UserOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { session } = useData();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session?.role !== "SUPER_ADMIN") return;
    fetch(`/api/admin/users/${id}`).then(async (r) => {
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error ?? "Could not load user");
      setData(body.data);
    }).catch((e) => setError(e instanceof Error ? e.message : "Could not load user"));
  }, [id, session]);

  if (session?.role !== "SUPER_ADMIN") return <p className="text-sm text-muted">Only the super admin can view this.</p>;
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const m = data.month.find((x) => x.currency === "AED") ?? data.month[0];
  const a = data.allTime.find((x) => x.currency === "AED") ?? data.allTime[0];
  const cur = m?.currency ?? a?.currency ?? "AED";
  const net = (x?: Money) => (x ? (Number(x.income) - Number(x.expenses)).toFixed(2) : "0.00");

  return (
    <div className="space-y-6">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft size={14} /> All users</Link>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{data.user.name}</h1>
        <p className="mt-1 text-sm text-muted">{data.user.email} · {ROLE_LABEL[data.user.role]}{!data.user.active && " · Disabled"} · joined {new Date(data.user.createdAt).toLocaleDateString("en-GB")}</p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Income this month" value={fmt(m?.income ?? 0, cur)} />
        <Stat label="Spent this month" value={fmt(m?.expenses ?? 0, cur)} />
        <Stat label="Left this month" value={fmt(net(m), cur)} />
        <Stat label="Net all time" value={fmt(net(a), cur)} />
        <Stat label="Transactions" value={String(data.transactions)} />
        <Stat label="Accounts" value={String(data.accounts)} />
        <Stat label="Budgets" value={String(data.budgets)} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Top spending this month</h2>
        {data.topCategories.length === 0 ? <p className="text-sm text-muted">No spending yet this month.</p> : (
          <ul className="card divide-y divide-border">
            {data.topCategories.map((c) => (
              <li key={`${c.category}-${c.currency}`} className="flex items-center justify-between p-3 text-sm">
                <span>{c.category}</span><span className="num">{fmt(c.amount, c.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Recent transactions</h2>
        {data.recent.length === 0 ? <p className="text-sm text-muted">No transactions yet.</p> : (
          <ul className="card divide-y divide-border">{data.recent.map((t) => <TxItem key={t.id} t={t} />)}</ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="card p-4"><p className="text-xs text-muted">{label}</p><p className="num mt-1 text-lg font-semibold">{value}</p></div>;
}
