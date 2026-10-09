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
  return parseShortcutBody(raw).text;
}

/** Plain text from an email body that may be HTML (tags, entities and blank runs removed). */
export function htmlToText(s: string): string {
  if (!/<\/?(?:html|body|div|p|table|br|span|td)\b/i.test(s)) return s;
  return s
    .replace(/<(?:style|script)[\s\S]*?<\/(?:style|script)>/gi, " ")
    .replace(/<br\s*\/?>|<\/(?:p|div|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
}

export type ShortcutBody = { text: string; receivedAt?: string; source: "SHORTCUT" | "EMAIL" };

/**
 * The easy endpoint takes plain text (iPhone Shortcuts) or JSON { text, receivedAt?, source? } (email scripts).
 * receivedAt lets an old email keep its own date instead of "now".
 */
export function parseShortcutBody(raw: string): ShortcutBody {
  const body = raw.trim().slice(0, 20_000);
  if (body.startsWith("{")) {
    try {
      const j = JSON.parse(body) as { text?: unknown; receivedAt?: unknown; source?: unknown };
      if (typeof j.text === "string") {
        const at = typeof j.receivedAt === "string" && !Number.isNaN(Date.parse(j.receivedAt)) ? new Date(j.receivedAt).toISOString() : undefined;
        return { text: htmlToText(j.text).trim().slice(0, 4000), receivedAt: at, source: j.source === "EMAIL" ? "EMAIL" : "SHORTCUT" };
      }
    } catch {}
  }
  return { text: htmlToText(body).trim().slice(0, 4000), source: "SHORTCUT" };
}

export const shortcutMessageId = (text: string) => "sc-" + createHash("sha256").update(text).digest("hex").slice(0, 40);

export const DEVICE_KEY_PATTERN = /^etd_[A-Za-z0-9_-]{20,}$/;

export function bearerToken(header: string | null) {
  const m = header?.match(/^Bearer (etd_[A-Za-z0-9_-]{20,})$/);
  return m?.[1] ?? null;
}
