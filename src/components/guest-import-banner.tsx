"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { useData } from "@/lib/store/data-provider";

const KEY = "et:guest-banner-dismissed";

export function GuestImportBanner() {
  const { mode, guestCount, importGuest } = useData();
  // Remembers how many guest transactions were hidden, so new ones bring the banner back.
  const [dismissed, setDismissed] = useState(() => {
    try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
  });
  if (mode !== "user" || guestCount === 0 || guestCount <= dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, String(guestCount)); } catch {}
    setDismissed(guestCount);
  };

  return (
    <div className="card relative space-y-3 border-secondary/40 p-4 pr-12 text-sm">
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="btn-ghost absolute right-2 top-2 size-9 !p-0"><X size={16} /></button>
      <p>You have {guestCount} guest transaction{guestCount > 1 ? "s" : ""} saved on this device. Add them to your account?</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={importGuest}>Import to my account</button>
        <button className="btn-ghost" onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}
