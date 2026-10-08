"use client";

import { useEffect } from "react";
import { fmt } from "@/lib/analytics";
import { budgetProgress } from "@/lib/budgets";
import { useData } from "@/lib/store/data-provider";
import { ls } from "@/lib/store/storage";
import { pushNotification } from "@/lib/store/notifications";
import { useCollection } from "@/lib/store/use-collection";
import type { Budget } from "@/lib/types";

/** Fires one notification per budget per period when spending first crosses 80%, 90% or 100%. */
export function BudgetAlerts() {
  const { txs, mode } = useData();
  const { items: budgets } = useCollection<Budget>("budgets");

  useEffect(() => {
    if (mode === "loading" || !budgets.length) return;
    const key = `et:alerted:${mode}`;
    const seen = ls.read<Record<string, true>>(key, {});
    let changed = false;
    for (const b of budgets) {
      const p = budgetProgress(b, txs);
      const fresh = p.crossed.filter((t) => !seen[`${b.id}:${+p.range[0]}:${t}`]);
      if (!fresh.length) continue;
      for (const t of p.crossed) seen[`${b.id}:${+p.range[0]}:${t}`] = true;
      changed = true;
      const top = Math.max(...fresh);
      const label = b.category || "Overall";
      pushNotification(mode, {
        title: top >= 100 ? `${label} budget exceeded` : `${label} budget at ${top}%`,
        message: `${fmt(p.spent, b.currency)} of ${fmt(b.amount, b.currency)} spent this ${b.period === "WEEKLY" ? "week" : "period"}.`,
      });
    }
    if (changed) ls.write(key, seen);
  }, [txs, budgets, mode]);

  return null;
}
