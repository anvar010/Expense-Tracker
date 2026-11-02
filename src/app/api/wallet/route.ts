import { fail, handleError, ok } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { saveWalletPayment, userForWalletKey } from "@/lib/wallet.server";
import { bodyFromText, parseWalletPayload } from "@/lib/wallet-core";

/** The key comes from the Authorization header, or ?key= (easier to set up in Shortcuts). */
function keyFrom(req: Request) {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return auth || new URL(req.url).searchParams.get("key") || "";
}

async function authorise(req: Request) {
  const key = keyFrom(req);
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  // Limits guessing: a wrong key costs the caller, and a valid one can't flood the account either.
  const rl = rateLimit(`wallet:${ip}`, 30, 60_000);
  if (!rl.allowed) return { error: fail("Too many requests. Try again in a minute.", 429, { retryAfter: rl.retryAfter }) };
  const userId = key ? await userForWalletKey(key) : null;
  return userId ? { userId } : { error: fail("Invalid key", 401) };
}

/** Lets you check a link in the browser: valid key → ok, nothing is saved. */
export async function GET(req: Request) {
  try {
    const a = await authorise(req);
    return "error" in a ? a.error : ok({ valid: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const a = await authorise(req);
    if ("error" in a) return a.error;
    const ctype = req.headers.get("content-type") ?? "";
    const raw = ctype.includes("json") ? await req.json().catch(() => null)
      : ctype.includes("form") ? Object.fromEntries(await req.formData().catch(() => new FormData()))
      : bodyFromText(await req.text().catch(() => "")); // the shortcut posts plain text
    if (!raw || typeof raw !== "object") return fail("Send the payment as text or JSON", 400);
    const payload = parseWalletPayload(raw as Record<string, unknown>);
    if ("error" in payload) return fail(payload.error, 422);
    const saved = await saveWalletPayment(a.userId, payload);
    return saved ? ok(saved, 201) : ok({ duplicate: true });
  } catch (e) {
    return handleError(e);
  }
}
