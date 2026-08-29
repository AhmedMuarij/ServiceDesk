import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JobStatusBadge } from "@/components/status-badge";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";
import { getMember } from "@/lib/db/team";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/roles";

import { RoleForm, TechnicianProfileForm } from "./member-forms";

export const metadata: Metadata = { title: "Team member" };

export default async function TeamMemberPage(props: PageProps<"/dashboard/team/[id]">) {
  const { id } = await props.params;
  const scope = await requireDashboardAccess("ADMIN");

  let member: Awaited<ReturnType<typeof getMember>>;
  try {
    member = await getMember(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const org = await getOrgSettings();
  const name = member.user?.name ?? member.inviteEmail ?? "Unknown";

  const roleLocked =
    member.id === scope.membershipId
      ? "You can't change your own role — ask another admin."
      : member.role === "OWNER" && scope.role !== "OWNER"
        ? "Only an owner can change another owner's role."
        : undefined;

  const roles =
    scope.role === "OWNER" ? (["OWNER", ...ASSIGNABLE_ROLES] as const) : ASSIGNABLE_ROLES;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={name}
        description={member.user?.email ?? member.inviteEmail ?? undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{ROLE_LABEL[member.role]}</Badge>
        {member.status === "SUSPENDED" ? <Badge tone="red">Suspended</Badge> : null}
        {member.status === "INVITED" ? <Badge tone="amber">Invitation pending</Badge> : null}
        <span className="text-xs text-neutral-500">
          {member.joinedAt
            ? `Joined ${formatDate(member.joinedAt, org.timezone)}`
            : `Invited ${formatDate(member.createdAt, org.timezone)}`}
        </span>
      </div>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold">Role</h2>
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          {ROLE_DESCRIPTION[member.role]}
        </p>
        <RoleForm
          memberId={member.id}
          currentRole={member.role}
          roles={[...roles]}
          disabled={roleLocked}
        />
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold">Field profile</h2>
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Skills and capacity. Module 2 uses these to recommend who takes a job.
        </p>
        <TechnicianProfileForm memberId={member.id} profile={member.technician} />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Open jobs{" "}
          <span className="font-normal text-neutral-500">
            ({member.assignedJobs.length} of {member._count.assignedJobs} all time)
          </span>
        </h2>
        {member.assignedJobs.length === 0 ? (
          <EmptyState
            title="Nothing on their plate"
            description="Assigned jobs that aren't finished yet will show up here."
          />
        ) : (
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Job</Th>
                  <Th>Customer</Th>
                  <Th>Scheduled</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {member.assignedJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                    <Td>
                      <Link
                        href={`/dashboard/jobs/${job.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        #{job.number} {job.title}
                      </Link>
                    </Td>
                    <Td className="text-neutral-600 dark:text-neutral-400">
                      {job.customer.name}
                    </Td>
                    <Td className="text-neutral-600 dark:text-neutral-400">
                      {job.scheduledStart
                        ? formatDate(job.scheduledStart, org.timezone)
                        : "Not scheduled"}
                    </Td>
                    <Td>
                      <JobStatusBadge status={job.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
