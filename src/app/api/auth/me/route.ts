import { ok } from "@/lib/api";
import { getSession } from "@/lib/session";

// Reads the signed cookie only, so it works even when the database is down.
export async function GET() {
  return ok(await getSession());
}
