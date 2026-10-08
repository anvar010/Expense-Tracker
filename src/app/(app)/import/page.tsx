"use client";

import { AlertTriangle, CheckCircle2, FileUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmt } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { readStatement, type StatementKind } from "@/lib/import/read-file";
import { buildCandidates, detectColumns, type Cell, type ColumnKey, type Mapping } from "@/lib/import/statement";
import type { CategoryRule } from "@/lib/parser/categorize";
import { useData } from "@/lib/store/data-provider";
import { useCollection } from "@/lib/store/use-collection";
import { useLocalList } from "@/lib/store/use-local-list";
import { CURRENCIES, DEFAULT_CATEGORIES, type Account, type TxInput } from "@/lib/types";

const FIELDS: [ColumnKey, string][] = [["date", "Date"], ["description", "Description"], ["debit", "Debit"], ["credit", "Credit"], ["amount", "Amount"], ["balance", "Balance"]];
type Edit = { include?: boolean; category?: string; merchant?: string };

export default function ImportPage() {
  const { txs, addMany } = useData();
  const { items: accounts } = useCollection<Account>("accounts");
  const [rules] = useLocalList<CategoryRule>("et:rules");
  const [rows, setRows] = useState<Cell[][]>([]);
  const [kind, setKind] = useState<StatementKind>();
  const [fileName, setFileName] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [currency, setCurrency] = useState<TxInput["currency"]>("AED");
  const [accountId, setAccountId] = useState("");
  const [invert, setInvert] = useState(false);
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(""); setDone(0); setEdits({}); setRows([]); setBusy(true);
    try {
      const r = await readStatement(file);
      setRows(r.rows); setKind(r.kind); setFileName(file.name);
      const d = detectColumns(r.rows);
      setHeaderRow(d?.headerRow ?? 0);
      setMapping(d?.mapping ?? {});
      if (!d) setError("Couldn't find the columns automatically. Pick them below.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally { setBusy(false); }
  }

  const candidates = useMemo(
    () => (rows.length && mapping.date !== undefined ? buildCandidates(rows, headerRow, mapping, { currency, accountId: accountId || undefined, invertSign: invert, rules, existing: txs }) : []),
    [rows, headerRow, mapping, currency, accountId, invert, rules, txs],
  );
  const view = candidates.map((c) => {
    const e = edits[c.rowIndex] ?? {};
    return { c, include: e.include ?? !c.duplicate, input: { ...c.input, category: e.category ?? c.input.category, merchant: e.merchant ?? c.input.merchant } };
  });
  const selected = view.filter((v) => v.include);
  const patch = (i: number, e: Edit) => setEdits((x) => ({ ...x, [i]: { ...x[i], ...e } }));

  async function confirmImport() {
    setBusy(true);
    try {
      await addMany(selected.map((v) => v.input));
      setDone(selected.length); setRows([]); setEdits({});
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed."); }
    finally { setBusy(false); }
  }

  const header = rows[headerRow] ?? [];
  const label = (c: Cell, i: number) => `${i + 1}: ${String(c ?? "").slice(0, 24) || "(blank)"}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Import statement</h1>
        <p className="mt-1 text-sm text-muted">CSV, XLSX or PDF, up to 5 MB. The file is read in your browser and never uploaded. You review everything before anything is saved.</p>
      </div>

      {done > 0 && (
        <p role="status" className="card flex items-center gap-2 p-4 text-sm text-accent"><CheckCircle2 size={18} /> Imported {done} transactions. <Link className="underline" href="/transactions">View them</Link></p>
      )}

      <section className="card space-y-4 p-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted hover:bg-surface-2">
          <FileUp />
          <span>{fileName ? `${fileName} (${kind?.toUpperCase()})` : "Choose a statement file"}</span>
          <input type="file" className="sr-only" accept=".csv,.tsv,.txt,.xlsx,.pdf" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="i-acc">Account</label>
            <select id="i-acc" className="input" value={accountId} onChange={(e) => { setAccountId(e.target.value); const a = accounts.find((x) => x.id === e.target.value); if (a) setCurrency(a.currency); }}>
              <option value="">No account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div><label className="label" htmlFor="i-cur">Statement currency</label>
            <select id="i-cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value as TxInput["currency"])}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        {error && <p role="alert" className="flex items-center gap-2 text-sm text-danger"><AlertTriangle size={16} /> {error}</p>}
        {kind === "pdf" && rows.length > 0 && <p className="text-xs text-warning">PDF reading is best-effort: debit/credit is inferred from the running balance. Check each row.</p>}
      </section>

      {rows.length > 0 && (
        <details className="card p-4" open={candidates.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">Columns</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor="i-hr">Header row</label>
              <input id="i-hr" type="number" min={1} max={Math.min(rows.length, 50)} className="input num" value={headerRow + 1} onChange={(e) => setHeaderRow(Math.max(0, Number(e.target.value) - 1))} /></div>
            {FIELDS.map(([key, name]) => (
              <div key={key}><label className="label" htmlFor={`m-${key}`}>{name}</label>
                <select id={`m-${key}`} className="input" value={mapping[key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                  <option value="">—</option>{header.map((c, i) => <option key={i} value={i}>{label(c, i)}</option>)}</select></div>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> My bank shows spending as positive numbers (flip signs)</label>
        </details>
      )}

      {view.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{selected.length} of {view.length} selected · {view.filter((v) => v.c.duplicate).length} possible duplicates (unchecked)</h2>
            <div className="flex gap-2 text-xs">
              <button className="btn-ghost !min-h-8" onClick={() => setEdits(Object.fromEntries(view.map((v) => [v.c.rowIndex, { ...edits[v.c.rowIndex], include: true }])))}>Select all</button>
              <button className="btn-ghost !min-h-8" onClick={() => setEdits(Object.fromEntries(view.map((v) => [v.c.rowIndex, { ...edits[v.c.rowIndex], include: false }])))}>None</button>
            </div>
          </div>
          <ul className="card divide-y divide-border">
            {view.map(({ c, include, input }) => (
              <li key={c.rowIndex} className={cn("grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3", !include && "opacity-55")}>
                <input type="checkbox" aria-label="Include" checked={include} onChange={(e) => patch(c.rowIndex, { include: e.target.checked })} />
                <div className="min-w-0 space-y-1">
                  <div className="flex gap-2">
                    <input aria-label="Merchant" className="input !min-h-8 !px-2 text-xs" value={input.merchant} placeholder="Merchant" onChange={(e) => patch(c.rowIndex, { merchant: e.target.value })} />
                    <select aria-label="Category" className="input !min-h-8 !px-2 text-xs sm:max-w-44" value={input.category} onChange={(e) => patch(c.rowIndex, { category: e.target.value })}>
                      {[...new Set([...DEFAULT_CATEGORIES, input.category])].map((x) => <option key={x}>{x}</option>)}</select>
                  </div>
                  <p className="truncate text-xs text-muted">{new Date(input.date).toLocaleDateString("en-GB")} · {input.notes}
                    {c.duplicate && <span className="ml-2 text-warning">possible duplicate</span>}
                    {c.confidence < 0.7 && <span className="ml-2 text-warning">check category</span>}</p>
                </div>
                <span className={cn("num text-sm font-semibold", input.type === "INCOME" && "text-accent")}>{input.type === "INCOME" ? "+" : "−"}{fmt(input.amount, input.currency)}</span>
              </li>
            ))}
          </ul>
          <button className="btn-primary w-full sm:w-auto" onClick={confirmImport} disabled={busy || selected.length === 0}>{busy ? "Importing…" : `Import ${selected.length} transactions`}</button>
        </section>
      )}
    </div>
  );
}
