import { fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { authenticateDevice } from "@/lib/devices.server";
import { DEVICE_KEY_PATTERN, extractShortcutText, shortcutMessageId } from "@/lib/ingest-core";
import { ingestMessage } from "@/lib/ingest.server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * iPhone Shortcuts "easy mode": POST /api/ingest/shortcut?key=etd_...  with the message text as the body.
 *
 * Trade-off versus /api/ingest: the key travels in the URL (so it can appear in server or proxy logs) and there is
 * no freshness header. A replayed request is harmless (same text, same id: a duplicate no-op), and the key can be
 * revoked at any time from the Devices page. Use /api/ingest where you want the stricter header-based checks.
 */
export async function POST(req: Request) {
  try {
    const key = new URL(req.url).searchParams.get("key") ?? "";
    if (!DEVICE_KEY_PATTERN.test(key)) return fail("Unauthorized", 401);
    const rl = rateLimit(`ingest-shortcut:${key.slice(0, 16)}`, 60, 60_000);
    if (!rl.allowed) return fail("Too many requests", 429, { retryAfter: rl.retryAfter });

    const device = await authenticateDevice(key);
    if (!device) return fail("Unauthorized", 401);

    const text = extractShortcutText(await req.text());
    if (!text) return fail("The message text is empty", 400);

    const result = await ingestMessage(device.userId, "SHORTCUT", { messageId: shortcutMessageId(text), text, receivedAt: new Date().toISOString() });
    await prisma.device.update({ where: { id: device.id }, data: { lastSyncAt: new Date() } });
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
