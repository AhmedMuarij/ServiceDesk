import type { AiFeature } from "@prisma/client";

/**
 * Provider: Google Gemini, on the free tier.
 *
 * Chosen because it has a genuine free tier — no card, no credit — which is
 * what this project needs. The provider lives behind `ask()` in ./client.ts
 * and nothing else in the app imports an SDK, so swapping back to Claude (or
 * anywhere else) is one file.
 *
 * Override the model with GEMINI_MODEL. `npm run ai:models` lists what your
 * key can actually reach.
 */
export const AI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export const AI_PROVIDER = "Google Gemini";

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  JOB_CLASSIFICATION: "Job classification",
  JOB_SUMMARY: "Job summary",
  TECHNICIAN_RECOMMENDATION: "Technician recommendation",
  INVOICE_DRAFT: "Invoice draft",
  BUSINESS_INSIGHT: "Weekly insight",
};

export const AI_FEATURE_DESCRIPTION: Record<AiFeature, string> = {
  JOB_CLASSIFICATION:
    "Reads what the customer described and suggests a service type and priority.",
  JOB_SUMMARY:
    "Turns a technician's notes into a summary you'd be happy to send the customer.",
  TECHNICIAN_RECOMMENDATION:
    "Suggests who should take a job, based on skills, workload and history.",
  INVOICE_DRAFT: "Drafts invoice lines from what was actually done on the job.",
  BUSINESS_INSIGHT: "Writes a short read of last week's numbers.",
};

export const AI_FEATURES: AiFeature[] = [
  "JOB_CLASSIFICATION",
  "JOB_SUMMARY",
  "TECHNICIAN_RECOMMENDATION",
  "INVOICE_DRAFT",
  "BUSINESS_INSIGHT",
];

/**
 * Micro-dollars (1e-6 USD) per token.
 *
 * Zero on the free tier — that is the honest number, and showing an imaginary
 * cost would be worse than showing none. If you later enable paid billing in
 * Google AI Studio, put the real rates here and the spend cap starts biting.
 * Tokens are logged either way, so usage stays visible.
 */
export const RATE_MICROS_PER_TOKEN = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;

export const IS_FREE_TIER =
  RATE_MICROS_PER_TOKEN.input === 0 && RATE_MICROS_PER_TOKEN.output === 0;

/**
 * On a free tier the real guardrail is requests per minute, not dollars.
 * Measured against Gemini free tier: 20 requests on a short rolling window,
 * counted per model. 15 sits under that while still catching a runaway loop.
 */
export const RATE_LIMIT_PER_MINUTE = Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 15);

export function costMicros(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): number {
  return Math.round(
    usage.inputTokens * RATE_MICROS_PER_TOKEN.input +
      usage.outputTokens * RATE_MICROS_PER_TOKEN.output +
      (usage.cacheReadTokens ?? 0) * RATE_MICROS_PER_TOKEN.cacheRead +
      (usage.cacheWriteTokens ?? 0) * RATE_MICROS_PER_TOKEN.cacheWrite,
  );
}

/** Micro-dollars as a human-readable amount. */
export function formatMicros(micros: number): string {
  if (IS_FREE_TIER) return "free";
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0.00";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}
