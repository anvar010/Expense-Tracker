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
