import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-20">
      <div className="flex flex-col gap-4">
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
          Module 1 · scaffolded
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Run the whole job, from the call to the invoice.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
          ServiceOps replaces the WhatsApp threads, the notebook, and the
          spreadsheet that small field-service businesses run on. Customers,
          jobs, scheduling, technicians, and invoices in one place.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/auth/register"
          className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Create a workspace
        </Link>
        <Link
          href="/auth/login"
          className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Sign in
        </Link>
      </div>

      <nav className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <p className="mb-3 font-mono text-xs uppercase tracking-widest text-neutral-500">
          Scaffolded routes
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-sm">
          {[
            ["/dashboard", "dashboard"],
            ["/dashboard/customers", "customers"],
            ["/dashboard/jobs", "jobs"],
            ["/dashboard/schedule", "schedule"],
            ["/dashboard/invoices", "invoices"],
            ["/dashboard/team", "team"],
            ["/dashboard/settings", "settings"],
            ["/my/jobs", "my jobs"],
          ].map(([href, label]) => (
            <li key={href}>
              <Link
                href={href}
                className="text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
