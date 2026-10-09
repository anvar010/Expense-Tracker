export type PhonePlatform = "ANDROID" | "IOS";

/** Best guess of which phone this browser is on, so setup can lead with the right instructions. */
export function detectPlatform(ua: string): PhonePlatform | null {
  if (/android/i.test(ua)) return "ANDROID";
  if (/iphone|ipad|ipod/i.test(ua)) return "IOS";
  return null;
}
