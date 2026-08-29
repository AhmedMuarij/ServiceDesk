"use server";

import { revalidatePath } from "next/cache";

import { AI_MODEL } from "@/lib/ai/config";
import { recommendTechnician } from "@/lib/ai/features/recommend-technician";
import { acceptSuggestion, createSuggestion, rejectSuggestion } from "@/lib/db/ai";
import { assignTechnician } from "@/lib/db/jobs";
import { requireRole } from "@/lib/db/scope";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/errors";

export type TechnicianSuggestion = {
  id: string;
  membershipId: string;
  name: string;
  rationale: string;
  concern: string | null;
  alternatives: Array<{ membershipId: string; name: string; why: string }>;
};

export type RecommendResult =
  | { ok: true; suggestion: TechnicianSuggestion }
  | { ok: false; kind: "unavailable" | "error"; message: string };

export async function suggestTechnicianAction(input: {
  jobId: string;
}): Promise<RecommendResult> {
  let orgId: string;
  try {
    ({ orgId } = await requireRole("MANAGER"));
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return { ok: false, kind: "error", message: "You can't do that." };
    }
    throw error;
  }

  let result;
  try {
    result = await recommendTechnician({ organizationId: orgId, jobId: input.jobId });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { ok: false, kind: "error", message: "That job no longer exists." };
    }
    throw error;
  }

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

  const suggestion = await createSuggestion({
    feature: "TECHNICIAN_RECOMMENDATION",
    jobId: input.jobId,
    payload: {
      membershipId: result.data.membershipId,
      name: result.data.name,
      concern: result.data.concern,
      alternatives: result.data.alternatives,
    },
    rationale: result.data.rationale,
    model: AI_MODEL,
  });

  return { ok: true, suggestion: { id: suggestion.id, ...result.data } };
}

/**
 * Accepting assigns the technician through assignTechnician — the same path a
 * manual assignment takes, so the status recomputes, history is written and
 * the technician is emailed exactly as normal.
 *
 * `membershipId` is passed separately from the suggestion because the
 * dispatcher may have picked one of the alternatives instead of the top pick.
 */
export async function acceptTechnicianAction(input: {
  id: string;
  jobId: string;
  membershipId: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireRole("MANAGER");
    await acceptSuggestion(input.id);
    await assignTechnician(input.jobId, input.membershipId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { ok: false, message: "That suggestion is no longer pending." };
    }
    return { ok: false, message: "Couldn't assign that." };
  }

  revalidatePath(`/dashboard/jobs/${input.jobId}`);
  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard/schedule");
  return { ok: true };
}

export async function dismissTechnicianAction(input: { id: string }): Promise<{ ok: boolean }> {
  try {
    await requireRole("MANAGER");
    await rejectSuggestion(input.id);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
