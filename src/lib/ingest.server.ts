import { prisma } from "./db";
import { decrypt, encrypt } from "./crypto.server";
import { fingerprint } from "./ingest-core";
import { aiCategorizationEnabled, getAiProvider } from "./ai/index.server";
import { applyAiCategory } from "./ai/categorize-fallback";
import { parseMessage } from "./parser/parse";
import type { CategoryRule } from "./parser/categorize";
import { createTransaction } from "./transactions.server";

export type IngestPayload = { messageId: string; text: string; receivedAt?: string };
export type IngestResult =
  | { status: "ignored"; reason: string }
  | { status: "duplicate" }
  | { status: "created"; transactionId: string }
  | { status: "needs_review" };

async function userRules(userId: string): Promise<CategoryRule[]> {
  const rows = await prisma.merchantRule.findMany({ where: { userId, enabled: true }, include: { category: true }, orderBy: { priority: "asc" } });
  return rows.map((r) => ({ id: r.id, pattern: r.merchantPattern, category: r.category.name, source: "rule" as const, enabled: true }));
}

/**
 * Pipeline: dedupe by messageId → parse (OTPs dropped, nothing stored) → confident? create transaction :
 * park the message, encrypted, in the review queue. Raw text is not kept for confident parses.
 */
export async function ingestMessage(userId: string, source: "SMS" | "SHORTCUT", p: IngestPayload): Promise<IngestResult> {
  const receivedAt = p.receivedAt ? new Date(p.receivedAt) : new Date();
  let parsed = parseMessage(p.text, { rules: await userRules(userId), receivedAt });
  // Opt-in AI fallback for merchants the rules couldn't place (inputs are redacted inside the provider).
  if (aiCategorizationEnabled()) parsed = await applyAiCategory(parsed, p.text, getAiProvider());
  if (!parsed.isTransaction) return { status: "ignored", reason: parsed.reason ?? "Not a transaction" };

  // Claim the messageId first; a replay or retry hits the unique constraint and becomes a no-op.
  let importId: string;
  try {
    importId = (await prisma.messageImport.create({
      data: { userId, source, sourceReference: p.messageId, encryptedMessage: "", status: "NEEDS_REVIEW", receivedAt },
    })).id;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { status: "duplicate" };
    throw e;
  }

  try {
    const fp = fingerprint(userId, { ...parsed, amount: parsed.amount!, currency: parsed.currency! });
    const existing = await prisma.transaction.findFirst({ where: { userId, fingerprint: fp }, select: { id: true } });
    if (existing) {
      await prisma.messageImport.update({ where: { id: importId }, data: { status: "CONFIRMED", parsedTransactionId: existing.id } });
      return { status: "duplicate" };
    }

    if (parsed.needsReview) {
      await prisma.messageImport.update({ where: { id: importId }, data: { encryptedMessage: encrypt(p.text) } });
      return { status: "needs_review" };
    }

    const accounts = parsed.accountRef
      ? await prisma.account.findMany({ where: { userId, maskedReference: parsed.accountRef, currency: parsed.currency } })
      : [];
    const tx = await createTransaction(userId, {
      amount: parsed.amount!, currency: parsed.currency!, type: parsed.type!, category: parsed.category,
      merchant: parsed.merchant, date: parsed.date, notes: parsed.accountRef ? `Card ending ${parsed.accountRef}` : "",
      source, accountId: accounts.length === 1 ? accounts[0].id : undefined,
    }, { fingerprint: fp, confidence: Math.min(parsed.confidence, parsed.categoryConfidence) });
    await prisma.messageImport.update({ where: { id: importId }, data: { status: "CONFIRMED", parsedTransactionId: tx.id } });
    return { status: "created", transactionId: tx.id };
  } catch (e) {
    // Release the claim so a retry of the same message can succeed instead of being treated as a replay.
    await prisma.messageImport.delete({ where: { id: importId } }).catch(() => {});
    throw e;
  }
}

export async function listReview(userId: string) {
  const rows = await prisma.messageImport.findMany({ where: { userId, status: "NEEDS_REVIEW", encryptedMessage: { not: "" } }, orderBy: { receivedAt: "desc" }, take: 100 });
  return rows.map((r) => ({ id: r.id, text: decrypt(r.encryptedMessage), receivedAt: r.receivedAt.toISOString() }));
}

/** Resolving always wipes the stored message text. */
export async function resolveReview(userId: string, id: string, outcome: "confirmed" | "rejected", transactionId?: string) {
  if (transactionId && !(await prisma.transaction.count({ where: { id: transactionId, userId } }))) return false;
  const { count } = await prisma.messageImport.updateMany({
    where: { id, userId, status: "NEEDS_REVIEW" },
    data: { status: outcome === "confirmed" ? "CONFIRMED" : "REJECTED", encryptedMessage: "", parsedTransactionId: transactionId ?? null },
  });
  return count > 0;
}
