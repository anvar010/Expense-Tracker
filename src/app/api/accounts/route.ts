import { accountsRepo } from "@/lib/accounts.server";
import { crudHandlers } from "@/lib/crud";
import { accountInputSchema } from "@/lib/types";

export const { GET, POST } = crudHandlers({ schema: accountInputSchema, ...accountsRepo });
