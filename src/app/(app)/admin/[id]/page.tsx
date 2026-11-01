import { Suspense } from "react";
import { UserOverview } from "./overview";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <UserOverview params={params} />
    </Suspense>
  );
}
