import { describe, expect, it } from "vitest";
import { pdfLinesToRows } from "./pdf-lines";
import { buildCandidates, detectColumns } from "./statement";

describe("pdfLinesToRows", () => {
  const lines = [
    "Statement of account",
    "Date Description Amount Balance",
    "01/10/2026 Opening balance 2,500.00",
    "08/10/2026 POS TALABAT DUBAI 45.00 2,455.00",
    "09/10/2026 SALARY CREDIT 5,000.00 7,455.00",
    "10/10/2026 CARREFOUR UAE 135.75 7,319.25",
    "Page 1 of 2",
  ];
  it("infers debit/credit from the running balance and ignores non-transaction lines", () => {
    const rows = pdfLinesToRows(lines);
    expect(rows.slice(1).map((r) => [r[1], r[2]])).toEqual([
      ["POS TALABAT DUBAI", "-45.00"], ["SALARY CREDIT", "5000.00"], ["CARREFOUR UAE", "-135.75"],
    ]);
  });
  it("flows through the normal importer", () => {
    const rows = pdfLinesToRows(lines);
    const d = detectColumns(rows)!;
    const c = buildCandidates(rows, d.headerRow, d.mapping, { currency: "AED" });
    expect(c.find((x) => x.input.merchant === "Talabat")?.input).toMatchObject({ type: "EXPENSE", amount: "45.00" });
  });
  it("honours Dr/Cr markers and dotted dates", () => {
    const rows = pdfLinesToRows(["08.10.2026 NETFLIX 55.00 DR", "09.10.2026 REFUND 20.00 CR"]);
    expect(rows.slice(1).map((r) => r[2])).toEqual(["-55.00", "20.00"]);
  });
});
