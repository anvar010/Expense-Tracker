import { createHash } from "node:crypto";
import { normalizeMerchant } from "./parser/merchants";
import type { ParsedMessage } from "./parser/parse";

export const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

/** Request freshness. Queued messages may be old, but every send attempt carries a current request time. */
export function isFreshRequest(headerValue: string | null, now = Date.now()) {
  const t = Number(headerValue);
  return Number.isFinite(t) && Math.abs(now - t) <= MAX_CLOCK_SKEW_MS;
}

/** Stable identity of a transaction for duplicate detection across channels (SMS, email, statements). */
export function fingerprint(userId: string, p: Pick<ParsedMessage, "amount" | "currency" | "merchant" | "date" | "accountRef">) {
  const day = p.date.slice(0, 10);
  return createHash("sha256")
    .update([userId, Number(p.amount).toFixed(2), p.currency, day, normalizeMerchant(p.merchant), p.accountRef ?? ""].join("|"))
    .digest("hex");
}

export function bearerToken(header: string | null) {
  const m = header?.match(/^Bearer (etd_[A-Za-z0-9_-]{20,})$/);
  return m?.[1] ?? null;
}
