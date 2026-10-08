import { z } from "zod";
import { fail, handleError, ok } from "@/lib/api";
import { getAiProvider } from "@/lib/ai/index.server";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

const schema = z.object({ question: z.string().trim().min(1).max(300), facts: z.string().trim().min(1).max(4000) });

/** Explains facts the client already computed. It never receives raw transactions and runs no queries. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return fail("Sign in to use AI explanations", 401);
  const ai = getAiProvider();
  if (!ai) return fail("AI is not configured", 501);
  const rl = rateLimit(`ai:${s.id}`, 20, 60_000);
  if (!rl.allowed) return fail("Too many requests", 429, { retryAfter: rl.retryAfter });
  try {
    const { question, facts } = schema.parse(await req.json());
    const text = await ai.explain(question, facts);
    return text ? ok({ text }) : fail("No explanation available right now", 502);
  } catch (e) {
    return handleError(e);
  }
}
