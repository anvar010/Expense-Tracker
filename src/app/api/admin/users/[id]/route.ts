import { deleteUser, updateUser, updateUserSchema, userOverview } from "@/lib/admin.server";
import { fail, handleError, ok } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    if (!(await requireSuperAdmin())) return fail("Forbidden", 403);
    const data = await userOverview((await params).id);
    return data ? ok(data) : fail("User not found", 404);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const admin = await requireSuperAdmin();
    if (!admin) return fail("Forbidden", 403);
    return ok(await updateUser(admin.id, (await params).id, updateUserSchema.parse(await req.json())));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const admin = await requireSuperAdmin();
    if (!admin) return fail("Forbidden", 403);
    await deleteUser(admin.id, (await params).id);
    return ok(null);
  } catch (e) {
    return handleError(e);
  }
}
