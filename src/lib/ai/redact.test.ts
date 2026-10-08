import { describe, expect, it } from "vitest";
import { redactForAi } from "./redact";

describe("redactForAi", () => {
  it("masks card refs, long numbers, emails, phones and IBANs but keeps amounts and merchants", () => {
    const out = redactForAi("Card ending 1234 charged AED 1,250.50 at TALABAT. Account XX9876. Call +971 50 123 4567 or a.b@mail.com. AE070331234567890123456");
    expect(out).toContain("AED 1,250.50");
    expect(out).toContain("TALABAT");
    expect(out).not.toMatch(/1234|9876|123 4567|a\.b@mail|0331234567890123456/);
  });
  it("leaves ordinary text alone", () => {
    expect(redactForAi("Food spending rose 18% to AED 320")).toBe("Food spending rose 18% to AED 320");
  });
});
