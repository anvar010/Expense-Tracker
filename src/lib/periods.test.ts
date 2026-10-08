import { describe, expect, it } from "vitest";
import { inPeriod } from "./periods";
import type { Tx } from "./types";

const t = (date: string): Tx => ({ id: date, amount: "1", currency: "AED", type: "EXPENSE", category: "Other", merchant: "", notes: "", date });
const now = new Date(2026, 9, 8, 12); // Thu 8 Oct 2026

describe("inPeriod", () => {
  const all = [t(new Date(2026, 9, 1, 12).toISOString()), t(new Date(2026, 8, 30, 12).toISOString()), t(new Date(2026, 9, 8, 9).toISOString())];
  it("this month", () => expect(inPeriod(all, "month", now)).toHaveLength(2));
  it("last month", () => expect(inPeriod(all, "last", now)).toHaveLength(1));
  it("today", () => expect(inPeriod(all, "today", now)).toHaveLength(1));
  it("week starts Monday (5 Oct)", () => expect(inPeriod(all, "week", now)).toHaveLength(1));
});
