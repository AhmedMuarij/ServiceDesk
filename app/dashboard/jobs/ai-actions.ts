"use server";

import { revalidatePath } from "next/cache";

import { classifyJob } from "@/lib/ai/features/classify-job";
import { AI_MODEL } from "@/lib/ai/config";
import { createSuggestion, rejectSuggestion } from "@/lib/db/ai";
import { requireRole } from "@/lib/db/scope";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export type ClassifySuggestion = {
  id: string;
  serviceTypeId: string | null;
  serviceTypeName: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  title: string;
  rationale: string;
};

export type ClassifyResult =
  | { ok: true; suggestion: ClassifySuggestion }
  /** Expected and undramatic: no key, switched off, over budget, rate limited. */
  | { ok: false; kind: "unavailable"; message: string }
  | { ok: false; kind: "error"; message: string };

const MIN_DESCRIPTION = 12;

export async function suggestClassificationAction(input: {
  description: string;
  jobId?: string;
}): Promise<ClassifyResult> {
  let orgId: string;
  try {
    ({ orgId } = await requireRole("MANAGER"));
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return { ok: false, kind: "error", message: "You can't do that." };
    }
    throw error;
  }

  const description = input.description.trim();
  if (description.length < MIN_DESCRIPTION) {
    return {
      ok: false,
      kind: "error",
      message: "Write a bit more about the problem first.",
    };
  }

  const result = await classifyJob({ organizationId: orgId, description });

  if (!result.ok) {
    // Everything except a genuine API fault is a normal, quiet outcome.
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

  const suggestion = await createSuggestion({
    feature: "JOB_CLASSIFICATION",
    jobId: input.jobId,
    payload: {
      serviceTypeId: result.data.serviceTypeId,
      serviceTypeName: result.data.serviceTypeName,
      priority: result.data.priority,
      title: result.data.title,
      sourceDescription: description,
    },
    rationale: result.data.rationale,
    model: AI_MODEL,
  });

  return {
    ok: true,
    suggestion: {
      id: suggestion.id,
      serviceTypeId: result.data.serviceTypeId,
      serviceTypeName: result.data.serviceTypeName,
      priority: result.data.priority,
      title: result.data.title,
      rationale: result.data.rationale,
    },
  };
}

/**
 * Accepting is recorded here, but the values are applied by the job form the
 * user then submits — so the write still goes through createJob/updateJob with
 * all of its validation. The model never gets a write path of its own.
 */
export async function decideSuggestionAction(input: {
  id: string;
  accept: boolean;
}): Promise<{ ok: boolean }> {
  try {
    await requireRole("MANAGER");
    if (input.accept) {
      const { acceptSuggestion } = await import("@/lib/db/ai");
      await acceptSuggestion(input.id);
    } else {
      await rejectSuggestion(input.id);
    }
    revalidatePath("/dashboard/settings/ai");
    return { ok: true };
  } catch {
    // A stale suggestion is not worth an error in the user's face.
    return { ok: false };
  }
}
