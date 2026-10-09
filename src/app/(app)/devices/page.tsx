"use client";

import { Check, Copy, Smartphone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useData } from "@/lib/store/data-provider";

type Device = { id: string; name: string; platform: string; status: string; lastSyncAt: string | null };

export default function DevicesPage() {
  const { mode } = useData();
  const [devices, setDevices] = useState<Device[]>([]);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<"ANDROID" | "IOS">("ANDROID");
  const [token, setToken] = useState("");
  const [tokenPlatform, setTokenPlatform] = useState<"ANDROID" | "IOS">("ANDROID");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const endpoint = typeof window === "undefined" ? "" : `${window.location.origin}/api/ingest`;

  const load = useCallback(async () => {
    const r = await fetch("/api/devices").catch(() => null);
    if (r?.ok) setDevices((await r.json()).data);
    else if (r) setError(r.status === 503 ? "Database is not reachable right now." : "Could not load devices.");
  }, []);
  useEffect(() => { if (mode === "user") void load(); }, [mode, load]);
  // Arriving from "Allow on Android / iPhone" preselects that platform.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("platform");
    if (p === "ANDROID" || p === "IOS") setPlatform(p);
  }, []);

  if (mode !== "user") {
    return (
      <div className="card space-y-3 p-8 text-center">
        <Smartphone className="mx-auto text-muted" />
        <p className="font-medium">Connect a phone</p>
        <p className="text-sm text-muted">Automatic message capture syncs to your account, so you need to sign in first. Guest data stays on this device only.</p>
        <Link href="/login" className="btn-primary">Sign in</Link>
      </div>
    );
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const r = await fetch("/api/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, platform }) }).catch(() => null);
    if (!r?.ok) return setError(r?.status === 503 ? "Database is not reachable right now." : "Could not create the device.");
    setToken((await r.json()).data.token);
    setTokenPlatform(platform);
    setName("");
    void load();
  }

  async function revoke(d: Device) {
    if (!confirm(`Revoke ${d.name}? It will stop syncing immediately.`)) return;
    await fetch(`/api/devices/${d.id}`, { method: "DELETE" });
    void load();
  }

  const copy = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 1500); } catch {}
  };

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">Devices</h1>
      <p className="text-sm text-muted">Each phone gets its own key. You can revoke it at any time. Only bank-transaction messages are processed; messages with OTPs or security codes are discarded.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <form onSubmit={create} className="card grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
        <div><label className="label" htmlFor="dn">Device name</label><input id="dn" required className="input" placeholder="My Pixel" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="dp">Platform</label>
          <select id="dp" className="input" value={platform} onChange={(e) => setPlatform(e.target.value as "ANDROID" | "IOS")}><option value="ANDROID">Android</option><option value="IOS">iPhone (Shortcuts)</option></select></div>
        <button className="btn-primary self-end">Create key</button>
      </form>

      {token && (
        <section className="card space-y-3 border-accent/50 p-4">
          <p className="text-sm font-medium">Copy this key now. It is shown only once.</p>
          {(tokenPlatform === "IOS"
            ? [["Shortcut URL", `${endpoint}/shortcut?key=${token}`]]
            : [["Key", token], ["Server URL", endpoint]]
          ).map(([label, value]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-muted">{label}</span>
              <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-3 py-2 text-xs">{value}</code>
              <button className="btn-ghost size-10 !p-0" aria-label={`Copy ${label}`} onClick={() => copy(label, value)}>{copied === label ? <Check size={16} /> : <Copy size={16} />}</button>
            </div>
          ))}
          {tokenPlatform === "IOS" && (
            <div className="rounded-xl bg-surface-2 p-4 text-sm">
              <p className="font-medium">Set it up in the Shortcuts app (about 3 minutes)</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted">
                <li>Shortcuts → <b>Automation</b> → <b>+</b> → <b>Create Personal Automation</b> → <b>Message</b>.</li>
                <li>Set <b>Sender</b> to your bank (or <b>Message Contains</b> a word like <code>AED</code>). Choose <b>Run Immediately</b>, then <b>Next</b>.</li>
                <li>Tap <b>New Blank Automation</b>, search for <b>Get Contents of URL</b>, and add it.</li>
                <li>Paste the <b>Shortcut URL</b> above. Tap the small arrow to open options: Method <b>POST</b>, Request Body <b>File</b>, then choose <b>Shortcut Input</b>.</li>
                <li>Tap <b>Done</b>. That is the whole Shortcut: one action.</li>
              </ol>
              <p className="mt-2 text-xs text-muted">The key is part of this address, so treat the address like a password. If it leaks, revoke the device below and create a new one. If your iOS only offers <b>Run After Confirmation</b>, you'll need to tap a banner for each message.</p>
            </div>
          )}
          <details className="text-sm text-muted">
            <summary className="cursor-pointer text-foreground">iPhone: advanced setup (stricter, with headers)</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Shortcuts → Automation → New → <b>Message</b> → filter by your bank’s sender.</li>
              <li>Choose <b>Run Immediately</b> (availability depends on your iOS version).</li>
              <li>Add <b>Get Contents of URL</b>: the Server URL above, method <b>POST</b>, JSON body.</li>
              <li>Headers: <code>Authorization: Bearer &lt;key&gt;</code>, <code>Content-Type: application/json</code>, and <code>X-Request-Time</code> = Current Date formatted as ISO 8601.</li>
              <li>Body (JSON): <code>messageId</code> = the Hash (SHA256) of the Shortcut Input, <code>text</code> = Shortcut Input. Using the hash means the same message is never added twice.</li>
            </ol>
          </details>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer text-foreground">iPhone: sync past messages with one tap</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Shortcuts → <b>+</b> → name it "Sync bank messages".</li>
              <li>Add <b>Find Messages</b>: Sender is your bank, Date is in the last 1 Month.</li>
              <li>Add <b>Repeat with Each</b> over the messages.</li>
              <li>Inside the loop add <b>Get Contents of URL</b> with the same URL, headers and body as the automation above. For <code>receivedAt</code>, use the item's Date formatted as ISO 8601.</li>
              <li>Run it from the Shortcuts app or add it to your Home Screen. Messages already sent are recognised as duplicates, so running it again is safe.</li>
            </ol>
            <p className="mt-2">iOS does not allow any app to read your messages directly, so this Shortcut is the iPhone equivalent of the Android Sync button.</p>
          </details>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer text-foreground">Android setup</summary>
            <p className="mt-2">Install the companion app, paste the key and URL, then tap <b>Sync this month's messages</b>. The app asks for SMS permission and explains why before it does. It reads this month's inbox once, keeps only bank transactions, and sends nothing else.</p>
          </details>
        </section>
      )}

      <ul className="card divide-y divide-border">
        {devices.length === 0 && <li className="p-6 text-center text-sm text-muted">No devices yet.</li>}
        {devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{d.name} <span className="text-xs font-normal text-muted">· {d.platform === "IOS" ? "iPhone" : "Android"}</span></p>
              <p className="text-xs text-muted">{d.status === "REVOKED" ? "Revoked" : d.lastSyncAt ? `Last sync ${new Date(d.lastSyncAt).toLocaleString()}` : "Never synced"}</p>
            </div>
            {d.status === "ACTIVE" && <button aria-label={`Revoke ${d.name}`} className="btn-ghost size-10 !p-0 hover:text-danger" onClick={() => revoke(d)}><Trash2 size={16} /></button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
