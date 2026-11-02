import { describe, expect, it } from "vitest";
import { newestFirst } from "./tx-order";

const tx = (id: string, date: string, createdAt?: string) => ({ id, date, createdAt });

describe("newestFirst", () => {
  it("orders by date, then by time added within the same day", () => {
    const day = "2026-11-02T08:00:00.000Z"; // every entry on a day is stored at noon, so the date ties
    const list = [tx("a", day, "2026-11-02T06:00:00Z"), tx("old", "2026-11-01T08:00:00.000Z", "2026-11-02T09:00:00Z"), tx("c", day, "2026-11-02T10:30:00Z"), tx("b", day, "2026-11-02T07:00:00Z")];
    expect([...list].sort(newestFirst).map((t) => t.id)).toEqual(["c", "b", "a", "old"]);
  });
  it("keeps entries without a timestamp after dated ones on the same day", () => {
    const day = "2026-11-02T08:00:00.000Z";
    expect([tx("x", day), tx("y", day, "2026-11-02T06:00:00Z")].sort(newestFirst).map((t) => t.id)).toEqual(["y", "x"]);
  });
});
