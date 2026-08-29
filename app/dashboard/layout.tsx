import { Sidebar } from "@/components/nav/sidebar";
import { requireDashboardAccess } from "@/lib/db/scope";

/**
 * The dashboard shell. proxy.ts already bounces anonymous requests and
 * technicians, but this guard is the one that matters — the proxy is routing,
 * not authorization.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { orgName, userName, role } = await requireDashboardAccess();

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <Sidebar orgName={orgName} userName={userName} role={role} />
      <main className="min-w-0 flex-1 px-6 py-8 print:px-0 print:py-0">{children}</main>
    </div>
  );
}
