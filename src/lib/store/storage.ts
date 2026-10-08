// localStorage wrapper that never throws (private mode, quota, SSR).
export const ls = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

export const KEYS = {
  guest: "et:guest:tx",
  cache: "et:cache:tx",
  outbox: "et:outbox",
} as const;

export const newId = () => crypto.randomUUID();

// Everything derived from a signed-in account; wiped on sign-out.
export const COLLECTION_CACHE_KEYS = ["et:cache:accounts", "et:cache:budgets", "et:cache:recurring", "et:notifications:user", "et:alerted:user"];
