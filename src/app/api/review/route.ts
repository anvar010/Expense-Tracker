import { fail, handleError, ok } from "@/lib/api";
import { listReview } from "@/lib/ingest.server";
import { getSession } from "@/lib/session";

export async function GET() {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try { return ok(await listReview(s.id)); } catch (e) { return handleError(e); }
}
