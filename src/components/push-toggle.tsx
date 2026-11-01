"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";

type State = "checking" | "unsupported" | "blocked" | "off" | "on";

const toKey = (b64: string) => {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Turns phone/browser alerts for new debits and credits on or off for this device. */
export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    const check = supported()
      ? navigator.serviceWorker.getRegistration("/sw.js").then((reg) => reg?.pushManager.getSubscription())
      : Promise.resolve(null);
    check
      .then((sub) => setState(!supported() ? "unsupported" : sub ? "on" : Notification.permission === "denied" ? "blocked" : "off"))
      .catch(() => setState("off"));
  }, []);

  async function enable() {
    setError("");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      const key = (await (await fetch("/api/push")).json()).data?.publicKey as string | null;
      if (!key) return setError("Alerts aren't set up on the server yet.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
      const res = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error("save");
      setState("on");
    } catch {
      setError("Couldn't turn on alerts on this device.");
    }
  }

  async function disable() {
    setError("");
    try {
      const sub = await (await navigator.serviceWorker.getRegistration("/sw.js"))?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError("Couldn't turn off alerts.");
    }
  }

  if (state === "checking") return null;
  return (
    <div className="border-t border-border px-2 pb-1 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm"><BellRing size={15} /> Alerts for new entries</span>
        {state === "on" && <button className="btn-ghost !min-h-8 !px-3 text-xs" onClick={disable}>Turn off</button>}
        {state === "off" && <button className="btn-primary !min-h-8 !px-3 text-xs" onClick={enable}>Turn on</button>}
      </div>
      {state === "blocked" && <p className="mt-1 text-xs text-muted">Notifications are blocked for this site. Allow them in your browser settings, then try again.</p>}
      {state === "unsupported" && <p className="mt-1 text-xs text-muted">This browser can&apos;t show alerts. On iPhone, add the app to your Home Screen first.</p>}
      {state === "on" && <p className="mt-1 text-xs text-muted">You&apos;ll get a notification with the amount, debit or credit, and category.</p>}
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
