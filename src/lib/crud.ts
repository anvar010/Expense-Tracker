import type { z } from "zod";
import { fail, handleError, ok } from "./api";
import { getSession } from "./session";

type Ctx = { params: Promise<{ id?: string }> };

/** Builds authenticated, validated route handlers for a per-user resource. */
export function crudHandlers<I, O>(cfg: {
  schema: z.ZodType<I>;
  list: (userId: string) => Promise<O[]>;
  /** `id` is chosen by the client, so a create that is retried after a lost reply does not make a second copy. */
  create: (userId: string, input: I, id?: string) => Promise<O>;
  update: (userId: string, id: string, input: I) => Promise<O | null>;
  remove: (userId: string, id: string) => Promise<boolean>;
}) {
  const guarded = (fn: (userId: string, req: Request, ctx: Ctx) => Promise<Response>) =>
    async (req: Request, ctx: Ctx) => {
      const s = await getSession();
      if (!s) return fail("Unauthorized", 401);
      try { return await fn(s.id, req, ctx); } catch (e) { return handleError(e); }
    };
  return {
    GET: guarded(async (u) => ok(await cfg.list(u))),
    POST: guarded(async (u, req) => {
      const { id, ...body } = (await req.json()) as { id?: unknown } & Record<string, unknown>;
      const clientId = typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : undefined;
      return ok(await cfg.create(u, cfg.schema.parse(body), clientId), 201);
    }),
    PUT: guarded(async (u, req, { params }) => {
      const r = await cfg.update(u, (await params).id ?? "", cfg.schema.parse(await req.json()));
      return r ? ok(r) : fail("Not found", 404);
    }),
    DELETE: guarded(async (u, _r, { params }) => ((await cfg.remove(u, (await params).id ?? "")) ? ok(null) : fail("Not found", 404))),
  };
}
