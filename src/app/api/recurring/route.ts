import { crudHandlers } from "@/lib/crud";
import { recurringRepo } from "@/lib/recurring.server";
import { recurringInputSchema } from "@/lib/types";

export const { GET, POST } = crudHandlers({ schema: recurringInputSchema, ...recurringRepo });
