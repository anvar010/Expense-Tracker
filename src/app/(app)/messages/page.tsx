"use client";

import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { findDuplicate, parseMessage, type ParsedMessage } from "@/lib/parser/parse";
import { normalizeMerchant } from "@/lib/parser/merchants";
import type { CategoryRule } from "@/lib/parser/categorize";
import { useData } from "@/lib/store/data-provider";
import { newId } from "@/lib/store/storage";
import { useCollection } from "@/lib/store/use-collection";
import { useLocalList } from "@/lib/store/use-local-list";
import { CURRENCIES, DEFAULT_CATEGORIES, TX_TYPES, type Account } from "@/lib/types";

type Queued = { id: string; text: string; reason: string; addedAt: string; serverId?: string };

const SAMPLES = [
  "Your card ending 1234 was debited AED 45.00 at TALABAT on 08/10/2026. Available balance AED 2,450.00.",
  "AED 135.75 spent using your card at CARREFOUR UAE.",
  "Salary credit of AED 5000 received in your account.",
  "AED 200 transferred from your account to another account.",
];

// Long digit runs (card/account numbers) are masked before a message is kept for later review.
const redact = (s: string) => s.replace(/\b\d{8,}\b/g, "••••");

export default function MessagesPage() {
  const { txs, add, mode } = useData();
  const { items: accounts } = useCollection<Account>("accounts");
  const [rules, setRules] = useLocalList<CategoryRule>("et:rules");
  const [queue, setQueue] = useLocalList<Queued>("et:review");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ParsedMessage | null>(null);
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState("");
  const [serverQueue, setServerQueue] = useState<Queued[]>([]);
  const [activeServerId, setActiveServerId] = useState<string>();

  // Messages parked by the Android app / Shortcuts that weren't confident enough to auto-save.
  useEffect(() => {
    if (mode !== "user") return setServerQueue([]);
    fetch("/api/review").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j) setServerQueue((j.data as { id: string; text: string; receivedAt: string }[]).map((m) => ({ id: m.id, serverId: m.id, text: m.text, reason: "Sent from your phone", addedAt: m.receivedAt })));
    }).catch(() => {});
  }, [mode]);

  const resolveServer = async (id: string, outcome: "confirmed" | "rejected") => {
    await fetch(`/api/review/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ outcome }) }).catch(() => {});
    setServerQueue((q) => q.filter((x) => x.serverId !== id));
  };

  const duplicate = useMemo(
    () => (draft?.isTransaction && draft.amount && draft.currency ? findDuplicate({ amount: draft.amount, currency: draft.currency, date: draft.date, merchant: draft.merchant }, txs) : undefined),
    [draft, txs],
  );

  function analyze(value = text) {
    setSaved("");
    setText(value);
    setDraft(value.trim() ? parseMessage(value, { rules }) : null);
  }

  const patch = (p: Partial<ParsedMessage>) => setDraft((d) => (d ? { ...d, ...p } : d));

  // Match the card/account by the last 4 digits in the message, only when exactly one account fits.
  function matchAccount() {
    if (!draft?.accountRef) return undefined;
    const hits = accounts.filter((a) => a.maskedReference === draft.accountRef && a.currency === draft.currency);
    return hits.length === 1 ? hits[0] : undefined;
  }

  async function save() {
    if (!draft?.isTransaction || !draft.amount || !draft.currency || !draft.type) return;
    await add({
      amount: draft.amount, currency: draft.currency, type: draft.type, category: draft.category,
      merchant: draft.merchant, date: draft.date, source: "SMS",
      accountId: matchAccount()?.id,
      notes: draft.accountRef ? `Card ending ${draft.accountRef}` : "",
    });
    const key = normalizeMerchant(draft.merchant);
    const original = parseMessage(text, { rules });
    if (remember && key && original.category !== draft.category) {
      setRules((r) => [...r.filter((x) => !(x.source === "correction" && x.pattern === key)),
        { id: newId(), pattern: key, category: draft.category, source: "correction", enabled: true }]);
    }
    if (activeServerId) { void resolveServer(activeServerId, "confirmed"); setActiveServerId(undefined); }
    setSaved(`Saved ${draft.merchant || draft.category}.`);
    setText("");
    setDraft(null);
  }

  function sendToReview() {
    if (!text.trim() || draft?.reason?.includes("OTP")) return; // never keep anything with security codes
    if (activeServerId) { setActiveServerId(undefined); setText(""); setDraft(null); return; } // already queued on the server
    setQueue((q) => [{ id: newId(), text: redact(text.trim()), reason: draft?.reason ?? "Low confidence", addedAt: new Date().toISOString() }, ...q]);
    setText("");
    setDraft(null);
  }

  const lowConfidence = draft?.isTransaction && draft.needsReview;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Message analyzer</h1>
        <p className="mt-1 text-sm text-muted">Paste a bank SMS or email alert. Nothing is saved until you confirm. Messages containing OTPs are ignored.</p>
      </div>

      <section className="card space-y-3 p-4">
        <label className="label" htmlFor="msg">Bank message</label>
        <textarea id="msg" rows={4} className="input !py-2" placeholder="Paste a message…" value={text} onChange={(e) => analyze(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s, i) => (
            <button key={i} type="button" className="btn-ghost !min-h-8 !px-3 text-xs" onClick={() => analyze(s)}>Sample {i + 1}</button>
          ))}
        </div>
        {saved && <p role="status" className="flex items-center gap-2 text-sm text-accent"><CheckCircle2 size={16} /> {saved}</p>}
      </section>

      {draft && !draft.isTransaction && (
        <section className="card space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm"><AlertTriangle size={16} className="text-warning" /> {draft.reason}</p>
          {!draft.reason?.includes("OTP") && <button className="btn-ghost" onClick={sendToReview}>Send to review queue</button>}
        </section>
      )}

      {draft?.isTransaction && (
        <section className="card space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Detected transaction</h2>
            <span className={cn("rounded-full px-3 py-1 text-xs", lowConfidence ? "bg-warning/15 text-warning" : "bg-accent/15 text-accent")}>
              {lowConfidence ? "Please review" : "Looks good"} · parse {Math.round(draft.confidence * 100)}% · category {Math.round(draft.categoryConfidence * 100)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor="d-type">Type</label>
              <select id="d-type" className="input" value={draft.type} onChange={(e) => patch({ type: e.target.value as ParsedMessage["type"] })}>
                {TX_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>)}</select></div>
            <div><label className="label" htmlFor="d-amount">Amount</label>
              <input id="d-amount" className="input num" value={draft.amount} onChange={(e) => patch({ amount: e.target.value })} /></div>
            <div><label className="label" htmlFor="d-cur">Currency</label>
              <select id="d-cur" className="input" value={draft.currency} onChange={(e) => patch({ currency: e.target.value as ParsedMessage["currency"] })}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label" htmlFor="d-merchant">Merchant</label>
              <input id="d-merchant" className="input" value={draft.merchant} onChange={(e) => patch({ merchant: e.target.value })} /></div>
            <div><label className="label" htmlFor="d-cat">Category</label>
              <select id="d-cat" className="input" value={draft.category} onChange={(e) => patch({ category: e.target.value })}>
                {[...new Set([...DEFAULT_CATEGORIES, draft.category])].map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label" htmlFor="d-date">Date{draft.dateAssumed && " (assumed)"}</label>
              <input id="d-date" type="date" className="input" value={new Date(draft.date).toLocaleDateString("en-CA")}
                onChange={(e) => e.target.value && patch({ date: new Date(`${e.target.value}T12:00:00`).toISOString(), dateAssumed: false })} /></div>
          </div>

          <p className="text-xs text-muted">
            {draft.accountRef && <>Card ending {draft.accountRef} · </>}
            {draft.balance && <>Balance reported: {draft.currency} {draft.balance} · </>}
            Source: SMS
          </p>

          {duplicate && (
            <p role="alert" className="flex items-center gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle size={16} /> A matching transaction already exists ({duplicate.merchant || duplicate.category}, {duplicate.amount} {duplicate.currency}). Saving may create a duplicate.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            If I change the category, use it for future messages from this merchant
          </label>

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={save}>{duplicate ? "Save anyway" : "Save transaction"}</button>
            <button className="btn-ghost" onClick={sendToReview}>Send to review queue</button>
          </div>
          {mode === "user" && <p className="text-xs text-muted">Saved to your account (or queued if the database is offline).</p>}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Review queue ({queue.length + serverQueue.length})</h2>
        {queue.length + serverQueue.length === 0 ? <p className="text-sm text-muted">Messages that can’t be parsed confidently appear here instead of creating wrong transactions.</p> : (
          <ul className="card divide-y divide-border">
            {[...serverQueue, ...queue].map((q) => (
              <li key={q.id} className="flex items-start gap-2 p-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => { analyze(q.text); setActiveServerId(q.serverId); if (!q.serverId) setQueue((x) => x.filter((i) => i.id !== q.id)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  <span className="block truncate text-sm">{q.text}</span>
                  <span className="text-xs text-muted">{q.reason} · tap to review</span>
                </button>
                <button aria-label="Discard" className="btn-ghost size-10 shrink-0 !p-0 text-muted hover:text-danger" onClick={() => (q.serverId ? resolveServer(q.serverId, "rejected") : setQueue((x) => x.filter((i) => i.id !== q.id)))}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rules.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Learned category rules</h2>
          <ul className="card divide-y divide-border">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span><b className="font-medium">{r.pattern}</b> → {r.category}</span>
                <button aria-label="Remove rule" className="btn-ghost size-10 !p-0 text-muted hover:text-danger" onClick={() => setRules((x) => x.filter((i) => i.id !== r.id))}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
