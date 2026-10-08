import { AUTO_THRESHOLD } from "../parser/categorize";
import type { ParsedMessage } from "../parser/parse";
import { DEFAULT_CATEGORIES } from "../types";
import type { AiProvider } from "./provider";

export const AI_ACCEPT_CONFIDENCE = 0.8;

/**
 * Last resort after rules, corrections, known merchants and keywords. Only expenses with a merchant and a
 * low category confidence are sent. The AI answer is accepted only if it is confident and a real category.
 */
export async function applyAiCategory(parsed: ParsedMessage, text: string, provider: AiProvider | null): Promise<ParsedMessage> {
  if (!provider || !parsed.isTransaction || parsed.type !== "EXPENSE" || !parsed.merchant || parsed.categoryConfidence >= AUTO_THRESHOLD) return parsed;
  const r = await provider.categorize({ merchant: parsed.merchant, description: text, categories: DEFAULT_CATEGORIES });
  if (!r || r.confidence < AI_ACCEPT_CONFIDENCE || !DEFAULT_CATEGORIES.includes(r.category as never)) return parsed;
  return {
    ...parsed,
    category: r.category,
    categoryConfidence: r.confidence,
    needsReview: parsed.confidence < AUTO_THRESHOLD,
  };
}
