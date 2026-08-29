import Link from "next/link";

import { signOutAction } from "@/lib/auth-actions";
import { requireScope } from "@/lib/db/scope";
import { atLeast } from "@/lib/roles";

/**
 * The technician surface. Deliberately not the dashboard shell: one column,
 * big targets, nothing that isn't their own work. Module 3 turns this into a
 * PWA — the data underneath doesn't change.
 */
export default async function MyLayout({ children }: LayoutProps<"/my">) {
  const { userName, orgName, role } = await requireScope();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <div className="min-w-0">
          <Link href="/my/jobs" className="font-mono text-sm font-semibold tracking-tight">
            ServiceOps
          </Link>
          <p className="truncate text-xs text-neutral-500">
            {userName} · {orgName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {atLeast(role, "MANAGER") ? (
            <Link
              href="/dashboard"
              className="text-xs text-neutral-600 underline underline-offset-4 dark:text-neutral-400"
            >
              Dashboard
            </Link>
          ) : null}
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-5 py-6">{children}</main>
    </div>
  );
}
