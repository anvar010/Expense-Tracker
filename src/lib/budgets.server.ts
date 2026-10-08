import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { ensureCategory } from "./transactions.server";
import type { Budget, BudgetInput } from "./types";

const include = { category: true } as const;
type Row = Prisma.BudgetGetPayload<{ include: typeof include }>;

const toDto = (r: Row): Budget => ({
  id: r.id, category: r.category?.name ?? "", amount: r.amount.toFixed(2), currency: r.currency as Budget["currency"],
  period: r.period, startDate: r.startDate.toISOString(), endDate: r.endDate?.toISOString(),
});

async function data(userId: string, i: BudgetInput) {
  const category = i.category ? await ensureCategory(userId, i.category) : null;
  return {
    categoryId: category?.id ?? null, amount: new Prisma.Decimal(i.amount), currency: i.currency, period: i.period,
    startDate: i.startDate ? new Date(i.startDate) : new Date(), endDate: i.endDate ? new Date(i.endDate) : null,
  };
}

export const budgetsRepo = {
  list: async (userId: string) => (await prisma.budget.findMany({ where: { userId }, include, orderBy: { startDate: "asc" } })).map(toDto),
  create: async (userId: string, i: BudgetInput) => toDto(await prisma.budget.create({ data: { userId, ...(await data(userId, i)) }, include })),
  update: async (userId: string, id: string, i: BudgetInput) => {
    const { count } = await prisma.budget.updateMany({ where: { id, userId }, data: await data(userId, i) });
    return count ? toDto(await prisma.budget.findUniqueOrThrow({ where: { id }, include })) : null;
  },
  remove: async (userId: string, id: string) => (await prisma.budget.deleteMany({ where: { id, userId } })).count > 0,
};
