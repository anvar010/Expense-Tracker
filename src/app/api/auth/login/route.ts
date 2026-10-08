import bcrypt from "bcryptjs";
import { z } from "zod";
import { fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  // Per-address throttle: slows password guessing and mass sign-ups once the app is public.
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = rateLimit(`auth-login:${ip}`, 10, 60_000);
  if (!rl.allowed) return fail("Too many attempts. Try again in a minute.", 429, { retryAfter: rl.retryAfter });
  try {
    const { email, password } = schema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !valid) return fail("Invalid email or password", 401);
    await createSession({ id: user.id, name: user.name, email: user.email });
    return ok({ id: user.id, name: user.name, email: user.email });
  } catch (e) {
    return handleError(e);
  }
}
