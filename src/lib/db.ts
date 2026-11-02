import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

/** DATABASE_URL if set, otherwise built from the separate DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD values. */
function databaseUrl() {
  const { DATABASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  if (DATABASE_URL || !DB_HOST) return DATABASE_URL;
  return `mysql://${encodeURIComponent(DB_USER ?? "")}:${encodeURIComponent(DB_PASSWORD ?? "")}@${DB_HOST}:${DB_PORT || 3306}/${DB_NAME ?? ""}`;
}

export const prisma = g.prisma ?? new PrismaClient({ datasourceUrl: databaseUrl() });
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/** A unique-key clash (e.g. the same client-chosen id sent twice). */
export const isDuplicate = (e: unknown) => (e as { code?: string })?.code === "P2002";

/** True when the error means the database can't be reached (so the client should fall back to local data). */
export function isDbDown(e: unknown) {
  const code = (e as { code?: string })?.code;
  return ["P1000", "P1001", "P1002", "P1003", "P1017", "P2021"].includes(code ?? "") ||
    (e as Error)?.name === "PrismaClientInitializationError";
}
