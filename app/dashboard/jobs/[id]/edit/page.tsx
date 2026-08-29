import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { checkAvailability } from "@/lib/ai/client";
import { PageHeader } from "@/components/ui/primitives";
import { getJobDetail } from "@/lib/db/jobs";
import { getOrgSettings } from "@/lib/db/organization";
import { toInputParts } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";

import { updateJobAction } from "../../actions";
import { JobForm } from "../../job-form";
import { loadJobFormOptions } from "../../options";

export const metadata: Metadata = { title: "Edit job" };

export default async function EditJobPage(props: PageProps<"/dashboard/jobs/[id]/edit">) {
  const { id } = await props.params;

  let job: Awaited<ReturnType<typeof getJobDetail>>;
  try {
    job = await getJobDetail(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [{ customers, services, members }, org] = await Promise.all([
    loadJobFormOptions(),
    getOrgSettings(),
  ]);
  const ai = await checkAvailability(org.id, "JOB_CLASSIFICATION");

  const scheduled = job.scheduledStart
    ? toInputParts(job.scheduledStart, org.timezone)
    : null;

  const durationMinutes =
    job.scheduledStart && job.scheduledEnd
      ? Math.round((job.scheduledEnd.getTime() - job.scheduledStart.getTime()) / 60_000)
      : (job.serviceType?.defaultDurationMinutes ?? 60);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Edit job #${job.number}`}
        description="Changing the date or the technician emails whoever is affected."
      />
      <JobForm
        action={updateJobAction}
        customers={customers}
        services={services}
        members={members}
        values={{
          id: job.id,
          customerId: job.customerId,
          serviceTypeId: job.serviceTypeId,
          title: job.title,
          description: job.description,
          priority: job.priority,
          scheduledDate: scheduled?.date ?? "",
          scheduledTime: scheduled?.time ?? "09:00",
          durationMinutes,
          assignedMembershipId: job.assignedMembershipId,
          addressLine: job.addressLine,
          city: job.city,
        }}
        submitLabel="Save changes"
        cancelHref={`/dashboard/jobs/${job.id}`}
        aiEnabled={ai.available}
      />
    </div>
  );
}
