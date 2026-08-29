import { z } from "zod";

import { ask, type AiResult } from "@/lib/ai/client";
import { prisma } from "@/lib/db/prisma";
import { dayKey, endOfDay, startOfDay } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";

/**
 * Suggests who should take a job.
 *
 * The model does not get to invent a person: the candidate list is built from
 * active members and the schema is an enum of their ids. What it is actually
 * for is weighing things a sort cannot — this technician has done four of this
 * exact service for this exact customer, that one is already on five jobs that
 * day, this one's skills match but they are marked unavailable.
 *
 * The reasoning is shown to the dispatcher, who is the one who knows that
 * Imran does not do rooftop work any more.
 */

export type Recommendation = {
  membershipId: string;
  name: string;
  rationale: string;
  concern: string | null;
  alternatives: Array<{ membershipId: string; name: string; why: string }>;
};

type Candidate = {
  id: string;
  name: string;
  role: string;
  skills: string[];
  isAvailable: boolean;
  maxJobsPerDay: number;
  jobsThatDay: number;
  doneThisService: number;
  doneForThisCustomer: number;
};

export async function recommendTechnician(input: {
  organizationId: string;
  jobId: string;
}): Promise<AiResult<Recommendation>> {
  const job = await prisma.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      priority: true,
      scheduledStart: true,
      scheduledEnd: true,
      addressLine: true,
      city: true,
      customerId: true,
      serviceTypeId: true,
      serviceType: { select: { name: true, defaultDurationMinutes: true } },
      customer: { select: { name: true } },
    },
  });
  if (!job) throw new NotFoundError("Job not found");

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { name: true, timezone: true },
  });
  const timezone = org?.timezone ?? "UTC";

  const members = await prisma.membership.findMany({
    where: {
      organizationId: input.organizationId,
      status: "ACTIVE",
      role: { in: ["TECHNICIAN", "MANAGER"] },
    },
    select: {
      id: true,
      role: true,
      user: { select: { name: true } },
      technician: { select: { skills: true, isAvailable: true, maxJobsPerDay: true } },
    },
  });

  if (members.length === 0) {
    return {
      ok: false,
      reason: "invalid_output",
      message: "There's nobody on the team to assign this to yet.",
    };
  }

  // Workload on the day the job is booked; unscheduled jobs have no day, so
  // load is not a factor for them.
  const day = job.scheduledStart ? dayKey(job.scheduledStart, timezone) : null;
  const from = day ? startOfDay(day, timezone) : null;
  const to = day ? endOfDay(day, timezone) : null;

  const candidates: Candidate[] = await Promise.all(
    members.map(async (member) => {
      const [jobsThatDay, doneThisService, doneForThisCustomer] = await Promise.all([
        from && to
          ? prisma.job.count({
              where: {
                organizationId: input.organizationId,
                assignedMembershipId: member.id,
                status: { notIn: ["CANCELLED"] },
                scheduledStart: { gte: from, lt: to },
                NOT: { id: job.id },
              },
            })
          : Promise.resolve(0),
        job.serviceTypeId
          ? prisma.job.count({
              where: {
                organizationId: input.organizationId,
                assignedMembershipId: member.id,
                serviceTypeId: job.serviceTypeId,
                status: "COMPLETED",
              },
            })
          : Promise.resolve(0),
        prisma.job.count({
          where: {
            organizationId: input.organizationId,
            assignedMembershipId: member.id,
            customerId: job.customerId,
            status: "COMPLETED",
          },
        }),
      ]);

      return {
        id: member.id,
        name: member.user?.name ?? "Unknown",
        role: member.role,
        skills: member.technician?.skills ?? [],
        isAvailable: member.technician?.isAvailable ?? true,
        maxJobsPerDay: member.technician?.maxJobsPerDay ?? 6,
        jobsThatDay,
        doneThisService,
        doneForThisCustomer,
      };
    }),
  );

  const ids: [string, ...string[]] = [
    candidates[0].id,
    ...candidates.slice(1).map((candidate) => candidate.id),
  ];

  const schema = z.object({
    membershipId: z.enum(ids),
    rationale: z.string().min(1).max(300),
    concern: z.string().max(200).nullable(),
    alternatives: z
      .array(
        z.object({
          membershipId: z.enum(ids),
          why: z.string().min(1).max(160),
        }),
      )
      .max(2),
  });

  const cachedSystem = `You help a dispatcher at ${org?.name ?? "a field service business"} decide who should take a job.

How to weigh it, in order:
1. Can they actually do this work? Skills that match the service matter more than anything else.
2. Are they free? Someone already at or over their daily job limit is a poor choice even if they are the best fit, and someone marked unavailable should not be picked unless there is genuinely nobody else.
3. Continuity. Having done this exact service before, or having been to this customer before, is worth real weight — the customer does not have to explain everything again.
4. Spread the work. All else close to equal, prefer whoever has less on that day.

Rules:
- Pick exactly one person from the candidates given, by their id.
- "rationale" is one or two sentences to the dispatcher explaining the pick. Refer to the actual numbers you were given.
- "concern" is for the thing that makes this pick imperfect — they are near their limit, their skills only partly match, nobody was really free. Null if the pick is genuinely clean. Do not manufacture a concern.
- "alternatives" is at most two others worth considering, each with a short reason. Leave it empty if there is only one sensible choice.
- You do not know about holidays, sick days, vehicles or who gets on with which customer. The dispatcher does. Recommend, do not insist.`;

  const user = `Job #${job.number} for ${job.customer.name}
Service: ${job.serviceType?.name ?? "not specified"}${job.serviceType ? ` (about ${job.serviceType.defaultDurationMinutes} minutes)` : ""}
Problem: ${job.title}
${job.description ? `Detail: ${job.description}` : ""}
Priority: ${job.priority}
When: ${day ? `booked for ${day}` : "not scheduled yet"}
Where: ${[job.addressLine, job.city].filter(Boolean).join(", ") || "not given"}

Candidates:
${candidates
  .map(
    (candidate) =>
      `- id: ${candidate.id}
  name: ${candidate.name} (${candidate.role.toLowerCase()})
  skills: ${candidate.skills.length ? candidate.skills.join(", ") : "none recorded"}
  available for new work: ${candidate.isAvailable ? "yes" : "NO"}
  jobs already booked that day: ${candidate.jobsThatDay} of a ${candidate.maxJobsPerDay} limit
  has completed this service before: ${candidate.doneThisService} times
  has worked for this customer before: ${candidate.doneForThisCustomer} times`,
  )
  .join("\n")}

Who should take it?`;

  const result = await ask({
    organizationId: input.organizationId,
    feature: "TECHNICIAN_RECOMMENDATION",
    cachedSystem,
    user,
    schema,
  });

  if (!result.ok) return result;

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate.name]));

  return {
    ...result,
    data: {
      membershipId: result.data.membershipId,
      name: byId.get(result.data.membershipId) ?? "Unknown",
      rationale: result.data.rationale,
      concern: result.data.concern,
      alternatives: result.data.alternatives.map((alternative) => ({
        membershipId: alternative.membershipId,
        name: byId.get(alternative.membershipId) ?? "Unknown",
        why: alternative.why,
      })),
    },
  };
}
