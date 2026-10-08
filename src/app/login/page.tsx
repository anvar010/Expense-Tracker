"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useData } from "@/lib/store/data-provider";
import type { Session } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const { signedIn } = useData();
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const res = await fetch(`/api/auth/${register ? "register" : "login"}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(res.status === 503 ? "Database is not connected right now. You can keep using guest mode." : (body?.error ?? "Failed"));
      await signedIn(body.data as Session);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-semibold">{register ? "Create account" : "Welcome back"}</h1>
        {register && (
          <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" required className="input" autoComplete="name" /></div>
        )}
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="email" /></div>
        <div><label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={register ? 8 : 1} className="input" autoComplete={register ? "new-password" : "current-password"} /></div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}</button>
        <button type="button" className="w-full text-sm text-muted hover:text-foreground" onClick={() => { setRegister(!register); setError(""); }}>
          {register ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
        <Link href="/dashboard" className="btn-ghost w-full">Continue as guest</Link>
        <p className="text-center text-xs text-muted">Guest data is saved only in this browser.</p>
      </form>
    </main>
  );
}
