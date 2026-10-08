import { z } from "zod";
import { fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { authenticateDevice } from "@/lib/devices.server";
import { bearerToken, isFreshRequest } from "@/lib/ingest-core";
import { ingestMessage } from "@/lib/ingest.server";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  messageId: z.string().min(8).max(100),
  text: z.string().min(1).max(2000),
  receivedAt: z.string().datetime().optional(),
});

/**
 * Device ingestion. Auth: `Authorization: Bearer etd_…` (per-device, revocable).
 * Replay protection: `X-Request-Time` (ms epoch, within ±10 min) plus a unique `messageId`
 * that makes resends no-ops.
 */
export async function POST(req: Request) {
  try {
    const token = bearerToken(req.headers.get("authorization"));
    if (!token) return fail("Unauthorized", 401);

    // Limit by token hash before touching the database so bad tokens can't hammer it either.
    const rl = rateLimit(`ingest:${token.slice(0, 16)}`, 60, 60_000);
    if (!rl.allowed) return fail("Too many requests", 429, { retryAfter: rl.retryAfter });

    const device = await authenticateDevice(token);
    if (!device) return fail("Unauthorized", 401);
    if (!isFreshRequest(req.headers.get("x-request-time"))) return fail("Stale or missing X-Request-Time", 400);

    const body = schema.parse(await req.json());
    const result = await ingestMessage(device.userId, device.platform === "IOS" ? "SHORTCUT" : "SMS", body);
    await prisma.device.update({ where: { id: device.id }, data: { lastSyncAt: new Date() } });
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
