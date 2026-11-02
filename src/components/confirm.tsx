"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Options = { title: string; message?: string; confirmLabel?: string; danger?: boolean };
type Ask = (options: Options) => Promise<boolean>;

const Ctx = createContext<Ask | null>(null);

/** `const confirm = useConfirm(); if (await confirm({ title: "Delete…" })) …` — a styled replacement for window.confirm. */
export function useConfirm(): Ask {
  const ask = useContext(Ctx);
  if (!ask) throw new Error("useConfirm outside ConfirmProvider");
  return ask;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Options | null>(null);
  const resolve = useRef<((ok: boolean) => void) | null>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);

  const ask = useCallback<Ask>((o) => new Promise((res) => {
    resolve.current?.(false); // a second question cancels the first
    resolve.current = res;
    setOptions(o);
  }), []);

  const answer = useCallback((ok: boolean) => {
    resolve.current?.(ok);
    resolve.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return;
    cancelBtn.current?.focus(); // the safe choice is the one Enter picks
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); answer(false); } };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [options, answer]);

  return (
    <Ctx.Provider value={ask}>
      {children}
      <AnimatePresence>
        {options && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            onMouseDown={() => answer(false)}
          >
            <motion.div
              role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={options.message ? "confirm-message" : undefined}
              initial={{ y: 24, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 340, damping: 30 }}
              onMouseDown={(e) => e.stopPropagation()}
              className="card w-full max-w-sm space-y-4 p-5"
            >
              <div className="space-y-1.5">
                <h2 id="confirm-title" className="text-lg font-semibold">{options.title}</h2>
                {options.message && <p id="confirm-message" className="text-sm text-muted">{options.message}</p>}
              </div>
              <div className="flex gap-3">
                <button ref={cancelBtn} type="button" className="btn-ghost min-h-11 flex-1" onClick={() => answer(false)}>Cancel</button>
                <button
                  type="button" onClick={() => answer(true)}
                  className={cn("btn min-h-11 flex-1", options.danger === false ? "bg-primary text-primary-fg hover:opacity-90" : "bg-danger text-white hover:opacity-90")}
                >{options.confirmLabel ?? "Delete"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
