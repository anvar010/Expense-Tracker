import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/** True when the error means the database can't be reached (so the client should fall back to local data). */
export function isDbDown(e: unknown) {
  const code = (e as { code?: string })?.code;
  return ["P1000", "P1001", "P1002", "P1003", "P1017", "P2021"].includes(code ?? "") ||
    (e as Error)?.name === "PrismaClientInitializationError";
}
