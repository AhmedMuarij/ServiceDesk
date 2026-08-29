import type { Metadata } from "next";

import { checkAvailability } from "@/lib/ai/client";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { todayKey } from "@/lib/dates";
import { getOrgSettings } from "@/lib/db/organization";

import { createJobAction } from "../actions";
import { JobForm } from "../job-form";
import { loadJobFormOptions } from "../options";

export const metadata: Metadata = { title: "New job" };

export default async function NewJobPage(props: PageProps<"/dashboard/jobs/new">) {
  const search = await props.searchParams;
  const [{ customers, services, members }, org] = await Promise.all([
    loadJobFormOptions(),
    getOrgSettings(),
  ]);
  // Resolved server-side so an unavailable feature shows no button at all.
  const ai = await checkAvailability(org.id, "JOB_CLASSIFICATION");

  if (customers.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="New job" />
        <EmptyState
          title="Add a customer first"
          description="A job belongs to somebody. Create the customer, then raise the job against them."
          action={<LinkButton href="/dashboard/customers/new">Add a customer</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="New job"
        description="A job with no date stays in New until someone schedules it."
      />
      <JobForm
        action={createJobAction}
        customers={customers}
        services={services}
        members={members}
        values={{
          customerId: typeof search.customerId === "string" ? search.customerId : undefined,
          scheduledDate:
            typeof search.date === "string" ? search.date : todayKey(org.timezone),
          scheduledTime: "09:00",
          durationMinutes: 60,
          priority: "MEDIUM",
        }}
        submitLabel="Create job"
        cancelHref="/dashboard/jobs"
        aiEnabled={ai.available}
      />
    </div>
  );
}
