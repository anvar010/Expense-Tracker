import { Prisma, type Account as Row } from "@prisma/client";
import { prisma } from "./db";
import type { Account, AccountInput } from "./types";

const dec = (v: string) => (v === "" ? null : new Prisma.Decimal(v));

const toDto = (r: Row): Account => ({
  id: r.id, name: r.name, bankName: r.bankName ?? "", type: r.type, currency: r.currency as Account["currency"],
  openingBalance: r.openingBalance.toFixed(2), creditLimit: r.creditLimit?.toFixed(2) ?? "",
  maskedReference: r.maskedReference ?? "", dueDay: r.dueDay ?? undefined,
  minPayment: r.minPayment?.toFixed(2) ?? "", active: r.active,
});

const data = (i: AccountInput) => ({
  name: i.name, bankName: i.bankName || null, type: i.type, currency: i.currency,
  openingBalance: new Prisma.Decimal(i.openingBalance), creditLimit: dec(i.creditLimit),
  maskedReference: i.maskedReference || null, dueDay: i.dueDay ?? null, minPayment: dec(i.minPayment), active: i.active,
});

export const accountsRepo = {
  list: async (userId: string) => (await prisma.account.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map(toDto),
  create: async (userId: string, i: AccountInput) => toDto(await prisma.account.create({ data: { userId, ...data(i) } })),
  update: async (userId: string, id: string, i: AccountInput) => {
    const { count } = await prisma.account.updateMany({ where: { id, userId }, data: data(i) });
    return count ? toDto((await prisma.account.findUniqueOrThrow({ where: { id } }))) : null;
  },
  remove: async (userId: string, id: string) => (await prisma.account.deleteMany({ where: { id, userId } })).count > 0,
};
