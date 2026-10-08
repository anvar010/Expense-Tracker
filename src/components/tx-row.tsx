import { cn } from "@/lib/cn";
import { fmt } from "@/lib/analytics";
import type { Tx } from "@/lib/types";

export function amountClass(t: Tx) {
  return t.type === "INCOME" || t.type === "REFUND" ? "text-accent" : t.type === "EXPENSE" ? "" : "text-muted";
}
export const signed = (t: Tx) =>
  `${t.type === "INCOME" || t.type === "REFUND" ? "+" : t.type === "EXPENSE" ? "−" : ""}${fmt(t.amount, t.currency)}`;

export function TxItem({ t, onClick }: { t: Tx; onClick?: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition hover:bg-surface-2/60 rounded-xl">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{t.merchant || t.category}</span>
          <span className="block truncate text-xs text-muted">{t.category} · {new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
        </span>
        <span className={cn("num shrink-0 text-sm font-semibold", amountClass(t))}>{signed(t)}</span>
      </button>
    </li>
  );
}
