import { fail, handleError, ok } from "@/lib/api";
import { getSession } from "@/lib/session";
import { deleteTransaction, updateTransaction } from "@/lib/transactions.server";
import { txInputSchema } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try {
    const tx = await updateTransaction(s.id, (await params).id, txInputSchema.parse(await req.json()));
    return tx ? ok(tx) : fail("Not found", 404);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_: Request, { params }: Ctx) {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try {
    return (await deleteTransaction(s.id, (await params).id)) ? ok(null) : fail("Not found", 404);
  } catch (e) {
    return handleError(e);
  }
}
