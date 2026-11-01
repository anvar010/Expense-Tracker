"use client";

import { Check, ChevronDown } from "lucide-react";
import { Children, forwardRef, isValidElement, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type Opt = { value: string; label: ReactNode; text: string; disabled: boolean };

function readOptions(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const p = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
    if (child.type === "option") {
      const text = Children.toArray(p.children).join("");
      out.push({ value: String(p.value ?? text), label: p.children, text, disabled: !!p.disabled });
    } else if (p.children) out.push(...readOptions(p.children)); // fragments
  });
  return out;
}

/**
 * Drop-in replacement for <select> with a styled menu. A visually hidden native <select> still holds the value,
 * so react-hook-form's register() and plain value/onChange work unchanged.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, id, "aria-label": ariaLabel, disabled, ...rest }, ref,
) {
  const native = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  useImperativeHandle(ref, () => native.current as HTMLSelectElement);
  const listId = useId();
  const options = readOptions(children);

  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number }>();

  // Mirror the native select's value (set by React for controlled use, or by react-hook-form for uncontrolled).
  useEffect(() => {
    const v = native.current?.value ?? "";
    if (v !== value) setValue(v);
  });

  const selected = options.find((o) => o.value === value);

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const flip = below < 200 && above > below;
    const maxHeight = Math.min(320, flip ? above : below);
    // Keep the menu fully on screen: pin it within an 8px margin, so triggers at the right edge don't push it off.
    const width = Math.min(Math.max(r.width, 160), window.innerWidth - 16);
    const left = Math.min(Math.max(r.left, 8), window.innerWidth - width - 8);
    setPos({ left, width, maxHeight, ...(flip ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
  }, []);

  const openMenu = () => {
    if (disabled) return;
    place();
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const choose = (o: Opt) => {
    const el = native.current;
    if (!el || o.disabled) return;
    if (el.value !== o.value) {
      el.value = o.value;
      el.dispatchEvent(new Event("change", { bubbles: true })); // reaches both React's onChange and react-hook-form
    }
    setValue(o.value);
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || trigger.current?.contains(t)) return;
      e.stopPropagation(); // the first outside click only closes the menu (not a dialog behind it)
      setOpen(false);
    };
    const close = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", outside, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const move = (dir: 1 | -1) => {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openMenu(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <>
      <select ref={native} className="sr-only" tabIndex={-1} aria-hidden disabled={disabled} {...rest}>{children}</select>
      <button
        ref={trigger} id={id} type="button" disabled={disabled}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())} onKeyDown={onKeyDown}
        className={cn("input flex items-center justify-between gap-2 text-left disabled:opacity-60", className)}
      >
        <span className="truncate">{selected?.label ?? selected?.text ?? " "}</span>
        <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && pos && createPortal(
        <ul
          ref={menu} id={listId} role="listbox"
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          className="z-[70] overflow-y-auto rounded-xl border border-border bg-surface p-1 text-sm shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
        >
          {options.map((o, i) => (
            <li
              key={`${o.value}-${i}`} data-i={i} role="option" aria-selected={o.value === value} aria-disabled={o.disabled}
              onMouseEnter={() => setActive(i)} onClick={() => choose(o)}
              className={cn(
                "flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-3",
                i === active && "bg-surface-2", o.value === value && "font-medium", o.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check size={16} className="shrink-0 text-primary" />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
});
