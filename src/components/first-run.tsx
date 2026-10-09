"use client";

import { MessageSquareText } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { detectPlatform } from "@/lib/phone";
import { useData } from "@/lib/store/data-provider";

const KEY = "et:onboarded";

/** One-time welcome that offers the phone setup. Dismissing it, either way, is remembered on this device. */
export function FirstRunPrompt() {
  const { mode } = useData();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("/devices");

  useEffect(() => {
    if (mode === "loading") return;
    try { if (!localStorage.getItem(KEY)) setOpen(true); } catch {}
    const p = detectPlatform(navigator.userAgent);
    setTarget(p ? `/devices?platform=${p}` : "/devices");
  }, [mode]);

  const close = () => { try { localStorage.setItem(KEY, "1"); } catch {} setOpen(false); };

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}>
          <motion.div
            role="dialog" aria-modal="true" aria-label="Read bank messages automatically"
            initial={{ y: 30, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onMouseDown={(e) => e.stopPropagation()} className="card w-full max-w-md space-y-4 p-6"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent"><MessageSquareText size={24} /></span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Read your bank messages automatically?</h2>
              <p className="mt-2 text-sm text-muted">
                Spendly can turn your bank text messages into transactions. A website can't read texts itself, so a small helper on your phone sends only bank transactions.
                OTPs and personal messages are never sent. You can turn it off at any time.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={mode === "guest" ? "/login" : target} onClick={close} className="btn-primary">{mode === "guest" ? "Sign in to set up" : "Set up my phone"}</Link>
              <button onClick={close} className="btn-ghost">Maybe later</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
