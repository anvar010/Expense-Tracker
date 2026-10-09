"use client";

import { CheckCircle2, MessageSquareText, Smartphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { detectPlatform, type PhonePlatform } from "@/lib/phone";
import { useData } from "@/lib/store/data-provider";

type Device = { id: string; name: string; platform: string; status: string; lastSyncAt: string | null };

/**
 * Shown on the Messages page. A website cannot read text messages, so this is the way in to the phone helper
 * (Android app or iPhone Shortcut) that does the reading and sends only bank transactions.
 */
export function PhoneConnectCard() {
  const { mode } = useData();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [platform, setPlatform] = useState<PhonePlatform | null>(null);
  useEffect(() => setPlatform(detectPlatform(navigator.userAgent)), []);
  useEffect(() => {
    if (mode !== "user") return setDevices(null);
    fetch("/api/devices").then((r) => (r.ok ? r.json() : null)).then((j) => setDevices(j ? j.data : [])).catch(() => setDevices([]));
  }, [mode]);

  const active = (devices ?? []).filter((d) => d.status === "ACTIVE");

  if (mode === "user" && active.length > 0) {
    return (
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={20} />
          <div className="text-sm">
            <p className="font-medium">Phone connected</p>
            <p className="text-muted">
              {active.map((d) => `${d.name}${d.lastSyncAt ? `, last message ${new Date(d.lastSyncAt).toLocaleString()}` : ", waiting for the first message"}`).join(" · ")}
            </p>
          </div>
        </div>
        <Link href="/devices" className="btn-ghost">Manage devices</Link>
      </section>
    );
  }

  return (
    <section className="card space-y-3 border-secondary/40 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary/15 text-secondary"><MessageSquareText size={20} /></span>
        <div className="text-sm">
          <p className="text-base font-semibold">Read your bank messages automatically</p>
          <p className="mt-1 text-muted">
            A website can't read your text messages, so a small helper on your phone does it and sends only bank transactions to your account.
            Messages with codes (OTPs) are never sent. Setup takes about 3 minutes.
          </p>
        </div>
      </div>
      {mode === "guest" ? (
        <Link href="/login" className="btn-primary"><Smartphone size={16} /> Sign in to set up</Link>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link href="/devices?platform=ANDROID" className={cn(platform === "ANDROID" ? "btn-primary" : "btn-ghost")}>Allow on Android</Link>
          <Link href="/devices?platform=IOS" className={cn(platform === "IOS" ? "btn-primary" : "btn-ghost")}>Allow on iPhone</Link>
        </div>
      )}
    </section>
  );
}
