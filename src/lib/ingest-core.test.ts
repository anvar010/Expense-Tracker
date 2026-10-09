import { beforeAll, describe, expect, it } from "vitest";
import { bearerToken, extractShortcutText, fingerprint, isFreshRequest, shortcutMessageId } from "./ingest-core";
import { rateLimit } from "./rate-limit";

describe("request freshness", () => {
  const now = 1_700_000_000_000;
  it("accepts recent and rejects stale/future/garbage", () => {
    expect(isFreshRequest(String(now - 60_000), now)).toBe(true);
    expect(isFreshRequest(String(now - 11 * 60_000), now)).toBe(false);
    expect(isFreshRequest(String(now + 11 * 60_000), now)).toBe(false);
    expect(isFreshRequest("abc", now)).toBe(false);
    expect(isFreshRequest(new Date(now - 60_000).toISOString(), now)).toBe(true);
    expect(isFreshRequest("2026-10-08T22:10:00+04:00", Date.parse("2026-10-08T22:12:00+04:00"))).toBe(true);
    expect(isFreshRequest(new Date(now - 3600_000).toISOString(), now)).toBe(false);
    expect(isFreshRequest(null, now)).toBe(false);
  });
});

describe("bearerToken", () => {
  it("only accepts device tokens", () => {
    expect(bearerToken("Bearer etd_" + "a".repeat(40))).toBeTruthy();
    expect(bearerToken("Bearer something")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("fingerprint", () => {
  const p = { amount: "45", currency: "AED" as const, merchant: "Talabat", date: "2026-10-08T08:00:00.000Z", accountRef: "1234" };
  it("is stable across formatting and per user", () => {
    expect(fingerprint("u1", p)).toBe(fingerprint("u1", { ...p, amount: "45.00", merchant: "TALABAT" }));
    expect(fingerprint("u1", p)).not.toBe(fingerprint("u2", p));
    expect(fingerprint("u1", p)).not.toBe(fingerprint("u1", { ...p, amount: "46" }));
  });
});

describe("shortcut easy mode", () => {
  it("accepts plain text or JSON and trims", () => {
    expect(extractShortcutText("  AED 45 debited at TALABAT \n")).toBe("AED 45 debited at TALABAT");
    expect(extractShortcutText('{"text": " AED 45 debited "}')).toBe("AED 45 debited");
    expect(extractShortcutText("{not json")).toBe("{not json");
    expect(extractShortcutText("x".repeat(9000))).toHaveLength(4000);
  });
  it("derives a stable id from the text", () => {
    expect(shortcutMessageId("a")).toBe(shortcutMessageId("a"));
    expect(shortcutMessageId("a")).not.toBe(shortcutMessageId("b"));
    expect(shortcutMessageId("a").length).toBeGreaterThanOrEqual(8);
  });
});

describe("rateLimit", () => {
  it("blocks after the limit and resets after the window", () => {
    const k = "t" + Math.random();
    for (let i = 0; i < 3; i++) expect(rateLimit(k, 3, 1000, 0).allowed).toBe(true);
    const blocked = rateLimit(k, 3, 1000, 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(rateLimit(k, 3, 1000, 2000).allowed).toBe(true);
  });
});

describe("message encryption", () => {
  beforeAll(() => { process.env.MESSAGE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });
  it("round-trips, uses a fresh IV, and detects tampering", async () => {
    const { encrypt, decrypt } = await import("./crypto.server");
    const a = encrypt("AED 45 at TALABAT");
    expect(decrypt(a)).toBe("AED 45 at TALABAT");
    expect(encrypt("AED 45 at TALABAT")).not.toBe(a);
    const bad = Buffer.from(a, "base64"); bad[bad.length - 1] ^= 1;
    expect(() => decrypt(bad.toString("base64"))).toThrow();
  });
  it("fails closed without a valid key", async () => {
    const { encrypt } = await import("./crypto.server");
    process.env.MESSAGE_ENCRYPTION_KEY = "short";
    expect(() => encrypt("x")).toThrow();
  });
});

import { htmlToText, parseShortcutBody } from "./ingest-core";
describe("email bodies for the easy endpoint", () => {
  it("keeps plain text as a shortcut message", () => {
    expect(parseShortcutBody("AED 45 debited")).toEqual({ text: "AED 45 debited", source: "SHORTCUT" });
  });
  it("accepts JSON with source and the email's own date", () => {
    const b = parseShortcutBody(JSON.stringify({ text: "AED 6 purchase", receivedAt: "2026-10-09T10:04:00Z", source: "EMAIL" }));
    expect(b).toMatchObject({ text: "AED 6 purchase", source: "EMAIL", receivedAt: "2026-10-09T10:04:00.000Z" });
    expect(parseShortcutBody(JSON.stringify({ text: "x", receivedAt: "not a date" })).receivedAt).toBeUndefined();
  });
  it("turns HTML emails into readable text", () => {
    const t = htmlToText("<html><body><p>Purchase of <b>AED&nbsp;6.00</b> at SHOP</p><style>p{color:red}</style></body></html>");
    expect(t).toContain("AED 6.00");
    expect(t).not.toMatch(/<|color:red/);
  });
});

import { judgeDuplicate, merchantCompatible } from "./ingest-core";
describe("judgeDuplicate", () => {
  const now = 1_800_000_000_000;
  const tx = (o: Partial<{ id: string; source: string; createdAtMs: number; fingerprint: string | null; merchant: string }> = {}) =>
    ({ id: "t1", source: "EMAIL", createdAtMs: now - 5 * 60_000, fingerprint: "fp", merchant: "Al Shahama Supermarket", ...o });
  const msg = { fingerprint: "fp", source: "SMS", merchant: "Al Shahama Supermarket" };

  it("same event from another channel is a duplicate, however late it arrives", () => {
    expect(judgeDuplicate(msg, [tx({ createdAtMs: now - 5 * 3600e3 })], now)).toEqual({ verdict: "duplicate", id: "t1" });
  });
  it("same channel resent within an hour is a duplicate", () => {
    expect(judgeDuplicate({ ...msg, source: "EMAIL" }, [tx()], now).verdict).toBe("duplicate");
  });
  it("same channel hours later is a genuine second purchase", () => {
    expect(judgeDuplicate({ ...msg, source: "EMAIL" }, [tx({ createdAtMs: now - 3 * 3600e3 })], now).verdict).toBe("new");
  });
  it("a hand-typed or incomplete match is held for review, not dropped and not duplicated", () => {
    expect(judgeDuplicate(msg, [tx({ source: "MANUAL", fingerprint: null })], now).verdict).toBe("review");
    expect(judgeDuplicate(msg, [tx({ fingerprint: "other" })], now).verdict).toBe("review");
  });
  it("different merchant or nothing nearby is new", () => {
    expect(judgeDuplicate(msg, [tx({ merchant: "Carrefour", fingerprint: "x" })], now).verdict).toBe("new");
    expect(judgeDuplicate(msg, [], now).verdict).toBe("new");
  });
});
describe("merchantCompatible", () => {
  it("handles unknown, contained and different names", () => {
    expect(merchantCompatible("", "Talabat")).toBe(true);
    expect(merchantCompatible("Al Shahama Supermarket", "Al Shahama Supermarket Dubai")).toBe(true);
    expect(merchantCompatible("Talabat", "Carrefour")).toBe(false);
    expect(merchantCompatible("Uber", "Subers cafe")).toBe(false); // too short to match as a substring
  });
});
