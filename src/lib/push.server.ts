import webpush from "web-push";
import { prisma } from "./db";
import { transactionMessage } from "./push-core";
import type { Tx } from "./types";

let configured: boolean | undefined;
function configure() {
  if (configured !== undefined) return configured;
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env;
  configured = !!(pub && priv && subject);
  if (configured) webpush.setVapidDetails(subject!, pub!, priv!);
  return configured;
}

export const pushPublicKey = () => (configure() ? process.env.VAPID_PUBLIC_KEY! : null);

export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, // the same browser may sign in as someone else
  });
}

export const removeSubscription = (userId: string, endpoint: string) =>
  prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });

/** Tells every device the user has enabled alerts on about a new debit/credit. Never throws: an alert must not fail a save. */
export async function notifyTransaction(userId: string, tx: Tx) {
  try {
    const message = transactionMessage(tx);
    if (!message || !configure()) return;
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    const payload = JSON.stringify(message);
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {}); // expired
      }
    }));
  } catch {
    // alerts are best-effort
  }
}
