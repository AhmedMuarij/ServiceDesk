"use server";

import { revalidatePath } from "next/cache";

import { AI_MODEL } from "@/lib/ai/config";
import { summariseJob } from "@/lib/ai/features/summarise-job";
import { acceptSuggestion, createSuggestion, rejectSuggestion } from "@/lib/db/ai";
import { setJobSummary } from "@/lib/db/jobs";
import { requireRole } from "@/lib/db/scope";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/errors";

export type SummarySuggestion = {
  id: string;
  summary: string;
  workDone: string[];
  followUp: string | null;
  groundedIn: string[];
};

export type SummaryResult =
  | { ok: true; suggestion: SummarySuggestion }
  | { ok: false; kind: "unavailable" | "error"; message: string };

export async function suggestSummaryAction(input: {
  jobId: string;
}): Promise<SummaryResult> {
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
    result = await summariseJob({ organizationId: orgId, jobId: input.jobId });
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
    feature: "JOB_SUMMARY",
    jobId: input.jobId,
    payload: {
      summary: result.data.summary,
      workDone: result.data.workDone,
      followUp: result.data.followUp,
      groundedIn: result.data.groundedIn,
    },
    rationale: `Grounded in ${result.data.groundedIn.length} note fragment${result.data.groundedIn.length === 1 ? "" : "s"}.`,
    model: AI_MODEL,
  });

  return {
    ok: true,
    suggestion: { id: suggestion.id, ...result.data },
  };
}

/**
 * Accepting writes the summary to the job. The text passed here is what the
 * reviewer actually saw and may have edited — not the model's original — so a
 * corrected summary is what gets stored.
 */
export async function acceptSummaryAction(input: {
  id: string;
  jobId: string;
  summary: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireRole("MANAGER");
    await acceptSuggestion(input.id);
    await setJobSummary(input.jobId, input.summary.trim() || null);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { ok: false, message: "That suggestion is no longer pending." };
    }
    return { ok: false, message: "Couldn't save that." };
  }

  revalidatePath(`/dashboard/jobs/${input.jobId}`);
  return { ok: true };
}

export async function dismissSummaryAction(input: { id: string }): Promise<{ ok: boolean }> {
  try {
    await requireRole("MANAGER");
    await rejectSuggestion(input.id);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function clearSummaryAction(formData: FormData): Promise<void> {
  const jobId = formData.get("jobId");
  if (typeof jobId !== "string" || !jobId) return;
  await requireRole("MANAGER");
  await setJobSummary(jobId, null);
  revalidatePath(`/dashboard/jobs/${jobId}`);
}
