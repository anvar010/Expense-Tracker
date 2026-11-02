"use client";

import { Check, Copy, Download, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/confirm";
import { AppleIcon } from "@/components/apple-icon";
import { useData } from "@/lib/store/data-provider";

type Status = { exists: boolean; key: string | null; createdAt: string | null; lastUsedAt: string | null };
const NONE: Status = { exists: false, key: null, createdAt: null, lastUsedAt: null };

export default function WalletPage() {
  const { mode } = useData();
  const confirm = useConfirm();
  const [status, setStatus] = useState<Status | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/wallet/key").catch(() => null);
    setStatus(r?.ok ? (await r.json()).data : NONE);
  }, []);
  useEffect(() => {
    if (mode !== "user") return;
    fetch("/api/wallet/key").then((r) => (r.ok ? r.json() : null)).then((j) => setStatus(j ? j.data : NONE)).catch(() => {});
  }, [mode]);

  async function create() {
    if (status?.exists && !(await confirm({ title: "Create a new link?", message: "This replaces your current link. The shortcut on your iPhone stops saving until you paste the new one.", confirmLabel: "Create new link", danger: false }))) return;
    setBusy(true); setError("");
    const r = await fetch("/api/wallet/key", { method: "POST" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError(j?.error ?? "Could not create the link. Check your connection.");
    setCopied(false);
    await load();
  }

  async function revoke() {
    if (!(await confirm({ title: "Turn off Apple Pay auto-save?", message: "Your link stops working and payments are no longer saved.", confirmLabel: "Turn off" }))) return;
    await fetch("/api/wallet/key", { method: "DELETE" }).catch(() => {});
    await load();
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError("Couldn't copy. Select the link and copy it by hand."); }
  }

  if (mode !== "user") {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Apple Pay auto-save</h1>
        <p className="text-sm text-muted">Sign in first. Payments are saved to your account, so this isn&apos;t available for guests.</p>
        <Link href="/login" className="btn-primary">Sign in</Link>
      </div>
    );
  }

  const link = status?.key ? `${typeof window === "undefined" ? "" : window.location.origin}/api/wallet?key=${status.key}` : "";
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "never");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Apple Pay auto-save</h1>
        <p className="mt-1 text-sm text-muted">Every time you pay with a card in Apple Wallet, your iPhone sends the amount and shop here and it is saved as a debit.</p>
      </div>

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium"><AppleIcon size={16} /> Your private link</p>
          {status?.exists && <button className="text-xs text-muted underline hover:text-foreground" onClick={revoke}>Turn off</button>}
        </div>

        {link && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Private link" className="input min-w-0 flex-1 font-mono !text-xs" />
              <button className="btn-primary shrink-0" onClick={copy}>{copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}</button>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted"><ShieldAlert size={14} className="mt-0.5 shrink-0" /> Keep it private: anyone with this link can add payments to your account. Created {when(status?.createdAt ?? null)}, last used {when(status?.lastUsedAt ?? null)}.</p>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button className={status?.exists ? "btn-ghost" : "btn-primary"} onClick={create} disabled={busy || !status}>
          {busy ? "Creating…" : status?.exists ? "Create a new link" : "Create my link"}
        </button>
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="text-sm font-medium">Set it up on your iPhone (about 2 minutes)</h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm text-muted">
          <li>
            Create your private link above and copy it. Then open this page <b className="text-foreground">on your iPhone</b> and download the shortcut:
            <a href="/Spendly%20Apple%20Pay.shortcut" className="btn-primary mt-2 flex w-fit"><Download size={16} /> Download shortcut</a>
            <span className="mt-1 block text-xs">Tap <b className="text-foreground">Set Up Shortcut</b>, paste your link when it asks, then <b className="text-foreground">Add Shortcut</b>.</span>
          </li>
          <li>In <b className="text-foreground">Shortcuts</b> go to <b className="text-foreground">Automation</b> → <b className="text-foreground">+</b> → <b className="text-foreground">Transaction</b>, choose your cards, then <b className="text-foreground">Next</b> → <b className="text-foreground">Create New Shortcut</b>.</li>
          <li>Add a <b className="text-foreground">Text</b> action. Type the variables <b className="text-foreground">Amount</b>, <b className="text-foreground">Merchant</b> and <b className="text-foreground">Card or Pass</b>, each on its own line (tap the field and pick them from the variable list).</li>
          <li>Add a <b className="text-foreground">Run Shortcut</b> action, choose <b className="text-foreground">Spendly Apple Pay</b>, and set its input to that Text.</li>
          <li>Tap <b className="text-foreground">Done</b>, set the automation to <b className="text-foreground">Run Immediately</b> and turn off &quot;Notify When Run&quot;.</li>
        </ol>
        <p className="text-xs text-muted">To check your link, open it in Safari. You should see <code>&quot;valid&quot;:true</code>. Nothing is saved by that.</p>
        <details className="text-sm text-muted">
          <summary className="cursor-pointer text-foreground">Prefer not to download? Set it up by hand</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>Shortcuts → Automation → + → Transaction → choose cards → Create New Shortcut.</li>
            <li>Add <b className="text-foreground">Get Contents of URL</b> and paste your link as the URL.</li>
            <li>Show More: Method <b className="text-foreground">POST</b>, Request Body <b className="text-foreground">JSON</b>. Add Text fields <code>amount</code>, <code>merchant</code>, <code>card</code> set to the variables Amount, Merchant, Card or Pass.</li>
            <li>Done → Run Immediately.</li>
          </ol>
        </details>
      </section>

      <section className="card space-y-2 p-4 text-sm text-muted">
        <h2 className="font-medium text-foreground">Good to know</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>It only sees Apple Pay payments made from Wallet. Online card payments, transfers, ATM withdrawals and refunds aren&apos;t included.</li>
          <li>The category is guessed from the shop name and can be changed afterwards. The currency is AED unless the amount shows another one.</li>
          <li>If your phone is offline when you pay, iOS may skip that payment.</li>
          <li>If the same payment arrives twice within 3 minutes, only one is saved.</li>
        </ul>
      </section>
    </div>
  );
}
