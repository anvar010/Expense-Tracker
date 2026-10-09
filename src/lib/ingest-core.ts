import { createHash } from "node:crypto";
import { normalizeMerchant } from "./parser/merchants";
import type { ParsedMessage } from "./parser/parse";

export const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

/** Request freshness. Queued messages may be old, but every send attempt carries a current request time. */
export function isFreshRequest(headerValue: string | null, now = Date.now()) {
  if (!headerValue) return false;
  // Phones send milliseconds since epoch; the iPhone Shortcuts app finds an ISO 8601 date easier to produce.
  const t = /^\d{10,}$/.test(headerValue.trim()) ? Number(headerValue) : Date.parse(headerValue);
  return Number.isFinite(t) && Math.abs(now - t) <= MAX_CLOCK_SKEW_MS;
}

/** Stable identity of a transaction for duplicate detection across channels (SMS, email, statements). */
export function fingerprint(userId: string, p: Pick<ParsedMessage, "amount" | "currency" | "merchant" | "date" | "accountRef">) {
  const day = p.date.slice(0, 10);
  return createHash("sha256")
    .update([userId, Number(p.amount).toFixed(2), p.currency, day, normalizeMerchant(p.merchant), p.accountRef ?? ""].join("|"))
    .digest("hex");
}

/**
 * "Easy mode" for the iPhone Shortcuts app: the body is just the message text (or {"text": "..."}).
 * The message id is derived from the text, so sending the same message twice is a no-op.
 */
export function extractShortcutText(raw: string): string {
  const body = raw.trim().slice(0, 4000);
  if (body.startsWith("{")) {
    try {
      const t = (JSON.parse(body) as { text?: unknown }).text;
      if (typeof t === "string") return t.trim();
    } catch {}
  }
  return body;
}

export const shortcutMessageId = (text: string) => "sc-" + createHash("sha256").update(text).digest("hex").slice(0, 40);

export const DEVICE_KEY_PATTERN = /^etd_[A-Za-z0-9_-]{20,}$/;

export function bearerToken(header: string | null) {
  const m = header?.match(/^Bearer (etd_[A-Za-z0-9_-]{20,})$/);
  return m?.[1] ?? null;
}
