import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, CategorizeRequest, CategorizeResult } from "./provider";
import { redactForAi } from "./redact";

const MODEL = process.env.AI_MODEL || "claude-opus-5-5";

/** Claude implementation. Inputs are redacted first; failures degrade to "no answer", never to guessing. */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private client = new Anthropic({ timeout: 20_000, maxRetries: 1 });

  private async ask(system: string, user: string, maxTokens: number, schema?: Record<string, unknown>) {
    const res = await this.client.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      // Low effort: these are short classification / explanation tasks.
      output_config: { effort: "low", ...(schema ? { format: { type: "json_schema" as const, schema } } : {}) },
      // Refusal fallback so a safety decline is retried server-side instead of failing the request.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") return null;
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : null;
  }

  async categorize(req: CategorizeRequest): Promise<CategorizeResult | null> {
    try {
      const text = await this.ask(
        "You categorise a bank transaction into exactly one of the allowed categories. " +
          "If the merchant could plausibly fit several categories, return a low confidence. Confidence is between 0 and 1.",
        `Allowed categories: ${req.categories.join(", ")}\nMerchant: ${redactForAi(req.merchant)}\nDescription: ${redactForAi(req.description ?? "")}`,
        400,
        {
          type: "object",
          properties: { category: { type: "string", enum: [...req.categories] }, confidence: { type: "number" } },
          required: ["category", "confidence"],
          additionalProperties: false,
        },
      );
      if (!text) return null;
      const parsed = JSON.parse(text) as CategorizeResult;
      return req.categories.includes(parsed.category) && parsed.confidence >= 0 && parsed.confidence <= 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  async explain(question: string, facts: string): Promise<string | null> {
    try {
      return await this.ask(
        "You explain personal finance figures. Use ONLY the facts provided; they were computed exactly from the user's records. " +
          "Never invent numbers or transactions. If the facts don't answer the question, say so. Be concise (under 120 words) and practical.",
        `Question: ${redactForAi(question)}\n\nFacts:\n${redactForAi(facts)}`,
        1200,
      );
    } catch {
      return null;
    }
  }
}
