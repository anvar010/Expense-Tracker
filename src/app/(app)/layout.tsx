import { AppShell } from "@/components/app-shell";

// Every page here renders on the client once the signed-in/guest data has loaded, so there is no static
// shell to validate for instant navigation. Opt the group out instead of failing in dev.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
