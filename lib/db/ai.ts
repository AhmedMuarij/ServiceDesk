import { NotFoundError } from "@/lib/errors";
import { AI_FEATURES } from "@/lib/ai/config";
import type { AiFeature, Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { getScope } from "./scope";

/**
 * Suggestions are the unit of trust in Module 2. A feature writes one, a human
 * decides, and only then does the *existing* Module 1 write path apply it.
 *
 * Note what acceptSuggestion does not do: it does not touch the job, the
 * invoice, or the assignment. It marks the suggestion accepted and hands the
 * payload back. Applying it goes through updateJob / updateDraftInvoice like
 * any other edit — same validation, same permissions, same history. The model
 * never gets a write path of its own.
 */

export async function createSuggestion(input: {
  feature: AiFeature;
  jobId?: string;
  invoiceId?: string;
  payload: Prisma.InputJsonObject;
  rationale?: string;
  model: string;
}) {
  const { orgId, membershipId } = await getScope();

  const target = input.jobId
    ? { jobId: input.jobId }
    : input.invoiceId
      ? { invoiceId: input.invoiceId }
      : null;

  return prisma.$transaction(async (tx) => {
    // A fresh suggestion replaces whatever was outstanding for the same
    // target, so a dispatcher never sees two competing proposals. Suggestions
    // made before the job exists have no target — they are audit records of
    // what was proposed for a piece of text, and supersede nothing.
    if (target) {
      await tx.aiSuggestion.updateMany({
        where: {
          organizationId: orgId,
          feature: input.feature,
          status: "PENDING",
          ...target,
        },
        data: { status: "SUPERSEDED" },
      });
    }

    return tx.aiSuggestion.create({
      data: {
        organizationId: orgId,
        feature: input.feature,
        jobId: input.jobId ?? null,
        invoiceId: input.invoiceId ?? null,
        payload: input.payload,
        rationale: input.rationale ?? null,
        model: input.model,
        requestedByMembershipId: membershipId,
      },
      select: { id: true, payload: true, rationale: true, createdAt: true },
    });
  });
}

export async function getPendingSuggestion(feature: AiFeature, jobId: string) {
  const { orgId } = await getScope();
  return prisma.aiSuggestion.findFirst({
    where: { organizationId: orgId, feature, jobId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      payload: true,
      rationale: true,
      model: true,
      createdAt: true,
    },
  });
}

export async function getSuggestion(id: string) {
  const { orgId } = await getScope();
  const suggestion = await prisma.aiSuggestion.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!suggestion) throw new NotFoundError("Suggestion not found");
  return suggestion;
}

/**
 * Marks it accepted and returns the payload. Applying it is the caller's job,
 * through the ordinary write path — see the note at the top of this file.
 */
export async function acceptSuggestion(id: string) {
  const { orgId, membershipId } = await getScope();

  const suggestion = await prisma.aiSuggestion.findFirst({
    where: { id, organizationId: orgId, status: "PENDING" },
    select: { id: true, feature: true, payload: true, jobId: true, invoiceId: true },
  });
  if (!suggestion) throw new NotFoundError("That suggestion is no longer pending");

  await prisma.aiSuggestion.update({
    where: { id },
    data: {
      status: "ACCEPTED",
      decidedByMembershipId: membershipId,
      decidedAt: new Date(),
    },
  });

  return suggestion;
}

export async function rejectSuggestion(id: string) {
  const { orgId, membershipId } = await getScope();
  const { count } = await prisma.aiSuggestion.updateMany({
    where: { id, organizationId: orgId, status: "PENDING" },
    data: {
      status: "REJECTED",
      decidedByMembershipId: membershipId,
      decidedAt: new Date(),
    },
  });
  if (count === 0) throw new NotFoundError("That suggestion is no longer pending");
}

/* ------------------------------------------------------------- settings */

export async function listAiSettings() {
  const { orgId } = await getScope();

  const [org, rows] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { aiEnabled: true, aiMonthlySpendCapMicros: true },
    }),
    prisma.aiFeatureSetting.findMany({ where: { organizationId: orgId } }),
  ]);

  const byFeature = new Map(rows.map((row) => [row.feature, row.enabled]));

  return {
    enabled: org?.aiEnabled ?? true,
    capMicros: org?.aiMonthlySpendCapMicros ?? 20_000_000,
    // Absent row means the org predates the feature; default to on.
    features: AI_FEATURES.map((feature) => ({
      feature,
      enabled: byFeature.get(feature) ?? true,
    })),
  };
}

export async function saveAiSettings(input: {
  enabled: boolean;
  capMicros: number;
  features: Array<{ feature: AiFeature; enabled: boolean }>;
}) {
  const { orgId } = await getScope();

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: orgId },
      data: { aiEnabled: input.enabled, aiMonthlySpendCapMicros: input.capMicros },
    }),
    ...input.features.map(({ feature, enabled }) =>
      prisma.aiFeatureSetting.upsert({
        where: { organizationId_feature: { organizationId: orgId, feature } },
        create: { organizationId: orgId, feature, enabled },
        update: { enabled },
      }),
    ),
  ]);
}

/* ---------------------------------------------------------------- usage */

export async function aiUsageSummary() {
  const { orgId } = await getScope();
  const from = new Date();
  from.setUTCDate(1);
  from.setUTCHours(0, 0, 0, 0);

  const [byFeature, totals, recent] = await Promise.all([
    prisma.aiUsageLog.groupBy({
      by: ["feature"],
      where: { organizationId: orgId, createdAt: { gte: from } },
      _sum: { costMicros: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.aiUsageLog.aggregate({
      where: { organizationId: orgId, createdAt: { gte: from } },
      _sum: { costMicros: true, cacheReadTokens: true },
      _count: { _all: true },
    }),
    prisma.aiUsageLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        feature: true,
        costMicros: true,
        latencyMs: true,
        ok: true,
        error: true,
        cacheReadTokens: true,
        createdAt: true,
      },
    }),
  ]);

  const failures = await prisma.aiUsageLog.count({
    where: { organizationId: orgId, createdAt: { gte: from }, ok: false },
  });

  return {
    monthStart: from,
    byFeature,
    totalMicros: totals._sum.costMicros ?? 0,
    totalCalls: totals._count._all,
    cacheReadTokens: totals._sum.cacheReadTokens ?? 0,
    failures,
    recent,
  };
}

/** Decision history, for the accuracy picture in settings. */
export async function suggestionStats() {
  const { orgId } = await getScope();
  const rows = await prisma.aiSuggestion.groupBy({
    by: ["feature", "status"],
    where: { organizationId: orgId },
    _count: { _all: true },
  });
  return rows;
}
