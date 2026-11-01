import type { Role } from "./types";

export type AdminUser = {
  id: string; name: string; email: string; role: Role; active: boolean; createdAt: string;
  transactions: number; lastActivity: string | null; month: { currency: string; income: string; expenses: string }[];
};

export const ROLE_LABEL: Record<Role, string> = { SUPER_ADMIN: "Super admin", USER: "User" };
