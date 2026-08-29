import { NotFoundError } from "@/lib/errors";
import { assertTransition, deriveStatus } from "@/lib/jobs/transitions";
import { enqueueNotifications, type Recipient } from "@/lib/notifications/enqueue";
import type { JobPriority, JobStatus, Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { getScope } from "./scope";

export const JOBS_PER_PAGE = 25;

export type JobWriteInput = {
  customerId: string;
  serviceTypeId?: string;
  title: string;
  description?: string;
  priority: JobPriority;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  assignedMembershipId?: string;
  addressLine?: string;
  city?: string;
};

const jobListSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  scheduledStart: true,
  scheduledEnd: true,
  customer: { select: { id: true, name: true, phone: true } },
  serviceType: { select: { name: true } },
  assignedTo: {
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      technician: { select: { calendarColor: true } },
    },
  },
} satisfies Prisma.JobSelect;

/* ------------------------------------------------------------------ reads */

export async function listJobs({
  status,
  technicianId,
  from,
  to,
  query = "",
  page = 1,
}: {
  status?: JobStatus;
  technicianId?: string;
  from?: Date;
  to?: Date;
  query?: string;
  page?: number;
} = {}) {
  const { orgId } = await getScope();
  const trimmed = query.trim();

  const where: Prisma.JobWhereInput = {
    organizationId: orgId,
    ...(status ? { status } : {}),
    ...(technicianId ? { assignedMembershipId: technicianId } : {}),
    ...(from || to
      ? { scheduledStart: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
      : {}),
    ...(trimmed
      ? {
          OR: [
            { title: { contains: trimmed, mode: "insensitive" } },
            { customer: { name: { contains: trimmed, mode: "insensitive" } } },
            ...(Number.isInteger(Number(trimmed)) ? [{ number: Number(trimmed) }] : []),
          ],
        }
      : {}),
  };

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: [{ scheduledStart: { sort: "asc", nulls: "last" } }, { number: "desc" }],
      skip: (page - 1) * JOBS_PER_PAGE,
      take: JOBS_PER_PAGE,
      select: jobListSelect,
    }),
    prisma.job.count({ where }),
  ]);

  return { jobs, total, page, pageCount: Math.max(1, Math.ceil(total / JOBS_PER_PAGE)) };
}

/** Jobs in a date window, for the schedule. */
export async function jobsInRange(from: Date, to: Date, technicianId?: string) {
  const { orgId } = await getScope();
  return prisma.job.findMany({
    where: {
      organizationId: orgId,
      status: { not: "CANCELLED" },
      scheduledStart: { gte: from, lt: to },
      ...(technicianId ? { assignedMembershipId: technicianId } : {}),
    },
    orderBy: { scheduledStart: "asc" },
    select: jobListSelect,
  });
}

export async function getJobDetail(id: string) {
  const { orgId } = await getScope();
  const job = await prisma.job.findFirst({
    where: { id, organizationId: orgId },
    include: {
      customer: true,
      serviceType: true,
      assignedTo: { select: { id: true, user: { select: { name: true, email: true } } } },
      createdBy: { select: { user: { select: { name: true } } } },
      invoice: { select: { id: true, number: true, status: true, totalCents: true, currency: true } },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          from: true,
          to: true,
          note: true,
          createdAt: true,
          changedBy: { select: { user: { select: { name: true } } } },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!job) throw new NotFoundError("Job not found");
  return job;
}

/** A technician's own list. Scoped to them, not just to the org. */
export async function myJobs(from?: Date) {
  const { orgId, membershipId } = await getScope();
  return prisma.job.findMany({
    where: {
      organizationId: orgId,
      assignedMembershipId: membershipId,
      status: { notIn: ["CANCELLED"] },
      ...(from ? { OR: [{ scheduledStart: { gte: from } }, { scheduledStart: null }] } : {}),
    },
    orderBy: [{ scheduledStart: { sort: "asc", nulls: "last" } }, { number: "desc" }],
    select: {
      ...jobListSelect,
      customer: {
        select: { id: true, name: true, phone: true, addressLine: true, city: true },
      },
    },
  });
}

export async function getMyJobDetail(id: string) {
  const { orgId, membershipId } = await getScope();
  const job = await prisma.job.findFirst({
    // The assignment is part of the lookup: a technician cannot read a job
    // that isn't theirs, even by guessing an id.
    where: { id, organizationId: orgId, assignedMembershipId: membershipId },
    include: {
      customer: true,
      serviceType: true,
      notes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!job) throw new NotFoundError("Job not found");
  return job;
}

/* ----------------------------------------------------------------- writes */

async function loadNotifyContext(tx: Prisma.TransactionClient, orgId: string) {
  const org = await tx.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true, email: true, timezone: true },
  });
  return { orgId, orgName: org.name, orgEmail: org.email, timezone: org.timezone };
}

function jobPayload(job: {
  number: number;
  title: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  addressLine: string | null;
  city: string | null;
}, extra: Record<string, string | null>) {
  return {
    jobNumber: job.number,
    jobTitle: job.title,
    scheduledStart: job.scheduledStart?.toISOString() ?? null,
    scheduledEnd: job.scheduledEnd?.toISOString() ?? null,
    address: [job.addressLine, job.city].filter(Boolean).join(", ") || null,
    ...extra,
  } satisfies Prisma.InputJsonObject;
}

export async function createJob(input: JobWriteInput) {
  const { orgId, membershipId } = await getScope();

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, organizationId: orgId },
      select: { id: true, name: true, email: true, addressLine: true, city: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    const assignee = input.assignedMembershipId
      ? await tx.membership.findFirst({
          where: {
            id: input.assignedMembershipId,
            organizationId: orgId,
            status: "ACTIVE",
          },
          select: { id: true, user: { select: { name: true, email: true } } },
        })
      : null;
    if (input.assignedMembershipId && !assignee) {
      throw new NotFoundError("That technician is not on your team");
    }

    const status = deriveStatus("NEW", Boolean(input.scheduledStart), Boolean(assignee));

    // Allocate the customer-facing number atomically. The row lock this takes
    // on the organization is why the transaction must stay short.
    const counter = await tx.organization.update({
      where: { id: orgId },
      data: { nextJobNumber: { increment: 1 } },
      select: { nextJobNumber: true },
    });

    const job = await tx.job.create({
      data: {
        organizationId: orgId,
        number: counter.nextJobNumber - 1,
        customerId: customer.id,
        serviceTypeId: input.serviceTypeId ?? null,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        status,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        assignedMembershipId: assignee?.id ?? null,
        addressLine: input.addressLine ?? customer.addressLine,
        city: input.city ?? customer.city,
        createdByMembershipId: membershipId,
      },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        addressLine: true,
        city: true,
      },
    });

    await tx.jobStatusHistory.create({
      data: {
        jobId: job.id,
        from: null,
        to: status,
        changedByMembershipId: membershipId,
      },
    });

    const context = await loadNotifyContext(tx, orgId);
    const serviceName = input.serviceTypeId
      ? ((
          await tx.serviceType.findUnique({
            where: { id: input.serviceTypeId },
            select: { name: true },
          })
        )?.name ?? null)
      : null;

    const payload = jobPayload(job, {
      customerName: customer.name,
      serviceName,
      technicianName: assignee?.user?.name ?? null,
      orgName: context.orgName,
      timezone: context.timezone,
    });

    await enqueueNotifications(tx, {
      organizationId: orgId,
      type: "JOB_CREATED",
      subject: `New job #${job.number} — ${job.title}`,
      payload,
      jobId: job.id,
      recipients: [{ kind: "ORG", email: context.orgEmail, name: context.orgName }],
    });

    if (job.scheduledStart) {
      await enqueueNotifications(tx, {
        organizationId: orgId,
        type: "APPOINTMENT_SCHEDULED",
        subject: `Your appointment is booked — job #${job.number}`,
        payload,
        jobId: job.id,
        recipients: appointmentRecipients(customer, assignee),
      });
    }

    if (assignee) {
      await enqueueNotifications(tx, {
        organizationId: orgId,
        type: "JOB_ASSIGNED",
        subject: `You've been assigned job #${job.number}`,
        payload,
        jobId: job.id,
        recipients: [
          {
            kind: "TECHNICIAN",
            email: assignee.user?.email,
            name: assignee.user?.name,
          },
        ],
      });
    }
    return job;
  });
}

function appointmentRecipients(
  customer: { name: string; email: string | null },
  assignee: { user: { name: string | null; email: string | null } | null } | null,
): Recipient[] {
  return [
    { kind: "CUSTOMER", email: customer.email, name: customer.name },
    ...(assignee
      ? [
          {
            kind: "TECHNICIAN" as const,
            email: assignee.user?.email,
            name: assignee.user?.name,
          },
        ]
      : []),
  ];
}

export async function updateJob(id: string, input: JobWriteInput) {
  const { orgId, membershipId } = await getScope();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.job.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        number: true,
        status: true,
        scheduledStart: true,
        assignedMembershipId: true,
      },
    });
    if (!existing) throw new NotFoundError("Job not found");

    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, organizationId: orgId },
      select: { id: true, name: true, email: true, addressLine: true, city: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    const assignee = input.assignedMembershipId
      ? await tx.membership.findFirst({
          where: {
            id: input.assignedMembershipId,
            organizationId: orgId,
            status: "ACTIVE",
          },
          select: { id: true, user: { select: { name: true, email: true } } },
        })
      : null;
    if (input.assignedMembershipId && !assignee) {
      throw new NotFoundError("That technician is not on your team");
    }

    const status = deriveStatus(
      existing.status,
      Boolean(input.scheduledStart),
      Boolean(assignee),
    );

    const job = await tx.job.update({
      where: { id },
      data: {
        customerId: customer.id,
        serviceTypeId: input.serviceTypeId ?? null,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        status,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        assignedMembershipId: assignee?.id ?? null,
        addressLine: input.addressLine ?? customer.addressLine,
        city: input.city ?? customer.city,
      },
      select: {
        id: true,
        number: true,
        title: true,
        scheduledStart: true,
        scheduledEnd: true,
        addressLine: true,
        city: true,
      },
    });

    if (status !== existing.status) {
      await tx.jobStatusHistory.create({
        data: {
          jobId: id,
          from: existing.status,
          to: status,
          note: "Updated from the job form",
          changedByMembershipId: membershipId,
        },
      });
    }

    const context = await loadNotifyContext(tx, orgId);
    const payload = jobPayload(job, {
      customerName: customer.name,
      serviceName: null,
      technicianName: assignee?.user?.name ?? null,
      orgName: context.orgName,
      timezone: context.timezone,
    });

    // Only tell people about changes they'd actually care about.
    const timeChanged =
      existing.scheduledStart?.getTime() !== input.scheduledStart?.getTime();
    const assigneeChanged = existing.assignedMembershipId !== (assignee?.id ?? null);

    if (timeChanged && input.scheduledStart) {
      await enqueueNotifications(tx, {
        organizationId: orgId,
        type: existing.scheduledStart
          ? "APPOINTMENT_RESCHEDULED"
          : "APPOINTMENT_SCHEDULED",
        subject: existing.scheduledStart
          ? `Your appointment has moved — job #${job.number}`
          : `Your appointment is booked — job #${job.number}`,
        payload,
        jobId: id,
        recipients: appointmentRecipients(customer, assignee),
      });
    }

    if (assigneeChanged && assignee) {
      await enqueueNotifications(tx, {
        organizationId: orgId,
        type: "JOB_ASSIGNED",
        subject: `You've been assigned job #${job.number}`,
        payload,
        jobId: id,
        recipients: [
          { kind: "TECHNICIAN", email: assignee.user?.email, name: assignee.user?.name },
        ],
      });
    }

    return job;
  });
}

export async function changeJobStatus(id: string, to: JobStatus, note?: string) {
  const { orgId, membershipId, role } = await getScope();

  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        addressLine: true,
        city: true,
        assignedMembershipId: true,
        customer: { select: { name: true, email: true } },
        assignedTo: { select: { user: { select: { name: true, email: true } } } },
      },
    });
    if (!job) throw new NotFoundError("Job not found");

    // The rules live in one place; this is the only path that changes status.
    assertTransition(job.status, to, {
      role,
      isAssignee: job.assignedMembershipId === membershipId,
      hasSchedule: Boolean(job.scheduledStart),
      hasAssignee: Boolean(job.assignedMembershipId),
    });

    const now = new Date();
    await tx.job.update({
      where: { id },
      data: {
        status: to,
        ...(to === "IN_PROGRESS" ? { startedAt: now } : {}),
        ...(to === "COMPLETED" ? { completedAt: now } : {}),
        ...(to === "CANCELLED" ? { cancelledAt: now, cancelReason: note ?? null } : {}),
      },
    });

    await tx.jobStatusHistory.create({
      data: {
        jobId: id,
        from: job.status,
        to,
        note: note ?? null,
        changedByMembershipId: membershipId,
      },
    });

    if (to === "COMPLETED") {
      const context = await loadNotifyContext(tx, orgId);
      await enqueueNotifications(tx, {
        organizationId: orgId,
        type: "JOB_COMPLETED",
        subject: `Your service is complete — job #${job.number}`,
        payload: jobPayload(job, {
          customerName: job.customer.name,
          serviceName: null,
          technicianName: job.assignedTo?.user?.name ?? null,
          orgName: context.orgName,
          timezone: context.timezone,
        }),
        jobId: id,
        recipients: [
          { kind: "CUSTOMER", email: job.customer.email, name: job.customer.name },
        ],
      });
    }

    return { id, status: to };
  });
}

export async function addJobNote(jobId: string, body: string) {
  const { orgId, membershipId, role } = await getScope();

  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      organizationId: orgId,
      // A technician may only annotate their own jobs.
      ...(role === "TECHNICIAN" ? { assignedMembershipId: membershipId } : {}),
    },
    select: { id: true },
  });
  if (!job) throw new NotFoundError("Job not found");

  await prisma.jobNote.create({
    data: { jobId, body, authorMembershipId: membershipId },
  });
}

/**
 * Stores the customer-facing summary. Called only after a human accepted the
 * suggestion — the model has no path to this function of its own.
 */
export async function setJobSummary(jobId: string, summary: string | null) {
  const { orgId } = await getScope();
  const { count } = await prisma.job.updateMany({
    where: { id: jobId, organizationId: orgId },
    data: { customerSummary: summary },
  });
  if (count === 0) throw new NotFoundError("Job not found");
}

/**
 * Assigns (or unassigns) a technician. Goes through the same machinery as a
 * manual edit — status recomputed from the two facts, history written, the
 * technician notified — so an AI-suggested assignment is indistinguishable
 * from one a dispatcher made by hand.
 */
export async function assignTechnician(jobId: string, membershipId: string | null) {
  const { orgId, membershipId: actor } = await getScope();

  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({
      where: { id: jobId, organizationId: orgId },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        addressLine: true,
        city: true,
        assignedMembershipId: true,
        customer: { select: { name: true, email: true } },
      },
    });
    if (!job) throw new NotFoundError("Job not found");

    const assignee = membershipId
      ? await tx.membership.findFirst({
          where: { id: membershipId, organizationId: orgId, status: "ACTIVE" },
          select: { id: true, user: { select: { name: true, email: true } } },
        })
      : null;
    if (membershipId && !assignee) {
      throw new NotFoundError("That technician is not on your team");
    }

    const status = deriveStatus(
      job.status,
      Boolean(job.scheduledStart),
      Boolean(assignee),
    );

    await tx.job.update({
      where: { id: jobId },
      data: { assignedMembershipId: assignee?.id ?? null, status },
    });

    if (status !== job.status) {
      await tx.jobStatusHistory.create({
        data: {
          jobId,
          from: job.status,
          to: status,
          note: assignee ? "Technician assigned" : "Technician unassigned",
          changedByMembershipId: actor,
        },
      });
    }

    if (assignee && assignee.id !== job.assignedMembershipId) {
      const context = await loadNotifyContext(tx, orgId);
      await enqueueNotifications(tx, {
        organizationId: orgId,
        type: "JOB_ASSIGNED",
        subject: `You've been assigned job #${job.number}`,
        payload: jobPayload(job, {
          customerName: job.customer.name,
          serviceName: null,
          technicianName: assignee.user?.name ?? null,
          orgName: context.orgName,
          timezone: context.timezone,
        }),
        jobId,
        recipients: [
          { kind: "TECHNICIAN", email: assignee.user?.email, name: assignee.user?.name },
        ],
      });
    }

    return { status };
  });
}
