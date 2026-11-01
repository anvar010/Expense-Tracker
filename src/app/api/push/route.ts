import { z } from "zod";
import { fail, handleError, ok } from "@/lib/api";
import { pushPublicKey, removeSubscription, saveSubscription } from "@/lib/push.server";
import { getSession } from "@/lib/session";

const subSchema = z.object({
  endpoint: z.string().url().max(700),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

/** The public key the browser needs to subscribe (null when push isn't configured on the server). */
export async function GET() {
  return ok({ publicKey: pushPublicKey() });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try {
    await saveSubscription(s.id, subSchema.parse(await req.json()));
    return ok(null, 201);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request) {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try {
    const { endpoint } = z.object({ endpoint: z.string().max(700) }).parse(await req.json());
    await removeSubscription(s.id, endpoint);
    return ok(null);
  } catch (e) {
    return handleError(e);
  }
}
