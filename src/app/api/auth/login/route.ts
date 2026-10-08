import bcrypt from "bcryptjs";
import { z } from "zod";
import { fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export async function POST(req: Request) {
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
