// Known merchants. `confidence` below the auto threshold marks merchants whose category depends on what was bought.
export type KnownMerchant = { key: string; display: string; category: string; confidence: number };

export const KNOWN_MERCHANTS: KnownMerchant[] = [
  { key: "talabat", display: "Talabat", category: "Food & Dining", confidence: 0.9 },
  { key: "deliveroo", display: "Deliveroo", category: "Food & Dining", confidence: 0.9 },
  { key: "noon food", display: "Noon Food", category: "Food & Dining", confidence: 0.9 },
  { key: "starbucks", display: "Starbucks", category: "Food & Dining", confidence: 0.9 },
  { key: "mcdonald", display: "McDonald's", category: "Food & Dining", confidence: 0.9 },
  { key: "carrefour", display: "Carrefour", category: "Groceries", confidence: 0.9 },
  { key: "lulu", display: "Lulu Hypermarket", category: "Groceries", confidence: 0.9 },
  { key: "spinneys", display: "Spinneys", category: "Groceries", confidence: 0.9 },
  { key: "union coop", display: "Union Coop", category: "Groceries", confidence: 0.9 },
  { key: "uber", display: "Uber", category: "Transportation", confidence: 0.85 },
  { key: "careem ride", display: "Careem Ride", category: "Transportation", confidence: 0.9 },
  { key: "careem", display: "Careem", category: "Transportation", confidence: 0.6 }, // rides or food delivery
  { key: "salik", display: "Salik", category: "Transportation", confidence: 0.95 },
  { key: "adnoc", display: "ADNOC", category: "Transportation", confidence: 0.8 },
  { key: "enoc", display: "ENOC", category: "Transportation", confidence: 0.8 },
  { key: "netflix", display: "Netflix", category: "Subscriptions", confidence: 0.95 },
  { key: "spotify", display: "Spotify", category: "Subscriptions", confidence: 0.95 },
  { key: "anghami", display: "Anghami", category: "Subscriptions", confidence: 0.95 },
  { key: "dewa", display: "DEWA", category: "Utilities", confidence: 0.95 },
  { key: "sewa", display: "SEWA", category: "Utilities", confidence: 0.95 },
  { key: "etisalat", display: "Etisalat", category: "Utilities", confidence: 0.85 },
  { key: "du ", display: "du", category: "Utilities", confidence: 0.8 },
  { key: "amazon", display: "Amazon", category: "Shopping", confidence: 0.6 }, // many product types
  { key: "noon", display: "Noon", category: "Shopping", confidence: 0.6 },
  { key: "ikea", display: "IKEA", category: "Shopping", confidence: 0.85 },
];

export const normalizeMerchant = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function findKnownMerchant(raw: string): KnownMerchant | undefined {
  const n = normalizeMerchant(raw);
  // Longest key first so "careem ride" wins over "careem". A key matches from a word start;
  // keys with a trailing space (e.g. "du ") must match a whole word.
  return [...KNOWN_MERCHANTS]
    .sort((a, b) => b.key.length - a.key.length)
    .find((m) => new RegExp(`(^| )${m.key.trim()}${m.key.endsWith(" ") ? "( |$)" : ""}`).test(n));
}

export const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
