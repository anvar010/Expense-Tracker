import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILE = "public/Spendly Sync.shortcut";

describe("downloadable iPhone shortcut", () => {
  it("is Apple-signed (iOS refuses unsigned shortcut files)", () => {
    expect(readFileSync(FILE).subarray(0, 4).toString("latin1")).toBe("AEA1");
    expect(statSync(FILE).size).toBeGreaterThan(5_000);
  });
});
