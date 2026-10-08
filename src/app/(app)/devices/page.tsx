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
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const endpoint = typeof window === "undefined" ? "" : `${window.location.origin}/api/ingest`;

  const load = useCallback(async () => {
    const r = await fetch("/api/devices").catch(() => null);
    if (r?.ok) setDevices((await r.json()).data);
    else if (r) setError(r.status === 503 ? "Database is not reachable right now." : "Could not load devices.");
  }, []);
  useEffect(() => { if (mode === "user") void load(); }, [mode, load]);

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
          {[["Key", token], ["Server URL", endpoint]].map(([label, value]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-muted">{label}</span>
              <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-3 py-2 text-xs">{value}</code>
              <button className="btn-ghost size-10 !p-0" aria-label={`Copy ${label}`} onClick={() => copy(label, value)}>{copied === label ? <Check size={16} /> : <Copy size={16} />}</button>
            </div>
          ))}
          <details className="text-sm text-muted">
            <summary className="cursor-pointer text-foreground">iPhone Shortcut setup</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Shortcuts → Automation → New → <b>Message</b> → filter by your bank’s sender.</li>
              <li>Choose <b>Run Immediately</b> (availability depends on your iOS version).</li>
              <li>Add <b>Get Contents of URL</b>: the Server URL above, method <b>POST</b>, JSON body.</li>
              <li>Headers: <code>Authorization: Bearer &lt;key&gt;</code>, <code>X-Request-Time</code> = Current Date as Unix time × 1000.</li>
              <li>Body: <code>messageId</code> (a random UUID), <code>text</code> (Shortcut Input).</li>
            </ol>
          </details>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer text-foreground">Android setup</summary>
            <p className="mt-2">Install the companion app (<code>android-companion/</code>), choose “Add key”, and paste the key and URL. The app asks for SMS permission and explains why before it does.</p>
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
