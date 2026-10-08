import bcrypt from "bcryptjs";
import { z } from "zod";
import { fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(190),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function POST(req: Request) {
  try {
    const { name, email, password } = schema.parse(await req.json());
    if (await prisma.user.findUnique({ where: { email } })) return fail("Email already registered", 409);
    const user = await prisma.user.create({
      data: { name, email, passwordHash: await bcrypt.hash(password, 12) },
    });
    await createSession({ id: user.id, name, email });
    return ok({ id: user.id, name, email }, 201);
  } catch (e) {
    return handleError(e);
  }
}
