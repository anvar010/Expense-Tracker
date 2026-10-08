// Fixed-window limiter, in memory. This is per server instance: behind several instances or serverless,
// swap the Map for a shared store (e.g. Redis) with the same interface.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const h = hits.get(key);
  if (!h || now >= h.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    if (hits.size > 10_000) for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    return { allowed: true, retryAfter: 0 };
  }
  h.count++;
  return { allowed: h.count <= limit, retryAfter: Math.ceil((h.resetAt - now) / 1000) };
}
