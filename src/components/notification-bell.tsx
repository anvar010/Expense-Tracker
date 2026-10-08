"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import { useData } from "@/lib/store/data-provider";
import { useNotifications } from "@/lib/store/notifications";

export function NotificationBell() {
  const { mode } = useData();
  const { items, unread, markAllRead, clear } = useNotifications(mode);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} className="btn-ghost relative size-10 !p-0"
        onClick={() => { setOpen(!open); if (!open) markAllRead(); }}>
        <Bell size={18} />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-danger" />}
      </button>
      {open && (
        <div className="card absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-medium">Notifications</span>
            {items.length > 0 && <button className="text-xs text-muted hover:text-foreground" onClick={clear}>Clear</button>}
          </div>
          {items.length === 0 ? <p className="px-2 py-4 text-sm text-muted">Nothing yet.</p> : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="px-2 py-2">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted">{n.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
