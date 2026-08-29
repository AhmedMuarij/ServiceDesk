import { z } from "zod";

import { ask, type AiResult } from "@/lib/ai/client";
import { AI_MODEL } from "@/lib/ai/config";
import { prisma } from "@/lib/db/prisma";

/**
 * Reads what the customer described and proposes a service type, a priority
 * and a short job title.
 *
 * The service-type enum is built from the organization's own catalog, so the
 * model cannot return something that doesn't exist — the constraint is in the
 * schema, not in a "please only use these" instruction it might ignore.
 */

const NONE = "__none__";

export type Classification = {
  serviceTypeId: string | null;
  serviceTypeName: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  title: string;
  rationale: string;
};

const PRIORITY_GUIDANCE = `Priority means how soon someone must attend, not how annoyed the customer sounds:
- URGENT: a safety risk, active water or electrical damage, or no cooling at all in extreme heat, especially for an elderly or infant household.
- HIGH: the unit is unusable or a business is losing trade, but nobody is in danger.
- MEDIUM: degraded but working, or a normal booked repair. This is the default and most jobs are this.
- LOW: cosmetic, routine servicing, or the customer explicitly said there's no rush.`;

/** The stable, per-tenant half of the prompt — the part worth caching. */
export async function orgContext(organizationId: string): Promise<string> {
  const [org, services] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, city: true, country: true },
    }),
    prisma.serviceType.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { name: true, defaultDurationMinutes: true },
    }),
  ]);

  const catalog = services.length
    ? services
        .map((s) => `- ${s.name} (usually ${s.defaultDurationMinutes} minutes)`)
        .join("\n")
    : "- (no services configured yet)";

  return `You are helping dispatchers at ${org?.name ?? "a field service business"}${
    org?.city ? ` in ${org.city}` : ""
  }, a small service company. They take repair requests by phone and WhatsApp, often in a mix of English and Urdu, and often garbled or very short.

The services this business offers:
${catalog}

${PRIORITY_GUIDANCE}

Rules:
- Pick the single service that best matches. If none of them genuinely fit, say so rather than forcing the closest one.
- A fault in a unit's controls or accessories — remote, thermostat, the wiring to it — is still a repair of that unit. Reserve "none of these fit" for appliances this business does not service at all, like a fridge or a washing machine.
- The title is what a technician reads first on their phone. Make it a concrete description of the fault in under 60 characters. Not a category — "AC not cooling, bedroom unit" rather than "AC Repair".
- Do not invent detail the customer did not give. If they said very little, your title should be equally modest.
- The rationale is one short sentence for the dispatcher, explaining the priority in particular.`;
}

export async function classifyJob(input: {
  organizationId: string;
  description: string;
}): Promise<AiResult<Classification>> {
  const services = await prisma.serviceType.findMany({
    where: { organizationId: input.organizationId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const names = services.map((service) => service.name);
  // z.enum needs a non-empty tuple. NONE goes first so the type is
  // [string, ...string[]] without a cast, and it gives the model a way out
  // when none of the org's services genuinely fit.
  const options: [string, ...string[]] = [NONE, ...names];

  const schema = z.object({
    serviceType: z.enum(options),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    title: z.string().min(1).max(80),
    rationale: z.string().min(1).max(300),
  });

  const result = await ask({
    organizationId: input.organizationId,
    feature: "JOB_CLASSIFICATION",
    cachedSystem: await orgContext(input.organizationId),
    user: `A customer described their problem like this:\n\n"""\n${input.description.trim()}\n"""\n\nClassify it.`,
    schema,
    effort: "low",
  });

  if (!result.ok) return result;

  const matched = services.find((service) => service.name === result.data.serviceType);

  return {
    ...result,
    data: {
      serviceTypeId: matched?.id ?? null,
      serviceTypeName: matched?.name ?? null,
      priority: result.data.priority,
      title: result.data.title,
      rationale: result.data.rationale,
    },
  };
}

export const CLASSIFICATION_MODEL = AI_MODEL;
