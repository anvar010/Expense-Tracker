import { ok } from "@/lib/api";
import { getAiProvider } from "@/lib/ai/index.server";

export async function GET() {
  return ok({ enabled: !!getAiProvider() });
}
