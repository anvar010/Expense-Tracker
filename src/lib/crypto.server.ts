import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function key(): Buffer {
  const raw = process.env.MESSAGE_ENCRYPTION_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  // Fail closed: never store message text unencrypted because a key is missing.
  if (!k || k.length !== 32) throw new Error("MESSAGE_ENCRYPTION_KEY must be 32 random bytes, base64-encoded");
  return k;
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

export const DEVICE_TOKEN_PREFIX = "etd_";
export const newDeviceToken = () => DEVICE_TOKEN_PREFIX + randomBytes(32).toString("base64url");
/** Tokens are high-entropy random values, so a plain SHA-256 is sufficient for storage. */
export const hashToken = (t: string) => sha256(t);
