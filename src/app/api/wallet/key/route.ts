import { fail, handleError, ok } from "@/lib/api";
import { getSession } from "@/lib/session";
import { createWalletKey, revokeWalletKey, walletKeyStatus } from "@/lib/wallet.server";

export async function GET() {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try {
    return ok(await walletKeyStatus(s.id));
  } catch (e) {
    return handleError(e);
  }
}

/** Creates a new key (replacing any old one). The key is shown once; only its hash is stored. */
export async function POST() {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try {
    return ok({ key: await createWalletKey(s.id) }, 201);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE() {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try {
    await revokeWalletKey(s.id);
    return ok(null);
  } catch (e) {
    return handleError(e);
  }
}
