import Link from "next/link";

import { signOutAction } from "@/lib/auth-actions";
import { atLeast } from "@/lib/roles";
import type { Role } from "@prisma/client";

const NAV = [
  { href: "/dashboard", label: "Dashboard", minimum: "MANAGER" },
  { href: "/dashboard/customers", label: "Customers", minimum: "MANAGER" },
  { href: "/dashboard/jobs", label: "Jobs", minimum: "MANAGER" },
  { href: "/dashboard/schedule", label: "Schedule", minimum: "MANAGER" },
  { href: "/dashboard/invoices", label: "Invoices", minimum: "MANAGER" },
  { href: "/dashboard/team", label: "Team", minimum: "ADMIN" },
  { href: "/dashboard/settings", label: "Settings", minimum: "MANAGER" },
] as const satisfies ReadonlyArray<{ href: string; label: string; minimum: Role }>;

export function Sidebar({
  orgName,
  userName,
  role,
}: {
  orgName: string;
  userName: string;
  role: Role;
}) {
  const items = NAV.filter((item) => atLeast(role, item.minimum));

  return (
    <aside className="flex shrink-0 flex-col border-b print:hidden border-neutral-200 md:w-56 md:border-r md:border-b-0 dark:border-neutral-800">
      <div className="px-5 py-5">
        <Link href="/dashboard" className="font-mono text-sm font-semibold tracking-tight">
          ServiceOps
        </Link>
        <p className="mt-1 truncate text-xs text-neutral-500" title={orgName}>
          {orgName}
        </p>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
        {items.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="hidden border-t border-neutral-200 px-5 py-4 md:block dark:border-neutral-800">
        <p className="truncate text-sm font-medium" title={userName}>
          {userName}
        </p>
        <p className="font-mono text-[0.65rem] tracking-wider text-neutral-500 uppercase">
          {role.toLowerCase()}
        </p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="mt-2 text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:text-neutral-100"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
