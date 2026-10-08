import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { parseAmount, detectDayFirst, parseDateCell } from "./normalize";
import { buildCandidates, detectColumns } from "./statement";
import type { Tx } from "../types";

describe("parseCsv", () => {
  it("handles quotes, embedded commas/newlines and BOM", () => {
    const r = parseCsv('﻿Date,Description,Amount\n08/10/2026,"TALABAT, DUBAI ""AE""",-45.00\n09/10/2026,"line1\nline2",10');
    expect(r[1]).toEqual(["08/10/2026", 'TALABAT, DUBAI "AE"', "-45.00"]);
    expect(r[2][1]).toBe("line1\nline2");
  });
  it("detects semicolons and tabs", () => {
    expect(parseCsv("a;b;c\n1;2;3")[1]).toEqual(["1", "2", "3"]);
    expect(parseCsv("a\tb\n1\t2")[1]).toEqual(["1", "2"]);
  });
});

describe("parseAmount", () => {
  const v = (s: string) => parseAmount(s)?.value.toString();
  it("separators", () => {
    expect(v("1,234.56")).toBe("1234.56");
    expect(v("1.234,56")).toBe("1234.56");
    expect(v("12,5")).toBe("12.5");
    expect(v("1,234")).toBe("1234");
    expect(v("1,234,567.89")).toBe("1234567.89");
    expect(v("AED 45.00")).toBe("45");
  });
  it("sign markers", () => {
    expect(parseAmount("(45.00)")?.negative).toBe(true);
    expect(parseAmount("-45")?.negative).toBe(true);
    expect(parseAmount("45.00 DR")?.direction).toBe(-1);
    expect(parseAmount("45.00 Cr")?.direction).toBe(1);
  });
  it("rejects non-numbers", () => {
    expect(parseAmount("n/a")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("dates", () => {
  it("infers day-first vs month-first from the data", () => {
    expect(detectDayFirst(["08/10/2026", "25/10/2026"])).toBe(true);
    expect(detectDayFirst(["10/25/2026"])).toBe(false);
  });
  it("accepts Date objects and Excel serials", () => {
    expect(new Date(parseDateCell(new Date(2026, 9, 8), true)!).getDate()).toBe(8);
    expect(new Date(parseDateCell(46303, true)!).getFullYear()).toBe(2026); // 8 Oct 2026
  });
});

describe("statement building", () => {
  const rows = parseCsv([
    "ACCOUNT STATEMENT,,,,",
    "Account: 1234,,,,",
    "Date,Description,Debit,Credit,Balance",
    "08/10/2026,POS PURCHASE TALABAT DUBAI 55512345,45.00,,2455.00",
    "09/10/2026,SALARY CREDIT,,5000.00,7455.00",
    "10/10/2026,CARREFOUR UAE,135.75,,7319.25",
    "Total,,180.75,5000.00,",
  ].join("\n"));

  it("finds the header below preamble rows", () => {
    const d = detectColumns(rows)!;
    expect(d.headerRow).toBe(2);
    expect(d.mapping).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3, balance: 4 });
  });
  it("builds typed, categorised candidates and skips totals", () => {
    const d = detectColumns(rows)!;
    const c = buildCandidates(rows, d.headerRow, d.mapping, { currency: "AED" });
    expect(c).toHaveLength(3);
    expect(c[0].input).toMatchObject({ type: "EXPENSE", amount: "45.00", merchant: "Talabat", category: "Food & Dining", source: "IMPORT" });
    expect(c[1].input).toMatchObject({ type: "INCOME", amount: "5000.00" });
    expect(c[2].input).toMatchObject({ merchant: "Carrefour", category: "Groceries" });
  });
  it("supports a single signed Amount column, with invert", () => {
    const r = parseCsv("Date,Details,Amount\n2026-10-08,Netflix,-55.00\n2026-10-09,Refund,20.00");
    const d = detectColumns(r)!;
    expect(buildCandidates(r, d.headerRow, d.mapping, { currency: "AED" }).map((c) => c.input.type)).toEqual(["EXPENSE", "INCOME"]);
    expect(buildCandidates(r, d.headerRow, d.mapping, { currency: "AED", invertSign: true }).map((c) => c.input.type)).toEqual(["INCOME", "EXPENSE"]);
  });
  it("flags duplicates against existing transactions and within the file", () => {
    const existing: Tx = { id: "x", amount: "45.00", currency: "AED", type: "EXPENSE", category: "Food & Dining", merchant: "Talabat", notes: "", date: new Date(2026, 9, 8, 12).toISOString() };
    const d = detectColumns(rows)!;
    expect(buildCandidates(rows, d.headerRow, d.mapping, { currency: "AED", existing: [existing] })[0].duplicate).toBe(true);
    const twice = parseCsv("Date,Description,Amount\n08/10/2026,UBER,-20\n08/10/2026,UBER,-20");
    const dd = detectColumns(twice)!;
    expect(buildCandidates(twice, dd.headerRow, dd.mapping, { currency: "AED" }).map((c) => c.duplicate)).toEqual([false, true]);
  });
});
