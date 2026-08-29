import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import type { AiFeature } from "@prisma/client";

import { AI_MODEL, RATE_LIMIT_PER_MINUTE, costMicros } from "./config";

/**
 * The only place in this app that talks to an AI provider.
 *
 * Two guarantees, both load-bearing:
 *  1. It never throws. Every failure — no key, disabled, over budget, rate
 *     limited, API down, malformed output — comes back as a value the caller
 *     can ignore. An optional subsystem must never break the core workflow.
 *  2. Every call is metered and logged before the caller sees the result.
 *
 * Provider is Google Gemini (free tier). Nothing outside this file imports a
 * provider SDK, so switching is a rewrite of this one module — `ask()`'s
 * signature is the contract. See docs/05-module-2-scope.md.
 */

export type AiUnavailableReason =
  | "no_key"
  | "org_disabled"
  | "feature_disabled"
  | "over_budget"
  | "rate_limited";

export type AiFailureReason = AiUnavailableReason | "refused" | "invalid_output" | "error";

export type AiResult<T> =
  | {
      ok: true;
      data: T;
      costMicros: number;
      latencyMs: number;
      cacheReadTokens: number;
    }
  | {
      ok: false;
      reason: AiFailureReason;
      message: string;
      /** Present on rate limits when the provider tells us how long to wait. */
      retryAfterMs?: number;
    };

/* --------------------------------------------------------------- client */

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

const globalForGenAI = globalThis as unknown as { genai?: GoogleGenAI | null };

function getClient(): GoogleGenAI | null {
  if (globalForGenAI.genai === undefined) {
    const key = apiKey();
    globalForGenAI.genai = key ? new GoogleGenAI({ apiKey: key }) : null;
  }
  return globalForGenAI.genai;
}

export function hasApiKey(): boolean {
  return Boolean(apiKey());
}

/* ---------------------------------------------------------- availability */

export type Availability =
  | { available: true; spentMicros: number; capMicros: number }
  | { available: false; reason: AiUnavailableReason; message: string };

/** Start of the current calendar month, UTC. Spend caps reset here. */
function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function spentThisMonth(organizationId: string): Promise<number> {
  const result = await prisma.aiUsageLog.aggregate({
    where: { organizationId, createdAt: { gte: monthStart() } },
    _sum: { costMicros: true },
  });
  return result._sum.costMicros ?? 0;
}

/**
 * Checked before every call, and also used by the UI to decide whether to
 * offer an AI affordance at all — so a disabled org sees no dead buttons.
 */
export async function checkAvailability(
  organizationId: string,
  feature: AiFeature,
): Promise<Availability> {
  if (!hasApiKey()) {
    return {
      available: false,
      reason: "no_key",
      message: "AI features need a GEMINI_API_KEY on the server.",
    };
  }

  const [org, setting] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { aiEnabled: true, aiMonthlySpendCapMicros: true },
    }),
    prisma.aiFeatureSetting.findUnique({
      where: { organizationId_feature: { organizationId, feature } },
      select: { enabled: true },
    }),
  ]);

  if (!org?.aiEnabled) {
    return {
      available: false,
      reason: "org_disabled",
      message: "AI is switched off for this workspace.",
    };
  }
  // No row means the org predates the feature; default to on.
  if (setting && !setting.enabled) {
    return {
      available: false,
      reason: "feature_disabled",
      message: "This AI feature is switched off in settings.",
    };
  }

  // On the free tier the rates are zero, so this never trips — it stays wired
  // up so enabling paid billing needs no code change.
  const spentMicros = await spentThisMonth(organizationId);
  if (org.aiMonthlySpendCapMicros > 0 && spentMicros >= org.aiMonthlySpendCapMicros) {
    return {
      available: false,
      reason: "over_budget",
      message: "This month's AI spending cap has been reached.",
    };
  }

  return { available: true, spentMicros, capMicros: org.aiMonthlySpendCapMicros };
}

async function withinRateLimit(organizationId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000);
  const recent = await prisma.aiUsageLog.count({
    where: {
      organizationId,
      createdAt: { gte: since },
      // Attempts the provider already refused do not count against our own
      // budget. Counting them would mean being throttled makes us throttle
      // ourselves harder — a feedback loop that never clears.
      NOT: { error: { contains: "RESOURCE_EXHAUSTED" } },
    },
  });
  return recent < RATE_LIMIT_PER_MINUTE;
}

/* ------------------------------------------------------------------ call */

export type AskOptions<T extends z.ZodType> = {
  organizationId: string;
  feature: AiFeature;
  /** Stable per tenant. Sent as the system instruction. */
  cachedSystem?: string;
  /** Varies per request. */
  system?: string;
  user: string;
  schema: T;
  /** Kept for provider portability; Gemini Flash has no effort dial. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
};

export async function ask<T extends z.ZodType>(
  options: AskOptions<T>,
): Promise<AiResult<z.infer<T>>> {
  const {
    organizationId,
    feature,
    cachedSystem,
    system,
    user,
    schema,
    maxTokens = 2048,
  } = options;

  const availability = await checkAvailability(organizationId, feature);
  if (!availability.available) {
    return { ok: false, reason: availability.reason, message: availability.message };
  }

  if (!(await withinRateLimit(organizationId))) {
    return {
      ok: false,
      reason: "rate_limited",
      message: "Too many AI requests just now. Try again in a minute.",
    };
  }

  const client = getClient();
  if (!client) {
    return { ok: false, reason: "no_key", message: "AI is not configured." };
  }

  const systemInstruction = [cachedSystem, system].filter(Boolean).join("\n\n");
  const startedAt = Date.now();

  try {
    // responseJsonSchema constrains the model to our shape; zod then validates
    // what actually came back. Belt and braces — a schema the provider honours
    // loosely is still not a guarantee.
    const response = await client.models.generateContent({
      model: AI_MODEL,
      contents: user,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(schema),
        maxOutputTokens: maxTokens,
        temperature: 0,
      },
    });

    const latencyMs = Date.now() - startedAt;
    const meta = response.usageMetadata;
    const usage = {
      inputTokens: meta?.promptTokenCount ?? 0,
      // Thinking tokens are billed as output where they are billed at all.
      outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
      cacheReadTokens: meta?.cachedContentTokenCount ?? 0,
      cacheWriteTokens: 0,
    };
    const cost = costMicros(usage);

    const text = response.text;
    if (!text) {
      const blocked = response.promptFeedback?.blockReason;
      await logUsage(
        organizationId,
        feature,
        usage,
        cost,
        latencyMs,
        false,
        blocked ? `blocked: ${blocked}` : "empty response",
      );
      return blocked
        ? { ok: false, reason: "refused", message: "The model declined this request." }
        : { ok: false, reason: "invalid_output", message: "The model returned nothing." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      await logUsage(organizationId, feature, usage, cost, latencyMs, false, "not JSON");
      return {
        ok: false,
        reason: "invalid_output",
        message: "The model's answer wasn't valid JSON.",
      };
    }

    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      await logUsage(
        organizationId,
        feature,
        usage,
        cost,
        latencyMs,
        false,
        `schema mismatch: ${validated.error.issues[0]?.message ?? "unknown"}`,
      );
      return {
        ok: false,
        reason: "invalid_output",
        message: "The model's answer didn't match the expected shape.",
      };
    }

    await logUsage(organizationId, feature, usage, cost, latencyMs, true);

    return {
      ok: true,
      data: validated.data as z.infer<T>,
      costMicros: cost,
      latencyMs,
      cacheReadTokens: usage.cacheReadTokens,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);

    // Log the failure too — a run of errors should be visible in settings,
    // not just in a server log nobody reads.
    await logUsage(
      organizationId,
      feature,
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      0,
      latencyMs,
      false,
      message.slice(0, 500),
    );

    // A free-tier quota trip is a rate limit, not a fault. Google tells us
    // how long to wait; pass it on rather than making callers guess.
    const rateLimited = /429|quota|rate limit|RESOURCE_EXHAUSTED/i.test(message);
    const retryHint = message.match(/retry in ([d.]+)s/i)?.[1];
    return {
      ok: false,
      reason: rateLimited ? "rate_limited" : "error",
      message: rateLimited
        ? "The free-tier limit has been hit. Try again in a minute."
        : message,
      ...(retryHint ? { retryAfterMs: Math.ceil(Number(retryHint) * 1000) + 1000 } : {}),
    };
  }
}

async function logUsage(
  organizationId: string,
  feature: AiFeature,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  },
  cost: number,
  latencyMs: number,
  ok: boolean,
  error?: string,
): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        organizationId,
        feature,
        model: AI_MODEL,
        ...usage,
        costMicros: cost,
        latencyMs,
        ok,
        error: error ?? null,
      },
    });
  } catch (loggingError) {
    // Never let bookkeeping break the caller.
    console.error("ai: failed to log usage", loggingError);
  }
}
