import type { Tx } from "./types";

export const PERIODS = [
  { id: "month", label: "This month" },
  { id: "last", label: "Last month" },
  { id: "week", label: "This week" },
  { id: "today", label: "Today" },
  { id: "all", label: "All time" },
] as const;
export type PeriodId = (typeof PERIODS)[number]["id"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function rangeFor(id: PeriodId, now = new Date()): [Date, Date] | null {
  const today = startOfDay(now);
  switch (id) {
    case "today": return [today, new Date(+today + 864e5)];
    case "week": {
      const mondayOffset = (today.getDay() + 6) % 7;
      const s = new Date(+today - mondayOffset * 864e5);
      return [s, new Date(+s + 7 * 864e5)];
    }
    case "month": return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
    case "last": return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
    case "all": return null;
  }
}

export function inPeriod(txs: Tx[], id: PeriodId, now = new Date()): Tx[] {
  const r = rangeFor(id, now);
  if (!r) return txs;
  return txs.filter((t) => { const d = new Date(t.date); return d >= r[0] && d < r[1]; });
}
