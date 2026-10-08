import { fail, handleError, ok } from "@/lib/api";
import { revokeDevice } from "@/lib/devices.server";
import { getSession } from "@/lib/session";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try { return (await revokeDevice(s.id, (await params).id)) ? ok(null) : fail("Not found", 404); } catch (e) { return handleError(e); }
}
