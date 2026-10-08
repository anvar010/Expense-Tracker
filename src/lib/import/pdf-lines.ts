import Decimal from "decimal.js";
import type { Cell } from "./statement";
import { parseAmount } from "./normalize";

const DATE = String.raw`(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{1,2}[ \-][A-Za-z]{3,9}[ \-,]+\d{2,4}|\d{4}-\d{2}-\d{2})`;
const LINE = new RegExp(`^${DATE}\\s+(.*)$`);
const TRAILING_NUM = /\s+(\(?-?[\d,]+\.\d{2}\)?(?:\s?(?:DR|CR))?)\s*$/i;

/**
 * Best-effort: turns text lines of a PDF statement into [Date, Description, Amount, Balance] rows.
 * Debit/credit is not visible in plain text, so when two numbers end a line (amount, balance) the
 * direction is taken from how the running balance moved. Always shown to the user for confirmation.
 */
export function pdfLinesToRows(lines: string[]): Cell[][] {
  const rows: Cell[][] = [["Date", "Description", "Amount", "Balance"]];
  let prev: Decimal | null = null;

  for (const raw of lines) {
    const m = raw.trim().replace(/\s+/g, " ").match(LINE);
    if (!m) continue;
    let rest = m[2];
    const nums: string[] = [];
    for (let i = 0; i < 2; i++) {
      const t = rest.match(TRAILING_NUM);
      if (!t) break;
      nums.unshift(t[1]);
      rest = rest.slice(0, t.index);
    }
    if (!nums.length) continue;

    // "Opening balance 2,500.00" seeds the running balance; it is not a transaction.
    if (nums.length === 1 && /opening|brought forward|b\/f|closing|carried forward|balance/i.test(rest)) {
      prev = parseAmount(nums[0])?.value ?? prev;
      continue;
    }

    const amount = parseAmount(nums[0]);
    const balance = nums.length === 2 ? parseAmount(nums[1]) : null;
    if (!amount) continue;
    let signed = amount.direction !== 0 ? amount.value.times(amount.direction) : amount.negative ? amount.value.neg() : amount.value;

    if (balance && prev && amount.direction === 0 && !amount.negative) {
      const delta = balance.value.minus(prev);
      if (delta.abs().minus(amount.value).abs().lte(0.01)) signed = delta.isNegative() ? amount.value.neg() : amount.value;
    }
    if (balance) prev = balance.value;
    rows.push([m[1], rest.trim(), signed.toFixed(2), balance ? balance.value.toFixed(2) : ""]);
  }
  return rows;
}
