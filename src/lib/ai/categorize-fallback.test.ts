import { describe, expect, it, vi } from "vitest";
import { applyAiCategory } from "./categorize-fallback";
import type { AiProvider } from "./provider";
import { parseMessage } from "../parser/parse";

const fake = (r: { category: string; confidence: number } | null): AiProvider => ({
  name: "fake", categorize: vi.fn(async () => r), explain: vi.fn(async () => null),
});
const msg = "AED 99 debited at XYZ TRADING on 02/10/2026";

describe("applyAiCategory", () => {
  it("accepts a confident AI category and clears the review flag", async () => {
    const before = parseMessage(msg);
    expect(before.needsReview).toBe(true);
    const after = await applyAiCategory(before, msg, fake({ category: "Shopping", confidence: 0.9 }));
    expect(after).toMatchObject({ category: "Shopping", needsReview: false });
  });
  it("keeps the message in review when the AI is unsure, wrong, or absent", async () => {
    const before = parseMessage(msg);
    expect((await applyAiCategory(before, msg, fake({ category: "Shopping", confidence: 0.5 }))).needsReview).toBe(true);
    expect((await applyAiCategory(before, msg, fake({ category: "Not A Category", confidence: 0.99 }))).category).toBe("Other");
    expect((await applyAiCategory(before, msg, fake(null))).needsReview).toBe(true);
    expect(await applyAiCategory(before, msg, null)).toBe(before);
  });
  it("does not call the provider when rules were already confident or it isn't an expense", async () => {
    const p = fake({ category: "Other", confidence: 1 });
    await applyAiCategory(parseMessage("AED 135.75 spent using your card at CARREFOUR UAE."), "x", p);
    await applyAiCategory(parseMessage("Salary credit of AED 5000 received in your account."), "x", p);
    expect(p.categorize).not.toHaveBeenCalled();
  });
});
