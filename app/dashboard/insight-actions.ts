"use server";

import { AI_MODEL } from "@/lib/ai/config";
import { weeklyInsight, type WeekNumbers } from "@/lib/ai/features/weekly-insight";
import { createSuggestion } from "@/lib/db/ai";
import { requireRole } from "@/lib/db/scope";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export type Insight = {
  headline: string;
  observations: string[];
  watchOut: string | null;
  numbers: WeekNumbers;
};

export type InsightResult =
  | { ok: true; insight: Insight }
  | { ok: false; kind: "unavailable" | "error"; message: string };

export async function generateInsightAction(): Promise<InsightResult> {
  let orgId: string;
  try {
    ({ orgId } = await requireRole("MANAGER"));
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return { ok: false, kind: "error", message: "You can't do that." };
    }
    throw error;
  }

  const result = await weeklyInsight({ organizationId: orgId });

  if (!result.ok) {
    const unavailable =
      result.reason === "no_key" ||
      result.reason === "org_disabled" ||
      result.reason === "feature_disabled" ||
      result.reason === "over_budget" ||
      result.reason === "rate_limited";
    return {
      ok: false,
      kind: unavailable ? "unavailable" : "error",
      message: result.message,
    };
  }

  // Recorded for the audit trail even though there is nothing to apply — an
  // insight is read, not accepted. Keeping it here means every model output in
  // the system has a row, with no exceptions to reason about.
  await createSuggestion({
    feature: "BUSINESS_INSIGHT",
    payload: {
      headline: result.data.headline,
      observations: result.data.observations,
      watchOut: result.data.watchOut,
      weekFrom: result.data.numbers.from,
      weekTo: result.data.numbers.to,
    },
    rationale: result.data.headline,
    model: AI_MODEL,
  });

  return { ok: true, insight: result.data };
}
