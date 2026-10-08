import { z } from "zod";
import { fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { authenticateDevice } from "@/lib/devices.server";
import { bearerToken, isFreshRequest } from "@/lib/ingest-core";
import { ingestMessage, type IngestResult } from "@/lib/ingest.server";
import { rateLimit } from "@/lib/rate-limit";

const message = z.object({
  messageId: z.string().min(8).max(100),
  text: z.string().min(1).max(2000),
  receivedAt: z.string().datetime().optional(),
});
const schema = z.object({ messages: z.array(message).min(1).max(100) });

/**
 * Many messages in one request (used by the phone's "Sync this month" button).
 * Same auth, freshness and replay rules as /api/ingest; each message is handled independently so one
 * bad message never blocks the rest. Results come back in the same order.
 */
export async function POST(req: Request) {
  try {
    const token = bearerToken(req.headers.get("authorization"));
    if (!token) return fail("Unauthorized", 401);
    const rl = rateLimit(`ingest-batch:${token.slice(0, 16)}`, 10, 60_000);
    if (!rl.allowed) return fail("Too many requests", 429, { retryAfter: rl.retryAfter });

    const device = await authenticateDevice(token);
    if (!device) return fail("Unauthorized", 401);
    if (!isFreshRequest(req.headers.get("x-request-time"))) return fail("Stale or missing X-Request-Time", 400);

    const { messages } = schema.parse(await req.json());
    const source = device.platform === "IOS" ? "SHORTCUT" : "SMS";
    const results: (IngestResult | { status: "error" })[] = [];
    for (const m of messages) {
      try {
        results.push(await ingestMessage(device.userId, source, m));
      } catch {
        results.push({ status: "error" }); // transient failure: the phone keeps this one and retries
      }
    }
    await prisma.device.update({ where: { id: device.id }, data: { lastSyncAt: new Date() } });
    return ok({ results });
  } catch (e) {
    return handleError(e);
  }
}
