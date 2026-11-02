"use client";

import { CloudOff, FileUp, Landmark, LayoutDashboard, LogIn, LogOut, MessageSquareText, Moon, PiggyBank, Receipt, ShieldCheck, Sparkles, Sun } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/store/data-provider";
import { AppleIcon } from "./apple-icon";
import { BudgetAlerts } from "./budget-alerts";
import { ConfirmProvider } from "./confirm";
import { Dock, type DockItem } from "./dock";
import { NotificationBell } from "./notification-bell";
import { ProfileMenu } from "./profile-menu";
import { InstallButton, useInstall } from "./pwa";
import { TxDialog } from "./tx-dialog";

// First three stay on the phone's tab bar; the rest sit behind "More" there and fill the desktop dock.
const PRIMARY: DockItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
];
const MORE: DockItem[] = [
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/messages", label: "Messages", icon: MessageSquareText },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/import", label: "Import", icon: FileUp },
  { href: "/wallet", label: "Apple Pay", icon: AppleIcon },
];
const ADMIN_ITEM: DockItem = { href: "/admin", label: "Users", icon: ShieldCheck };

function StatusPill() {
  const { mode, session, sync, pending } = useData();
  if (mode === "loading") return null;
  if (mode === "guest")
    return <span className="whitespace-nowrap rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">Guest<span className="hidden sm:inline"> · saved on this device</span></span>;
  return (
    <span title={session?.email} className={cn("inline-flex max-w-[14rem] items-center gap-1.5 truncate whitespace-nowrap rounded-full px-3 py-1 text-xs",
      sync === "offline" ? "bg-warning/15 text-warning" : "bg-accent/15 text-accent")}>
      {sync === "offline" && <CloudOff size={12} />}
      {sync === "offline" ? `Offline · ${pending} waiting to sync` : sync === "syncing" ? "Syncing…" : session?.name}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { mode, session, signOut } = useData();
  const [adding, setAdding] = useState(false);
  const [dark, setDark] = useState(false);
  const install = useInstall();
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("et:theme", next ? "dark" : "light"); } catch {}
    setDark(next);
  };

  return (
    <ConfirmProvider>
    <div className="min-h-dvh pb-36">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/tenzo-icon.png" alt="Tenzo" width={32} height={32} className="size-8 rounded-xl bg-white object-contain p-0.5" />
              <span className="hidden sm:inline">Spendly</span>
            </Link>
            <StatusPill />
          </div>
          <div className="flex items-center gap-2">
            {/* Wide screens keep the buttons in the bar; phones and tablets fold them into the profile menu. */}
            <div className="hidden items-center gap-2 lg:flex">
              <InstallButton install={install} />
              <NotificationBell />
              <motion.button whileTap={{ rotate: 25, scale: 0.9 }} onClick={toggleTheme} aria-label="Toggle theme" className="btn-ghost size-10 !p-0">
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </motion.button>
              {mode === "user" && <button onClick={signOut} className="btn-ghost"><LogOut size={16} /> Sign out</button>}
            </div>
            {mode === "guest" && <Link href="/login" className="btn-primary"><LogIn size={16} /> Sign in</Link>}
            {mode !== "loading" && <ProfileMenu dark={dark} onToggleTheme={toggleTheme} install={install} />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 md:p-8">
        {/* Pages read the clock and local data, so they render only on the client once data has loaded. */}
        {mode === "loading" ? <p className="text-sm text-muted">Loading…</p> : children}
      </main>

      {/* The dock reads the URL, which is unknown while a dynamic route (e.g. /admin/[id]) is prerendered. */}
      <Suspense fallback={null}>
        <Dock primary={PRIMARY} more={session?.role === "SUPER_ADMIN" ? [...MORE, ADMIN_ITEM] : MORE} onAdd={() => setAdding(true)} />
      </Suspense>
      <BudgetAlerts />
      <TxDialog open={adding} onClose={() => setAdding(false)} />
    </div>
    </ConfirmProvider>
  );
}
