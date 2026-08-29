import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { timeZones } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { requireScope } from "@/lib/db/scope";

import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const { orgId, orgName, role } = await requireScope();

  // Only an owner or admin sets the workspace up; anyone else has landed here
  // by accident.
  if (role === "TECHNICIAN" || role === "MANAGER") redirect("/dashboard");

  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true, _count: { select: { serviceTypes: true } } },
  });

  // Already set up — don't make them do it twice.
  if (organization && organization._count.serviceTypes > 0) redirect("/dashboard");

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-16">
      <OnboardingForm
        orgName={orgName}
        zones={timeZones()}
        defaultZone={organization?.timezone ?? "Asia/Karachi"}
      />
    </div>
  );
}
