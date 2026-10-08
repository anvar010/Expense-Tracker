"use client";

import { AnimatePresence, motion } from "motion/react";
import { Ellipsis, Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export type DockItem = { href: string; label: string; icon: LucideIcon };

const PILL = { type: "spring", stiffness: 380, damping: 32 } as const;

function DockLink({ item, active, pillId, compact }: { item: DockItem; active: boolean; pillId: string; compact?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium text-muted transition-colors hover:text-foreground aria-[current=page]:text-foreground",
        compact ? "min-w-0 flex-1 px-1" : "min-w-[4.5rem] px-1.5 lg:min-w-[6rem] lg:gap-1.5 lg:px-3 lg:py-3 lg:text-xs xl:min-w-[7.25rem]",
      )}
    >
      {active && <motion.span layoutId={pillId} transition={PILL} className="absolute inset-0 rounded-2xl bg-surface-2" />}
      <motion.span whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} transition={PILL} className="relative">
        <Icon strokeWidth={active ? 2.2 : 1.8} className={compact ? "size-5" : "size-5 lg:size-6"} />
      </motion.span>
      <span className="relative">{item.label}</span>
    </Link>
  );
}

/**
 * Navigation for every screen size. Same idea everywhere: icon over label, a pill that slides to the
 * current page, and the Add action in the middle.
 */
export function Dock({ primary, more, onAdd }: { primary: DockItem[]; more: DockItem[]; onAdd: () => void }) {
  const path = usePathname();
  const [sheet, setSheet] = useState(false);
  const all = [...primary, ...more];
  const left = all.slice(0, 4);
  const right = all.slice(4);
  const isActive = (href: string) => path.startsWith(href);
  const moreActive = more.some((m) => isActive(m.href));

  useEffect(() => setSheet(false), [path]);
  useEffect(() => {
    if (!sheet) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setSheet(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [sheet]);

  return (
    <>
      {/* Desktop and tablet: every page in one floating dock, Add in the centre. */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-5 z-30 hidden justify-center px-4 md:flex">
        <motion.div
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 26, delay: 0.1 }}
          className="glass flex items-center gap-1 rounded-3xl p-1.5 lg:gap-2 lg:p-2"
        >
          {left.map((i) => <DockLink key={i.href} item={i} active={isActive(i.href)} pillId="pill-desktop" />)}
          <motion.button
            type="button" aria-label="Add transaction" onClick={onAdd} whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} transition={PILL}
            className="mx-1 flex min-w-[4.5rem] flex-col items-center gap-1 rounded-2xl bg-accent px-1.5 py-2 text-[11px] font-semibold lg:mx-2 lg:min-w-[6.5rem] lg:gap-1.5 lg:px-4 lg:py-3 lg:text-xs xl:min-w-[7.5rem] text-emerald-950 shadow-[0_8px_24px_-8px_rgb(16_185_129/0.7)]"
          >
            <Plus strokeWidth={2.4} className="size-5 lg:size-6" /> Add
          </motion.button>
          {right.map((i) => <DockLink key={i.href} item={i} active={isActive(i.href)} pillId="pill-desktop" />)}
        </motion.div>
      </nav>

      {/* Phones: four tabs plus a "More" sheet, with the same centre Add. */}
      <nav aria-label="Main" className="glass fixed inset-x-3 bottom-3 z-30 flex items-end rounded-3xl p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:hidden">
        <DockLink item={primary[0]} active={isActive(primary[0].href)} pillId="pill-mobile" compact />
        <DockLink item={primary[1]} active={isActive(primary[1].href)} pillId="pill-mobile" compact />
        <div className="flex flex-1 justify-center">
          <motion.button
            type="button" aria-label="Add transaction" onClick={onAdd} whileTap={{ scale: 0.92 }} transition={PILL}
            className="-mt-7 grid size-14 place-items-center rounded-full bg-accent text-emerald-950 shadow-[0_10px_28px_-6px_rgb(16_185_129/0.75)] ring-4 ring-background"
          >
            <Plus size={26} strokeWidth={2.4} />
          </motion.button>
        </div>
        <DockLink item={primary[2]} active={isActive(primary[2].href)} pillId="pill-mobile" compact />
        <button
          type="button" aria-label="More pages" aria-expanded={sheet} onClick={() => setSheet(!sheet)}
          className={cn("relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-medium text-muted", (sheet || moreActive) && "text-foreground")}
        >
          {moreActive && !sheet && <motion.span layoutId="pill-mobile" transition={PILL} className="absolute inset-0 rounded-2xl bg-surface-2" />}
          <Ellipsis size={20} className="relative" /> <span className="relative">More</span>
        </button>
      </nav>

      <AnimatePresence>
        {sheet && (
          <>
            <motion.div key="scrim" className="fixed inset-0 z-20 bg-black/30 backdrop-blur-[2px] md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)} />
            <motion.div
              key="sheet" role="dialog" aria-label="More pages"
              initial={{ y: 30, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="glass fixed inset-x-3 bottom-24 z-30 grid grid-cols-3 gap-1 rounded-3xl p-2 md:hidden"
            >
              {more.map((m) => {
                const Icon = m.icon;
                return (
                  <Link key={m.href} href={m.href} aria-current={isActive(m.href) ? "page" : undefined}
                    className="flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground aria-[current=page]:bg-surface-2 aria-[current=page]:text-foreground">
                    <Icon size={22} strokeWidth={1.8} /> {m.label}
                  </Link>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
