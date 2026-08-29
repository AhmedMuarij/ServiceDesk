import type { Metadata } from "next";
import Link from "next/link";

import { Card, PageHeader } from "@/components/ui/primitives";
import { requireDashboardAccess } from "@/lib/db/scope";
import { atLeast } from "@/lib/roles";
import type { Role } from "@prisma/client";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  {
    href: "/dashboard/settings/company",
    title: "Company",
    description: "Name, contact details, time zone, currency and invoice defaults.",
    minimum: "ADMIN",
  },
  {
    href: "/dashboard/settings/services",
    title: "Service types",
    description: "What you sell, with default durations and prices.",
    minimum: "ADMIN",
  },
  {
    href: "/dashboard/settings/ai",
    title: "AI",
    description: "Which suggestions are offered, spending cap, and what has been used.",
    minimum: "ADMIN",
  },
  {
    href: "/dashboard/settings/notifications",
    title: "Notifications",
    description: "Which events email whom, and what's been sent.",
    minimum: "ADMIN",
  },
  {
    href: "/dashboard/settings/profile",
    title: "Your profile",
    description: "Your name and password.",
    minimum: "TECHNICIAN",
  },
] as const satisfies ReadonlyArray<{
  href: string;
  title: string;
  description: string;
  minimum: Role;
}>;

export default async function SettingsPage() {
  const { role } = await requireDashboardAccess();
  const sections = SECTIONS.filter((section) => atLeast(role, section.minimum));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full p-5 transition-colors hover:border-neutral-400 dark:hover:border-neutral-600">
              <p className="font-medium">{section.title}</p>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {section.description}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
