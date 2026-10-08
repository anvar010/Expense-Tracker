"use client";

import { Download, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { GuestImportBanner } from "@/components/guest-import-banner";
import { TxDialog } from "@/components/tx-dialog";
import { amountClass, signed } from "@/components/tx-row";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/store/data-provider";
import { useCollection } from "@/lib/store/use-collection";
import { DEFAULT_CATEGORIES, TX_TYPES, type Account, type Tx } from "@/lib/types";

const csvCell = (v: string) => {
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};

export default function TransactionsPage() {
  const { txs, remove, mode } = useData();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [account, setAccount] = useState("");
  const { items: accounts } = useCollection<Account>("accounts");
  useEffect(() => setAccount(new URLSearchParams(window.location.search).get("account") ?? ""), []);
  const [editing, setEditing] = useState<Tx | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txs.filter((t) =>
      (!category || t.category === category) && (!account || t.accountId === account || t.toAccountId === account) && (!type || t.type === type) &&
      (!needle || `${t.merchant} ${t.notes} ${t.category}`.toLowerCase().includes(needle)));
  }, [txs, q, category, type, account]);

  function exportCsv() {
    const head = ["Date", "Type", "Amount", "Currency", "Category", "Merchant", "Notes"];
    const lines = rows.map((t) => [t.date.slice(0, 10), t.type, t.amount, t.currency, t.category, t.merchant, t.notes].map(csvCell).join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "transactions.csv" }).click();
    URL.revokeObjectURL(url);
  }

  const del = (t: Tx) => confirm(`Delete this ${t.merchant || t.category} transaction?`) && remove(t.id);

  if (mode === "loading") return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <GuestImportBanner />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Transactions</h1>
        <button className="btn-ghost" onClick={exportCsv} disabled={!rows.length}><Download size={16} /> Export CSV</button>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <input aria-label="Search" placeholder="Search merchant, notes…" className="input" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>{DEFAULT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select aria-label="Account" className="input" value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select aria-label="Type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>{TX_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>)}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">{txs.length ? "No transactions match your filters." : "No transactions yet. Tap + to add one."}</div>
      ) : (
        <ul className="card divide-y divide-border overflow-hidden">
          <AnimatePresence initial={false}>
          {rows.map((t) => (
            <motion.li key={t.id} layout="position" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, x: -24, height: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }} className="flex items-center gap-2 p-3 transition-colors hover:bg-surface-2/50">
              <button onClick={() => setEditing(t)} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{t.merchant || t.category}</span>
                  <span className="block truncate text-xs text-muted">
                    {t.category} · {t.type.replace("_", " ").toLowerCase()} · {new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                <span className={cn("num shrink-0 text-sm font-semibold", amountClass(t))}>{signed(t)}</span>
              </button>
              <button onClick={() => del(t)} aria-label="Delete transaction" className="btn-ghost size-10 shrink-0 !p-0 text-muted hover:text-danger"><Trash2 size={16} /></button>
            </motion.li>
          ))}
        </AnimatePresence>
        </ul>
      )}
      <TxDialog open={!!editing} editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
