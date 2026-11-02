"use client";

import { ArrowLeft, Bell, Download, LogIn, LogOut, Moon, Sun, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/store/data-provider";
import { useNotifications } from "@/lib/store/notifications";
import { NotificationPanel } from "./notification-bell";
import type { Install } from "./pwa";

const row = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors hover:bg-surface-2";

/** Phones and tablets: one profile button that holds the header actions (install, notifications, theme, sign out). */
export function ProfileMenu({ dark, onToggleTheme, install }: { dark: boolean; onToggleTheme: () => void; install: Install }) {
  const { mode, session, signOut } = useData();
  const { unread } = useNotifications(mode);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "notifications">("menu");
  const [tip, setTip] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const close = () => { setOpen(false); setView("menu"); setTip(false); };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setView("menu"); setTip(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setView("menu"); setTip(false); } };
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open]);

  const initial = session?.name?.trim().charAt(0).toUpperCase();

  return (
    <div ref={box} className="relative lg:hidden">
      <button
        aria-label="Profile menu" aria-expanded={open} aria-haspopup="menu"
        onClick={() => (open ? close() : setOpen(true))}
        className="btn-ghost relative size-10 !rounded-full !p-0"
      >
        {mode === "user" && initial ? <span className="text-sm font-semibold">{initial}</span> : <User size={18} />}
        {unread > 0 && <span className="absolute right-0 top-0 size-2.5 rounded-full bg-danger" />}
      </button>

      {open && (
        <div role="menu" className="card absolute right-0 z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] p-2">
          {view === "notifications" ? (
            <>
              <button className="mb-1 flex items-center gap-2 px-2 py-1 text-xs text-muted hover:text-foreground" onClick={() => setView("menu")}><ArrowLeft size={14} /> Back</button>
              <NotificationPanel />
            </>
          ) : (
            <>
              <div className="border-b border-border px-3 pb-2 pt-1">
                <p className="truncate text-sm font-medium">{mode === "user" ? session?.name : "Guest"}</p>
                <p className="truncate text-xs text-muted">
                  {mode === "user" ? session?.email : "Saved on this device only"}
                  {session?.role === "SUPER_ADMIN" && " · Super admin"}
                </p>
              </div>
              <div className="pt-1">
                <button role="menuitem" className={row} onClick={() => { setView("notifications"); }}>
                  <Bell size={17} /> <span className="flex-1">Notifications</span>
                  {unread > 0 && <span className={cn("rounded-full bg-danger px-2 py-0.5 text-xs text-white")}>{unread}</span>}
                </button>
                {install.available && (
                  <>
                    <button role="menuitem" className={row} onClick={() => (install.needsManualSteps ? setTip(!tip) : (void install.install(), close()))}>
                      <Download size={17} /> Install app
                    </button>
                    {tip && <p className="px-3 pb-2 text-xs text-muted">In Safari, tap the Share button, then <b>Add to Home Screen</b>.</p>}
                  </>
                )}
                <button role="menuitem" className={row} onClick={onToggleTheme}>
                  {dark ? <Sun size={17} /> : <Moon size={17} />} {dark ? "Light mode" : "Dark mode"}
                </button>
                {mode === "user" ? (
                  <button role="menuitem" className={cn(row, "text-danger")} onClick={() => { close(); void signOut(); }}><LogOut size={17} /> Sign out</button>
                ) : (
                  <Link role="menuitem" href="/login" className={row} onClick={close}><LogIn size={17} /> Sign in</Link>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
