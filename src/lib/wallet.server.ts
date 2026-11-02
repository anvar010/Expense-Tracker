import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { categorize } from "./parser/categorize";
import { createTransaction } from "./transactions.server";
import { deriveWalletKey, walletKeyUser, type WalletPayload } from "./wallet-core";

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

/**
 * The key is derived from the server secret, the user and the moment it was created, so it can be shown again
 * at any time without being stored. A new key (new creation time) makes the old one stop working.
 * Changing SESSION_SECRET invalidates every key.
 */
function makeKey(userId: string, createdAt: Date) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return deriveWalletKey(secret, userId, createdAt);
}

const BASE = { id: true, userId: true, createdAt: true, lastUsedAt: true } as const;

/** Notes what a request did and what it carried. Never throws: this is only a troubleshooting aid. */
export async function recordWalletAttempt(userId: string, status: string, body: string) {
  try {
    await prisma.walletKey.update({
      where: { userId },
      data: { lastAttemptAt: new Date(), lastStatus: status.slice(0, 200), lastBody: body.slice(0, 400) },
      select: { id: true },
    });
  } catch {
    // column not added yet, or the key was just removed
  }
}

/** Creates (or replaces) the user's key and returns it. */
export async function createWalletKey(userId: string) {
  const createdAt = new Date();
  const key = makeKey(userId, createdAt);
  await prisma.walletKey.upsert({
    where: { userId },
    create: { userId, createdAt, keyHash: hash(key) },
    update: { createdAt, keyHash: hash(key), lastUsedAt: null },
    select: { id: true },
  });
  // A new link starts with a clean "last request" (those columns may not exist yet, which is fine).
  await prisma.walletKey.update({ where: { userId }, data: { lastAttemptAt: null, lastStatus: null, lastBody: null }, select: { id: true } }).catch(() => {});
  return key;
}

export const revokeWalletKey = (userId: string) => prisma.walletKey.deleteMany({ where: { userId } });

export async function walletKeyStatus(userId: string) {
  const k = await prisma.walletKey.findUnique({ where: { userId }, select: BASE });
  // The "last request" columns come from a later migration; until it is applied they're simply absent.
  const last = k ? await prisma.walletKey.findUnique({ where: { userId }, select: { lastAttemptAt: true, lastStatus: true, lastBody: true } }).catch(() => null) : null;
  return {
    exists: !!k, key: k ? makeKey(userId, k.createdAt) : null,
    createdAt: k?.createdAt.toISOString() ?? null, lastUsedAt: k?.lastUsedAt?.toISOString() ?? null,
    lastAttemptAt: last?.lastAttemptAt?.toISOString() ?? null, lastStatus: last?.lastStatus ?? null, lastBody: last?.lastBody ?? null,
  };
}

/** The user a key belongs to, or null. Also records when it was last used. */
export async function userForWalletKey(key: string) {
  const claimed = walletKeyUser(key);
  if (!claimed) return null;
  const k = await prisma.walletKey.findUnique({ where: { userId: claimed }, select: BASE });
  if (!k) return null;
  const expected = Buffer.from(makeKey(k.userId, k.createdAt)), given = Buffer.from(key);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  void prisma.walletKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() }, select: { id: true } }).catch(() => {});
  return k.userId;
}

/** Today's date in Dubai at 12:00, the same way a typed entry stores its date, so same-day entries sort by when they were added. */
function todayAtNoon() {
  const dubai = new Date(Date.now() + 4 * 3600_000);
  return new Date(Date.UTC(dubai.getUTCFullYear(), dubai.getUTCMonth(), dubai.getUTCDate(), 8));
}

/** Saves one Apple Pay payment as a debit. Returns null when it looks like the same payment sent twice. */
export async function saveWalletPayment(userId: string, p: WalletPayload) {
  const recent = await prisma.transaction.findFirst({
    where: {
      userId, source: "SHORTCUT", currency: p.currency, amount: p.amount,
      createdAt: { gte: new Date(Date.now() - 3 * 60_000) },
      merchant: p.merchant ? { normalizedName: p.merchant.toLowerCase().replace(/\s+/g, " ") } : undefined,
    },
    select: { id: true },
  });
  if (recent) return null;
  const guess = categorize({ merchant: p.merchant, type: "EXPENSE" });
  return createTransaction(userId, {
    amount: p.amount, currency: p.currency, type: "EXPENSE", merchant: p.merchant,
    category: guess.source === "none" ? "Other" : guess.category,
    date: todayAtNoon().toISOString(), notes: p.card ? `Apple Pay · ${p.card}` : "Apple Pay", source: "SHORTCUT",
  });
}
