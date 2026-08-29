import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/primitives";
import { timeZones } from "@/lib/constants";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";

import { CompanyForm } from "./company-form";

export const metadata: Metadata = { title: "Company settings" };

export default async function CompanySettingsPage() {
  await requireDashboardAccess("ADMIN");
  const org = await getOrgSettings();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Company"
        description="How your business appears to customers, and the defaults new invoices inherit."
      />
      <CompanyForm settings={org} zones={timeZones()} />
    </div>
  );
}
