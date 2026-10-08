import { z } from "zod";
import { fail, handleError, ok } from "@/lib/api";
import { resolveReview } from "@/lib/ingest.server";
import { getSession } from "@/lib/session";

const schema = z.object({ outcome: z.enum(["confirmed", "rejected"]), transactionId: z.string().max(36).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try {
    const b = schema.parse(await req.json());
    return (await resolveReview(s.id, (await params).id, b.outcome, b.transactionId)) ? ok(null) : fail("Not found", 404);
  } catch (e) { return handleError(e); }
}
