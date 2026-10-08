"use client";

import { useCallback, useEffect, useState } from "react";
import { ls, newId } from "./storage";

export type AppNotification = { id: string; title: string; message: string; createdAt: string; read: boolean };
const EVENT = "et:notifications-changed";
export const notificationKey = (mode: string) => `et:notifications:${mode}`;

/** Stores an in-app notification and, if the user granted permission, shows a browser notification too. */
export function pushNotification(mode: string, n: Pick<AppNotification, "title" | "message">) {
  const key = notificationKey(mode);
  ls.write(key, [{ id: newId(), ...n, createdAt: new Date().toISOString(), read: false }, ...ls.read<AppNotification[]>(key, [])].slice(0, 50));
  window.dispatchEvent(new Event(EVENT));
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(n.title, { body: n.message });
  } catch {}
}

export function useNotifications(mode: string) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const load = useCallback(() => setItems(ls.read<AppNotification[]>(notificationKey(mode), [])), [mode]);
  useEffect(() => {
    load();
    window.addEventListener(EVENT, load);
    return () => window.removeEventListener(EVENT, load);
  }, [load]);
  const markAllRead = () => { ls.write(notificationKey(mode), items.map((i) => ({ ...i, read: true }))); load(); };
  const clear = () => { ls.write(notificationKey(mode), []); load(); };
  return { items, unread: items.filter((i) => !i.read).length, markAllRead, clear };
}
