import { AnthropicProvider } from "./anthropic.server";
import type { AiProvider } from "./provider";

let cached: AiProvider | null | undefined;

/** The configured provider, or null when AI is off. To change vendor, return a different AiProvider here. */
export function getAiProvider(): AiProvider | null {
  if (cached !== undefined) return cached;
  cached = process.env.AI_PROVIDER !== "none" && process.env.ANTHROPIC_API_KEY ? new AnthropicProvider() : null;
  return cached;
}

/** Sending merchant text to a third party is opt-in. */
export const aiCategorizationEnabled = () => process.env.AI_CATEGORIZATION === "true" && !!getAiProvider();
