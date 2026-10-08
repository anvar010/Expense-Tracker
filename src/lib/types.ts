import { z } from "zod";

export const CURRENCIES = ["AED", "USD", "INR", "EUR", "GBP"] as const;
export const TX_TYPES = ["EXPENSE", "INCOME", "TRANSFER", "REFUND", "CARD_PAYMENT", "ADJUSTMENT"] as const;
export const DEFAULT_CATEGORIES = [
  "Food & Dining", "Groceries", "Transportation", "Shopping", "Rent", "Utilities",
  "Entertainment", "Healthcare", "Education", "Travel", "Subscriptions", "Insurance",
  "Loan Payments", "Credit Card Payments", "Transfers", "Salary", "Investments", "Other",
] as const;

export type TxType = (typeof TX_TYPES)[number];

export const txInputSchema = z.object({
  amount: z.string().regex(/^-?\d{1,16}(\.\d{1,2})?$/, "Enter a valid amount"),
  currency: z.enum(CURRENCIES),
  type: z.enum(TX_TYPES),
  category: z.string().trim().min(1).max(80),
  merchant: z.string().trim().max(120).default(""),
  date: z.string().datetime(),
  notes: z.string().trim().max(500).default(""),
  source: z.enum(["MANUAL", "SMS", "EMAIL", "IMPORT", "SHORTCUT"]).optional(),
  idempotencyKey: z.string().min(8).max(64).optional(),
  accountId: z.string().max(36).optional(),
  /** Destination for TRANSFER and CARD_PAYMENT (the card being paid). */
  toAccountId: z.string().max(36).optional(),
}).refine((t) => !t.amount.startsWith("-") || t.type === "ADJUSTMENT", {
  message: "Only adjustments can be negative", path: ["amount"],
});
export type TxInput = z.infer<typeof txInputSchema>;
export type Tx = TxInput & { id: string };

export type Session = { id: string; name: string; email: string };

export const ACCOUNT_TYPES = ["BANK", "SAVINGS", "CREDIT_CARD", "CASH", "WALLET"] as const;
const money = z.string().regex(/^-?\d{1,16}(\.\d{1,2})?$/, "Enter a valid amount");

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  bankName: z.string().trim().max(120).default(""),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.enum(CURRENCIES),
  openingBalance: money.default("0"),
  creditLimit: z.union([money, z.literal("")]).default(""),
  // Only the last four digits are ever stored; full card numbers are never accepted.
  maskedReference: z.string().regex(/^\d{0,4}$/, "Enter only the last 4 digits").default(""),
  dueDay: z.number().int().min(1).max(31).optional(),
  minPayment: z.union([money, z.literal("")]).default(""),
  active: z.boolean().default(true),
});
export type AccountInput = z.infer<typeof accountInputSchema>;
export type Account = AccountInput & { id: string };

export const FREQUENCIES = ["WEEKLY", "MONTHLY", "YEARLY"] as const;
export const recurringInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  category: z.string().trim().min(1).max(80).default("Other"),
  currency: z.enum(CURRENCIES),
  amount: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/, "Enter a valid amount"),
  frequency: z.enum(FREQUENCIES),
  nextDueDate: z.string().datetime(),
  status: z.enum(["ACTIVE", "PAUSED"]).default("ACTIVE"),
});
export type RecurringInput = z.infer<typeof recurringInputSchema>;
export type Recurring = RecurringInput & { id: string };

export const BUDGET_PERIODS = ["WEEKLY", "MONTHLY", "CUSTOM"] as const;
export const budgetInputSchema = z.object({
  /** Empty string means the overall budget. */
  category: z.string().trim().max(80).default(""),
  amount: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/, "Enter a valid amount"),
  currency: z.enum(CURRENCIES),
  period: z.enum(BUDGET_PERIODS),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).refine((b) => b.period !== "CUSTOM" || (b.startDate && b.endDate && b.startDate <= b.endDate), {
  message: "Custom budgets need a valid start and end date", path: ["endDate"],
});
export type BudgetInput = z.infer<typeof budgetInputSchema>;
export type Budget = BudgetInput & { id: string };
