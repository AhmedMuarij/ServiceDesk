import { z } from "zod";

import { ask, type AiResult } from "@/lib/ai/client";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";

/**
 * Turns a technician's rough notes into something the office would be happy to
 * send the customer.
 *
 * The hard part is not writing prose — it is not inventing any. A technician
 * writes "checked gas, topped up, cooling ok now"; the failure mode is a model
 * that produces a confident paragraph about parts that were never replaced.
 * The prompt is mostly about that, and `groundedIn` makes the model list what
 * it relied on so a reviewer can check it in one glance.
 */

export type JobSummary = {
  summary: string;
  workDone: string[];
  followUp: string | null;
  groundedIn: string[];
};

const schema = z.object({
  summary: z.string().min(1).max(700),
  workDone: z.array(z.string().min(1).max(160)).min(1).max(6),
  followUp: z.string().max(300).nullable(),
  groundedIn: z.array(z.string().min(1).max(200)).min(1).max(8),
});

export async function summariseJob(input: {
  organizationId: string;
  jobId: string;
}): Promise<AiResult<JobSummary>> {
  const job = await prisma.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: {
      number: true,
      title: true,
      description: true,
      completedAt: true,
      serviceType: { select: { name: true } },
      customer: { select: { name: true } },
      assignedTo: { select: { user: { select: { name: true } } } },
      notes: {
        orderBy: { createdAt: "asc" },
        select: {
          body: true,
          createdAt: true,
          author: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!job) throw new NotFoundError("Job not found");

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { name: true },
  });

  const notes = job.notes.length
    ? job.notes
        .map((note) => `- ${note.author?.user?.name ?? "technician"}: ${note.body}`)
        .join("\n")
    : "(the technician left no notes)";

  const cachedSystem = `You write short service summaries for ${org?.name ?? "a field service business"}, to be read by the customer who paid for the work.

How to write:
- Plain, warm, factual. No marketing language, no "we are pleased to inform you".
- Address what the customer originally complained about, and say whether it is resolved.
- Explain any technical term in the same breath, or leave it out.
- Six sentences at the very most. Most jobs need two or three.

The one rule that matters:
- Use only what is in the technician's notes and the job record. Do not add parts, measurements, causes, timings or guarantees that are not written there.
- If the notes are thin, write a short summary. A thin summary is correct; an invented one is not.
- List in "groundedIn" the exact fragments of the notes you relied on. If you cannot ground a claim in a fragment, remove the claim.
- "followUp" is for anything in the notes that is not finished: a fault the technician noticed but did not fix, something they told the customer to keep an eye on, a part on order, or a revisit they recommended. A worn part described as "not urgent for now" still belongs here — that is precisely a thing to come back to.
- If the notes genuinely flag nothing outstanding, "followUp" is null. Do not invent a maintenance suggestion to fill the field.`;

  const user = `Job #${job.number} for ${job.customer.name}.
Service: ${job.serviceType?.name ?? "not specified"}
Reported problem: ${job.title}
${job.description ? `Detail given at intake: ${job.description}` : ""}
Technician: ${job.assignedTo?.user?.name ?? "unknown"}

Technician's notes:
${notes}

Write the customer-facing summary.`;

  return ask({
    organizationId: input.organizationId,
    feature: "JOB_SUMMARY",
    cachedSystem,
    user,
    schema,
  });
}
