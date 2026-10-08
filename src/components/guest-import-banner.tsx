"use client";

import { useData } from "@/lib/store/data-provider";

export function GuestImportBanner() {
  const { mode, guestCount, importGuest } = useData();
  if (mode !== "user" || guestCount === 0) return null;
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 border-secondary/40 p-4 text-sm">
      <span>You have {guestCount} guest transaction{guestCount > 1 ? "s" : ""} saved on this device. Add them to your account?</span>
      <button className="btn-primary" onClick={importGuest}>Import to my account</button>
    </div>
  );
}
