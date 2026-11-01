"use client";

import { KeyRound, Plus, ShieldCheck, Trash2, UserCheck, UserX, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Select } from "@/components/select";
import { ROLE_LABEL, type AdminUser } from "@/lib/admin-types";
import { fmt } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/store/data-provider";
import type { Role } from "@/lib/types";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Request failed");
  return body.data as T;
}

export default function AdminPage() {
  const { session } = useData();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<AdminUser | "new" | null>(null);

  const load = useCallback(async () => {
    try { setUsers(await call<AdminUser[]>("/api/admin/users")); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load users"); }
  }, []);
  useEffect(() => {
    if (session?.role !== "SUPER_ADMIN") return;
    call<AdminUser[]>("/api/admin/users").then(setUsers).catch((e) => setError(e instanceof Error ? e.message : "Could not load users"));
  }, [session]);

  if (session?.role !== "SUPER_ADMIN") return <p className="text-sm text-muted">Only the super admin can manage users.</p>;

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted">Add people, reset passwords, disable access and see how each account is doing.</p>
        </div>
        <button className="btn-primary" onClick={() => setForm("new")}><Plus size={16} /> Add user</button>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {form && <UserForm key={form === "new" ? "new" : form.id} user={form === "new" ? null : form} selfId={session.id} onClose={() => setForm(null)} onSaved={() => { setForm(null); void load(); }} />}

      {!users ? <p className="text-sm text-muted">Loading…</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {users.map((u) => {
            const m = u.month.find((x) => x.currency === "AED") ?? u.month[0];
            const self = u.id === session.id;
            return (
              <li key={u.id} className={cn("card space-y-3 p-4", !u.active && "opacity-60")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name}{self && <span className="text-muted"> (you)</span>}</p>
                    <p className="truncate text-sm text-muted">{u.email}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5 text-xs">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1", u.role === "SUPER_ADMIN" ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted")}>
                      {u.role === "SUPER_ADMIN" && <ShieldCheck size={12} />}{ROLE_LABEL[u.role]}
                    </span>
                    {!u.active && <span className="rounded-full bg-warning/15 px-2.5 py-1 text-warning">Disabled</span>}
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-muted">This month in</dt><dd className="num">{m ? fmt(m.income, m.currency) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">This month out</dt><dd className="num">{m ? fmt(m.expenses, m.currency) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Transactions</dt><dd className="num">{u.transactions}</dd></div>
                </dl>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/${u.id}`} className="btn-ghost !min-h-9">Overview</Link>
                  <button className="btn-ghost !min-h-9" onClick={() => setForm(u)}><KeyRound size={15} /> Edit</button>
                  {!self && (
                    <>
                      <button className="btn-ghost !min-h-9" onClick={() => act(() => call(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ active: !u.active }) }))}>
                        {u.active ? <><UserX size={15} /> Disable</> : <><UserCheck size={15} /> Enable</>}
                      </button>
                      <button aria-label={`Delete ${u.name}`} className="btn-ghost !min-h-9 text-danger" onClick={() => {
                        if (confirm(`Delete ${u.name} and all of their data? This can't be undone.`)) void act(() => call(`/api/admin/users/${u.id}`, { method: "DELETE" }));
                      }}><Trash2 size={15} /></button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function UserForm({ user, selfId, onClose, onSaved }: { user: AdminUser | null; selfId: string; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<Role>(user?.role ?? "USER");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      if (user) {
        await call(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ name: f.name, ...(user.id !== selfId && { role }), ...(f.password && { password: f.password }) }) });
      } else {
        await call("/api/admin/users", { method: "POST", body: JSON.stringify({ name: f.name, email: f.email, password: f.password, role }) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{user ? `Edit ${user.name}` : "Add user"}</h2>
        <button type="button" aria-label="Close" className="btn-ghost size-9 !p-0" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="u-name">Name</label><input id="u-name" name="name" required defaultValue={user?.name} className="input" autoComplete="off" /></div>
        <div><label className="label" htmlFor="u-email">Email</label><input id="u-email" name="email" type="email" required={!user} disabled={!!user} defaultValue={user?.email} className="input" autoComplete="off" /></div>
        <div><label className="label" htmlFor="u-pass">{user ? "New password (optional)" : "Password"}</label>
          <input id="u-pass" name="password" type="password" required={!user} minLength={8} className="input" autoComplete="new-password" placeholder={user ? "Leave empty to keep" : "At least 8 characters"} /></div>
        <div><label className="label" htmlFor="u-role">Role</label>
          <Select id="u-role" className="input" value={role} disabled={user?.id === selfId} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="USER">User</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </Select></div>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : user ? "Save changes" : "Create user"}</button>
    </form>
  );
}
