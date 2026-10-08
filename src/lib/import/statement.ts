import Decimal from "decimal.js";
import { categorize, type CategoryRule } from "../parser/categorize";
import { findKnownMerchant, titleCase } from "../parser/merchants";
import { findDuplicate } from "../parser/parse";
import type { Tx, TxInput } from "../types";
import { detectDayFirst, parseAmount, parseDateCell } from "./normalize";

export type Cell = string | number | Date | null | undefined;
export type ColumnKey = "date" | "description" | "debit" | "credit" | "amount" | "balance";
export type Mapping = Partial<Record<ColumnKey, number>>;

const HEADERS: Record<ColumnKey, RegExp> = {
  date: /^(transaction |txn |trans\.? |posting |posted )?date|^posted$/i,
  description: /description|details|narration|particulars|merchant|remarks|payee/i,
  debit: /debit|withdraw|paid out|money out|^dr\b/i,
  credit: /credit|deposit|paid in|money in|^cr\b/i,
  amount: /^amount|^transaction amount|^value$/i,
  balance: /balance|^bal\b/i,
};

const text = (c: Cell) => (c instanceof Date ? c.toISOString() : String(c ?? "")).trim();

/** Finds the header row (within the first 25 rows) and maps columns by their titles. */
export function detectColumns(rows: Cell[][]): { headerRow: number; mapping: Mapping } | null {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const mapping: Mapping = {};
    const used = new Set<number>();
    rows[r].forEach((cell, i) => {
      const t = text(cell);
      if (!t) return;
      for (const key of Object.keys(HEADERS) as ColumnKey[]) {
        if (mapping[key] === undefined && !used.has(i) && HEADERS[key].test(t) && !(key === "date" && /value date/i.test(t) && rows[r].some((c) => /^(transaction|txn|trans)/i.test(text(c))))) {
          mapping[key] = i; used.add(i); break;
        }
      }
    });
    if (mapping.date !== undefined && (mapping.amount !== undefined || mapping.debit !== undefined || mapping.credit !== undefined)) {
      return { headerRow: r, mapping };
    }
  }
  return null;
}

export type Candidate = {
  rowIndex: number;
  input: TxInput;
  confidence: number;
  duplicate: boolean;
  issue?: string;
};

export type BuildOptions = {
  currency: TxInput["currency"];
  accountId?: string;
  /** Flip the meaning of signed amounts when the bank shows spending as positive. */
  invertSign?: boolean;
  rules?: CategoryRule[];
  existing?: Tx[];
  dayFirst?: boolean;
};

/** Strip common statement prefixes and reference noise to get a merchant-like name. */
export function cleanDescription(desc: string): string {
  return desc
    .replace(/\b(pos|ecom|atm|purchase|debit card|card|txn|transaction|payment to|payment|ref|reference)\b[-:#/ ]*/gi, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
    .replace(/[*#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function buildCandidates(rows: Cell[][], headerRow: number, mapping: Mapping, o: BuildOptions): Candidate[] {
  const body = rows.slice(headerRow + 1);
  const dayFirst = o.dayFirst ?? detectDayFirst(body.map((r) => text(r[mapping.date ?? 0])));
  const out: Candidate[] = [];
  const seen: Tx[] = [];

  body.forEach((r, i) => {
    const rowIndex = headerRow + 1 + i;
    const date = parseDateCell(r[mapping.date ?? -1], dayFirst);
    if (!date) return; // totals, blank lines and notes under the table are skipped

    // Work out signed money movement: negative = money out.
    let signed: Decimal | null = null;
    const debit = mapping.debit !== undefined ? parseAmount(r[mapping.debit] as string | number) : null;
    const credit = mapping.credit !== undefined ? parseAmount(r[mapping.credit] as string | number) : null;
    if (debit && !debit.value.isZero()) signed = debit.value.abs().neg();
    else if (credit && !credit.value.isZero()) signed = credit.value.abs();
    else if (mapping.amount !== undefined) {
      const a = parseAmount(r[mapping.amount] as string | number);
      if (a) {
        signed = a.direction !== 0 ? a.value.times(a.direction) : a.negative ? a.value.neg() : a.value;
        if (o.invertSign && a.direction === 0) signed = signed.neg();
      }
    }
    if (!signed || signed.isZero()) return;

    const description = text(r[mapping.description ?? -1]);
    const cleaned = cleanDescription(description);
    const known = cleaned ? findKnownMerchant(cleaned) : undefined;
    const merchant = known?.display ?? titleCase(cleaned);
    const type = signed.isNegative() ? "EXPENSE" : "INCOME";
    const cat = categorize({ merchant, description, type }, o.rules);

    const input: TxInput = {
      amount: signed.abs().toFixed(2), currency: o.currency, type, category: cat.category, merchant,
      date, notes: description.slice(0, 200), source: "IMPORT", accountId: o.accountId,
    };
    const dup = findDuplicate(input, [...(o.existing ?? []), ...seen]);
    seen.push({ ...input, id: `row-${rowIndex}` });
    out.push({ rowIndex, input, confidence: cat.confidence, duplicate: !!dup, issue: description ? undefined : "No description" });
  });
  return out;
}
