import type { TxType } from "../types";

/**
 * Bank-specific templates. A template that matches overrides the generic heuristics and raises confidence.
 * Add or edit entries here without touching the parser. Named groups: merchant, last4.
 * NOTE: these are representative shapes, not verified copies of any bank's real SMS; check them against
 * real messages before relying on them. Anything unmatched still goes through the generic parser.
 */
export type Template = { id: string; bank: string; type?: TxType; pattern: RegExp };

export const TEMPLATES: Template[] = [
  {
    id: "card-debit-at-merchant",
    bank: "generic",
    type: "EXPENSE",
    pattern: /card ending (?<last4>\d{4}) was debited .*? at (?<merchant>.+?) on \d/i,
  },
];
