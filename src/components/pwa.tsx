"use client";

import { Download, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registers the service worker (production only), shows connection status and the "update ready" prompt. */
export function PwaRegister() {
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const userAskedUpdate = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) setWaiting(w);
          });
        });
      }).catch(() => {});
      // Reload only after the user chose "Update". The first install also fires controllerchange; that must not reload.
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (userAskedUpdate.current && !reloaded) { reloaded = true; location.reload(); }
      });
    }
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  return (
    <>
      {!online && (
        <div role="status" className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warning px-3 py-1.5 text-xs font-medium text-black">
          <WifiOff size={14} /> You're offline. Changes are saved on this device and will sync when you're back.
        </div>
      )}
      {waiting && (
        <div role="alert" className="card fixed bottom-24 left-4 right-4 z-[60] flex items-center justify-between gap-3 p-3 text-sm md:bottom-4 md:left-auto md:w-96">
          <span>A new version is available.</span>
          <button className="btn-primary !min-h-9" onClick={() => { userAskedUpdate.current = true; waiting.postMessage("SKIP_WAITING"); }}>Update</button>
        </div>
      )}
    </>
  );
}

export function InstallButton() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [tip, setTip] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (standalone) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const h = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", () => setEvt(null));
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  if (!evt && !ios) return null;
  return (
    <div className="relative">
      <button className="btn-ghost" onClick={async () => { if (evt) { await evt.prompt(); setEvt(null); } else setTip(!tip); }}>
        <Download size={16} /> <span className="hidden sm:inline">Install</span>
      </button>
      {tip && <p className="card absolute right-0 z-50 mt-2 w-64 p-3 text-xs text-muted">In Safari, tap the Share button, then <b>Add to Home Screen</b>.</p>}
    </div>
  );
}
