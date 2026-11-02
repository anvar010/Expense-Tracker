import { ls, newId, KEYS } from "./storage";

/** Everything that can be changed offline. One queue serves all of them, so changes reach the server in the order they were made. */
export type Entity = "transactions" | "accounts" | "budgets" | "recurring";

export type OpBody =
  | { kind: "create"; entity: Entity; tempId: string; input: unknown }
  | { kind: "update"; entity: Entity; id: string; input: unknown }
  | { kind: "delete"; entity: Entity; id: string };

/** A queued change. opId identifies it so it can be found again while a newer change is queued behind it. */
export type Op = OpBody & { opId: string };

/** The queue, oldest first. Entries saved by an older version have no opId or entity yet, so they get them. */
export function readOutbox(): Op[] {
  const raw = ls.read<(Partial<Op> & { kind: Op["kind"] })[]>(KEYS.outbox, []);
  let fixed = false;
  const ops = raw.map((o) => {
    if (o.opId && o.entity) return o;
    fixed = true;
    return { ...o, opId: o.opId ?? newId(), entity: o.entity ?? "transactions" };
  }) as Op[];
  if (fixed) ls.write(KEYS.outbox, ops);
  return ops;
}

/** Is a change for this kind of thing still waiting to be sent? Then the server's copy is behind what is on screen. */
export const hasPending = (entity: Entity) => readOutbox().some((o) => o.entity === entity);

/** The id the change is about (a create's tempId is the id the new item already has on screen). */
export const opTarget = (o: Op) => (o.kind === "create" ? o.tempId : o.id);
