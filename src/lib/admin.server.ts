import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError } from "./api";
import { prisma } from "./db";
import { toDto } from "./transactions.server";

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(190),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  role: z.enum(["SUPER_ADMIN", "USER"]).default("USER"),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["SUPER_ADMIN", "USER"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200).optional(),
});

type Money = { currency: string; income: string; expenses: string };

/** First instant of the current month in the app's home timezone (Asia/Dubai, UTC+4, no DST). */
const monthStart = () => {
  const local = new Date(Date.now() + 4 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 4 * 3600_000);
};

async function totals(userIds: string[], since?: Date) {
  const rows = await prisma.transaction.groupBy({
    by: ["userId", "currency", "type"],
    where: { userId: { in: userIds }, type: { in: ["INCOME", "EXPENSE"] }, ...(since && { date: { gte: since } }) },
    _sum: { amount: true },
  });
  const out = new Map<string, Map<string, { income: number; expenses: number }>>();
  for (const r of rows) {
    const byCur = out.get(r.userId) ?? new Map();
    const slot = byCur.get(r.currency) ?? { income: 0, expenses: 0 };
    const v = Number(r._sum.amount ?? 0);
    if (r.type === "INCOME") slot.income += v; else slot.expenses += v;
    byCur.set(r.currency, slot);
    out.set(r.userId, byCur);
  }
  return (id: string): Money[] =>
    [...(out.get(id) ?? [])].map(([currency, v]) => ({ currency, income: v.income.toFixed(2), expenses: v.expenses.toFixed(2) }));
}

const userSelect = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;

export async function listUsers() {
  const users = await prisma.user.findMany({ select: userSelect, orderBy: { createdAt: "asc" } });
  const ids = users.map((u) => u.id);
  const [month, counts, last] = await Promise.all([
    totals(ids, monthStart()),
    prisma.transaction.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: { _all: true } }),
    prisma.transaction.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  const count = new Map(counts.map((c) => [c.userId, c._count._all]));
  const lastAt = new Map(last.map((c) => [c.userId, c._max.createdAt]));
  return users.map((u) => ({
    ...u, createdAt: u.createdAt.toISOString(),
    transactions: count.get(u.id) ?? 0,
    lastActivity: lastAt.get(u.id)?.toISOString() ?? null,
    month: month(u.id),
  }));
}

/** Read-only overview of one user's finances. */
export async function userOverview(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) return null;
  const since = monthStart();
  const [all, month, accounts, budgets, count, cats, recent] = await Promise.all([
    totals([id]), totals([id], since),
    prisma.account.count({ where: { userId: id } }),
    prisma.budget.count({ where: { userId: id } }),
    prisma.transaction.count({ where: { userId: id } }),
    prisma.transaction.groupBy({ by: ["categoryId", "currency"], where: { userId: id, type: "EXPENSE", date: { gte: since } }, _sum: { amount: true } }),
    prisma.transaction.findMany({ where: { userId: id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 10, include: { category: true, merchant: true } }),
  ]);
  const names = new Map((await prisma.category.findMany({ where: { id: { in: cats.map((c) => c.categoryId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const topCategories = cats
    .map((c) => ({ category: (c.categoryId && names.get(c.categoryId)) || "Other", currency: c.currency, amount: Number(c._sum.amount ?? 0) }))
    .sort((a, b) => b.amount - a.amount).slice(0, 6)
    .map((c) => ({ ...c, amount: c.amount.toFixed(2) }));
  return {
    user: { ...user, createdAt: user.createdAt.toISOString() },
    transactions: count, accounts, budgets,
    allTime: all(id), month: month(id), topCategories,
    recent: recent.map(toDto),
  };
}

export async function createUser(input: z.infer<typeof createUserSchema>) {
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw new HttpError("Email already registered", 409);
  return prisma.user.create({
    data: { name: input.name, email: input.email, role: input.role, passwordHash: await bcrypt.hash(input.password, 12) },
    select: userSelect,
  });
}

async function activeAdmins() {
  return prisma.user.count({ where: { role: "SUPER_ADMIN", active: true } });
}

export async function updateUser(actorId: string, id: string, input: z.infer<typeof updateUserSchema>) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new HttpError("User not found", 404);
  const losesAdmin = target.role === "SUPER_ADMIN" && target.active && (input.role === "USER" || input.active === false);
  if (losesAdmin) {
    if (id === actorId) throw new HttpError("You can't remove your own admin access", 400);
    if ((await activeAdmins()) <= 1) throw new HttpError("There must be at least one active super admin", 400);
  }
  return prisma.user.update({
    where: { id },
    data: {
      name: input.name, role: input.role, active: input.active,
      ...(input.password && { passwordHash: await bcrypt.hash(input.password, 12) }),
    },
    select: userSelect,
  });
}

export async function deleteUser(actorId: string, id: string) {
  if (id === actorId) throw new HttpError("You can't delete your own account", 400);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new HttpError("User not found", 404);
  if (target.role === "SUPER_ADMIN" && target.active && (await activeAdmins()) <= 1) throw new HttpError("There must be at least one active super admin", 400);
  await prisma.user.delete({ where: { id } }); // cascades to all of their data
}
