import { createUser, createUserSchema, listUsers } from "@/lib/admin.server";
import { fail, handleError, ok } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/session";

export async function GET() {
  try {
    if (!(await requireSuperAdmin())) return fail("Forbidden", 403);
    return ok(await listUsers());
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    if (!(await requireSuperAdmin())) return fail("Forbidden", 403);
    return ok(await createUser(createUserSchema.parse(await req.json())), 201);
  } catch (e) {
    return handleError(e);
  }
}
