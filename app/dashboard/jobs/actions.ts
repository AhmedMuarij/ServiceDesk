"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { invalid, toActionState, type ActionState } from "@/lib/actions";
import { addJobNote, changeJobStatus, createJob, updateJob } from "@/lib/db/jobs";
import { getOrgSettings } from "@/lib/db/organization";
import { requireRole } from "@/lib/db/scope";
import { fromInputParts } from "@/lib/dates";
import { jobNoteSchema, jobSchema, jobStatusSchema } from "@/lib/validation/job";
import type { JobInput } from "@/lib/validation/job";

/** Form gives a date and a time in org-local terms; storage is UTC. */
async function resolveSchedule(input: JobInput) {
  const { timezone } = await getOrgSettings();
  const start = input.scheduledDate
    ? fromInputParts(input.scheduledDate, input.scheduledTime ?? "09:00", timezone)
    : null;
  const end =
    start && input.durationMinutes
      ? new Date(start.getTime() + input.durationMinutes * 60_000)
      : null;
  return { start, end };
}

export async function createJobAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = jobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  let id: string;
  try {
    await requireRole("MANAGER");
    const { start, end } = await resolveSchedule(parsed.data);
    const job = await createJob({
      ...parsed.data,
      scheduledStart: start,
      scheduledEnd: end,
    });
    id = job.id;
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard/schedule");
  redirect(`/dashboard/jobs/${id}`);
}

export async function updateJobAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing job." };

  const parsed = jobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await requireRole("MANAGER");
    const { start, end } = await resolveSchedule(parsed.data);
    await updateJob(id, { ...parsed.data, scheduledStart: start, scheduledEnd: end });
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath(`/dashboard/jobs/${id}`);
  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard/schedule");
  redirect(`/dashboard/jobs/${id}`);
}

export async function changeJobStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = jobStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    // Role is checked inside assertTransition — a technician may legitimately
    // start and complete their own job.
    await changeJobStatus(parsed.data.id, parsed.data.status, parsed.data.note);
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath(`/dashboard/jobs/${parsed.data.id}`);
  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/my/jobs");
  return { success: "Job updated." };
}

export async function addJobNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = jobNoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await addJobNote(parsed.data.jobId, parsed.data.body);
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath(`/dashboard/jobs/${parsed.data.jobId}`);
  revalidatePath(`/my/jobs/${parsed.data.jobId}`);
  return { success: "Note added." };
}
