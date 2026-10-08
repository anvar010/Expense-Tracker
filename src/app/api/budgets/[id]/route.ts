import { budgetsRepo } from "@/lib/budgets.server";
import { crudHandlers } from "@/lib/crud";
import { budgetInputSchema } from "@/lib/types";

export const { PUT, DELETE } = crudHandlers({ schema: budgetInputSchema, ...budgetsRepo });
