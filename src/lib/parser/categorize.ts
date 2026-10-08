import type { TxType } from "../types";
import { findKnownMerchant, normalizeMerchant } from "./merchants";

export const AUTO_THRESHOLD = 0.7;

export type CategoryRule = {
  id: string;
  pattern: string; // matched against the normalised merchant name
  category: string;
  source: "rule" | "correction";
  enabled: boolean;
};

export type CategorizeResult = {
  category: string;
  confidence: number;
  source: "rule" | "correction" | "known-merchant" | "description" | "type" | "none";
};

const KEYWORDS: [RegExp, string][] = [
  [/restaurant|cafe|coffee|pizza|burger|kitchen|bakery|grill|shawarma/, "Food & Dining"],
  [/supermarket|hypermarket|grocer|mart\b|fresh/, "Groceries"],
  [/pharmacy|clinic|hospital|medical|dental|health/, "Healthcare"],
  [/taxi|metro|parking|fuel|petrol|station|rta\b/, "Transportation"],
  [/cinema|vox|theatre|games?\b|entertainment/, "Entertainment"],
  [/school|university|academy|tuition|course/, "Education"],
  [/hotel|airline|airways|flight|booking/, "Travel"],
  [/insurance|takaful/, "Insurance"],
];

/** Priority: user rules > earlier corrections > known merchants > description keywords > manual review. */
export function categorize(
  input: { merchant: string; description?: string; type: TxType },
  rules: CategoryRule[] = [],
): CategorizeResult {
  const text = input.description ?? "";
  if (input.type === "TRANSFER") return { category: "Transfers", confidence: 0.9, source: "type" };
  if (input.type === "CARD_PAYMENT") return { category: "Credit Card Payments", confidence: 0.9, source: "type" };
  if (input.type === "INCOME") {
    return /salary|payroll|wps/i.test(text)
      ? { category: "Salary", confidence: 0.95, source: "description" }
      : { category: "Other", confidence: 0.5, source: "none" };
  }

  const merchant = normalizeMerchant(input.merchant);
  if (merchant) {
    const active = rules.filter((r) => r.enabled && r.pattern && merchant.includes(normalizeMerchant(r.pattern)));
    const hit = active.find((r) => r.source === "rule") ?? active.find((r) => r.source === "correction");
    if (hit) return { category: hit.category, confidence: hit.source === "rule" ? 1 : 0.95, source: hit.source };

    const known = findKnownMerchant(input.merchant);
    if (known) return { category: known.category, confidence: known.confidence, source: "known-merchant" };
  }

  const hay = `${merchant} ${normalizeMerchant(text)}`;
  for (const [re, category] of KEYWORDS) if (re.test(hay)) return { category, confidence: AUTO_THRESHOLD, source: "description" };

  return { category: "Other", confidence: 0.3, source: "none" };
}
