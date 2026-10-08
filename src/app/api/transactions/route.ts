import { fail, handleError, ok } from "@/lib/api";
import { getSession } from "@/lib/session";
import { createTransaction, listTransactions } from "@/lib/transactions.server";
import { txInputSchema } from "@/lib/types";

export async function GET() {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try {
    return ok(await listTransactions(s.id));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try {
    return ok(await createTransaction(s.id, txInputSchema.parse(await req.json())), 201);
  } catch (e) {
    return handleError(e);
  }
}
