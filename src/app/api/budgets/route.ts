import { budgetsRepo } from "@/lib/budgets.server";
import { crudHandlers } from "@/lib/crud";
import { budgetInputSchema } from "@/lib/types";

export const { GET, POST } = crudHandlers({ schema: budgetInputSchema, ...budgetsRepo });
