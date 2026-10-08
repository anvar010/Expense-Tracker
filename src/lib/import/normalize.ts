import Decimal from "decimal.js";
import { extractDate } from "../parser/parse";

export type ParsedAmount = { value: Decimal; negative: boolean; direction: -1 | 0 | 1 };

/**
 * Parses statement amounts: "1,234.56", "1.234,56", "(45.00)", "-45", "AED 45.00 DR", "12,5".
 * `direction` is -1 for Dr/debit markers, 1 for Cr/credit markers, else 0.
 */
export function parseAmount(raw: string | number | null | undefined, decimalSeparator?: "." | ","): ParsedAmount | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? { value: new Decimal(Math.abs(raw)), negative: raw < 0, direction: 0 } : null;
  let s = raw.trim();
  const direction: -1 | 0 | 1 = /\b(dr|debit)\b/i.test(s) ? -1 : /\b(cr|credit)\b/i.test(s) ? 1 : 0;
  const negative = /^\(.*\)$/.test(s) || /(^|\s)-|-\s*$/.test(s.replace(/[A-Za-z]/g, ""));
  s = s.replace(/[^0-9.,]/g, "");
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  const sepIdx = Math.max(lastDot, lastComma);
  let normalized: string;
  if (sepIdx === -1) normalized = s;
  else {
    const sep = s[sepIdx] as "." | ",";
    const after = s.length - sepIdx - 1;
    const other = sep === "." ? "," : ".";
    const looksDecimal = decimalSeparator ? sep === decimalSeparator && after <= 2 : after > 0 && after <= 2 && (s.split(sep).length === 2 || s.includes(other));
    normalized = looksDecimal
      ? s.slice(0, sepIdx).replace(/[.,]/g, "") + "." + s.slice(sepIdx + 1)
      : s.replace(/[.,]/g, ""); // thousands separators only
  }
  try {
    const value = new Decimal(normalized);
    return { value, negative, direction };
  } catch {
    return null;
  }
}

export function detectDayFirst(samples: string[]): boolean {
  for (const s of samples) {
    const m = s.match(/\b(\d{1,2})[/-](\d{1,2})[/-]\d{2,4}\b/);
    if (!m) continue;
    if (+m[1] > 12) return true;
    if (+m[2] > 12) return false;
  }
  return true;
}

/** Accepts text dates, JS Dates (from spreadsheets) and Excel serial numbers. */
export function parseDateCell(v: unknown, dayFirst: boolean): string | null {
  if (v instanceof Date && !isNaN(+v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12).toISOString();
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000)); // Excel serial → UTC date
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12).toISOString();
  }
  if (typeof v === "string") return extractDate(v, dayFirst)?.iso ?? null;
  return null;
}
