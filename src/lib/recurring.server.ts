import { Prisma, type RecurringTransaction as Row } from "@prisma/client";
import { prisma } from "./db";
import type { Recurring, RecurringInput } from "./types";

const toDto = (r: Row): Recurring => ({
  id: r.id, name: r.name, category: r.category, currency: r.currency as Recurring["currency"], amount: r.amount.toFixed(2),
  frequency: r.frequency, nextDueDate: r.nextDueDate.toISOString(), status: r.status === "PAUSED" ? "PAUSED" : "ACTIVE",
});
const data = (i: RecurringInput) => ({
  name: i.name, category: i.category, currency: i.currency, amount: new Prisma.Decimal(i.amount),
  frequency: i.frequency, nextDueDate: new Date(i.nextDueDate), status: i.status,
});

export const recurringRepo = {
  list: async (userId: string) => (await prisma.recurringTransaction.findMany({ where: { userId, status: { in: ["ACTIVE", "PAUSED"] } }, orderBy: { nextDueDate: "asc" } })).map(toDto),
  create: async (userId: string, i: RecurringInput) => toDto(await prisma.recurringTransaction.create({ data: { userId, ...data(i) } })),
  update: async (userId: string, id: string, i: RecurringInput) => {
    const { count } = await prisma.recurringTransaction.updateMany({ where: { id, userId }, data: data(i) });
    return count ? toDto(await prisma.recurringTransaction.findUniqueOrThrow({ where: { id } })) : null;
  },
  remove: async (userId: string, id: string) => (await prisma.recurringTransaction.deleteMany({ where: { id, userId } })).count > 0,
};
