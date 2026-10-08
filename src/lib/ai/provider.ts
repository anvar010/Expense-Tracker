/**
 * AI providers sit behind this interface so the transaction pipeline never depends on a vendor.
 * Swap or add an implementation in `index.server.ts`; nothing else changes.
 */
export type CategorizeRequest = { merchant: string; description?: string; categories: readonly string[] };
export type CategorizeResult = { category: string; confidence: number };

export interface AiProvider {
  readonly name: string;
  /** Returns null when the provider can't decide. Must only return a category from `categories`. */
  categorize(req: CategorizeRequest): Promise<CategorizeResult | null>;
  /** Turns already-computed facts into a short plain-language explanation. Never receives raw transactions. */
  explain(question: string, facts: string): Promise<string | null>;
}
