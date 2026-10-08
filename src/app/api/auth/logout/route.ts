import { ok } from "@/lib/api";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  return ok(null);
}
