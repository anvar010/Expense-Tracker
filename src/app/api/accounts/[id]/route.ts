import { accountsRepo } from "@/lib/accounts.server";
import { crudHandlers } from "@/lib/crud";
import { accountInputSchema } from "@/lib/types";

export const { PUT, DELETE } = crudHandlers({ schema: accountInputSchema, ...accountsRepo });
