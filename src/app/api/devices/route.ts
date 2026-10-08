import { z } from "zod";
import { fail, handleError, ok } from "@/lib/api";
import { createDevice, listDevices } from "@/lib/devices.server";
import { getSession } from "@/lib/session";

const schema = z.object({ name: z.string().trim().min(1).max(120), platform: z.enum(["ANDROID", "IOS"]) });

export async function GET() {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try { return ok(await listDevices(s.id)); } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return fail("Unauthorized", 401);
  try {
    const { name, platform } = schema.parse(await req.json());
    return ok(await createDevice(s.id, name, platform), 201);
  } catch (e) { return handleError(e); }
}
