import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isDbDown } from "./db";

export const ok = (data: unknown, status = 200) => NextResponse.json({ ok: true, data }, { status });
export const fail = (error: string, status = 400, extra?: object) =>
  NextResponse.json({ ok: false, error, ...extra }, { status });

/** Maps thrown errors to consistent responses without leaking internals or financial data. */
export function handleError(e: unknown) {
  if (e instanceof ZodError) return fail(e.issues[0]?.message ?? "Invalid input", 422);
  if (isDbDown(e)) return fail("Database unavailable", 503, { dbDown: true });
  console.error("api error", (e as Error)?.name);
  return fail("Something went wrong", 500);
}
