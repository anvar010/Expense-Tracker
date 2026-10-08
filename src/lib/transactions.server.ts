import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "./db";
import type { Tx, TxInput } from "./types";

const include = { category: true, merchant: true } as const;
type Row = Prisma.TransactionGetPayload<{ include: typeof include }>;

export const toDto = (r: Row): Tx => ({
  id: r.id,
  amount: r.amount.toFixed(2),
  currency: r.currency as Tx["currency"],
  type: r.type,
  category: r.category?.name ?? "Other",
  merchant: r.merchant?.displayName ?? "",
  date: r.date.toISOString(),
  notes: r.notes ?? "",
  source: r.source,
  accountId: r.accountId ?? undefined,
  toAccountId: r.toAccountId ?? undefined,
});

/** Rejects account ids that don't belong to this user (no cross-user references). */
async function ownedAccountIds(userId: string, input: TxInput) {
  const ids = [input.accountId, input.toAccountId].filter((x): x is string => !!x);
  if (!ids.length) return;
  const n = await prisma.account.count({ where: { userId, id: { in: ids } } });
  if (n !== new Set(ids).size) throw new ZodError([{ code: "custom", path: ["accountId"], message: "Unknown account" }]);
}

export async function ensureCategory(userId: string, name: string) {
  const found = await prisma.category.findFirst({ where: { name, OR: [{ userId }, { userId: null }] } });
  return found ?? prisma.category.create({ data: { userId, name } });
}

async function resolveRefs(userId: string, input: TxInput) {
  await ownedAccountIds(userId, input);
  const category = await ensureCategory(userId, input.category);
  let merchantId: string | null = null;
  if (input.merchant) {
    const normalizedName = input.merchant.toLowerCase().replace(/\s+/g, " ");
    const m = await prisma.merchant.upsert({
      where: { normalizedName },
      update: {},
      create: { normalizedName, displayName: input.merchant },
    });
    merchantId = m.id;
  }
  return { categoryId: category.id, merchantId, accountId: input.accountId ?? null, toAccountId: input.toAccountId ?? null };
}

export async function listTransactions(userId: string): Promise<Tx[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId }, include, orderBy: { date: "desc" }, take: 2000,
  });
  return rows.map(toDto);
}

export type TxExtra = { fingerprint?: string; confidence?: number; status?: "CONFIRMED" | "NEEDS_REVIEW" };

export async function createTransaction(userId: string, input: TxInput, extra: TxExtra = {}): Promise<Tx> {
  if (input.idempotencyKey) {
    const existing = await prisma.transaction.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } }, include,
    });
    if (existing) return toDto(existing);
  }
  const refs = await resolveRefs(userId, input);
  const row = await prisma.transaction.create({
    data: {
      userId, ...refs,
      amount: new Prisma.Decimal(input.amount), currency: input.currency, type: input.type,
      date: new Date(input.date), notes: input.notes || null, idempotencyKey: input.idempotencyKey,
      source: input.source ?? "MANUAL",
      fingerprint: extra.fingerprint, confidence: extra.confidence, status: extra.status ?? "CONFIRMED",
    },
    include,
  });
  return toDto(row);
}

export async function updateTransaction(userId: string, id: string, input: TxInput): Promise<Tx | null> {
  const owned = await prisma.transaction.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return null;
  const refs = await resolveRefs(userId, input);
  const row = await prisma.transaction.update({
    where: { id },
    data: {
      ...refs, amount: new Prisma.Decimal(input.amount), currency: input.currency, type: input.type,
      date: new Date(input.date), notes: input.notes || null,
    },
    include,
  });
  return toDto(row);
}

export async function deleteTransaction(userId: string, id: string) {
  const { count } = await prisma.transaction.deleteMany({ where: { id, userId } });
  return count > 0;
}
