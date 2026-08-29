import { atLeast } from "@/lib/roles";
import type { JobStatus, Role } from "@prisma/client";

/**
 * The single definition of what a job may do. Every status change goes through
 * assertTransition — the UI hides illegal buttons, but this is what actually
 * enforces it. See docs/02-screens-and-flows.md.
 */

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

export const TERMINAL: JobStatus[] = ["COMPLETED", "CANCELLED"];

const ALLOWED: Record<JobStatus, JobStatus[]> = {
  NEW: ["SCHEDULED", "ASSIGNED", "CANCELLED"],
  SCHEDULED: ["NEW", "ASSIGNED", "CANCELLED"],
  ASSIGNED: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function allowedTransitions(from: JobStatus): JobStatus[] {
  return ALLOWED[from];
}

export type TransitionContext = {
  role: Role;
  /** Is the person making the change the technician assigned to this job? */
  isAssignee: boolean;
  hasSchedule: boolean;
  hasAssignee: boolean;
};

export function assertTransition(
  from: JobStatus,
  to: JobStatus,
  context: TransitionContext,
): void {
  if (from === to) return;

  if (TERMINAL.includes(from)) {
    throw new TransitionError(
      from === "COMPLETED"
        ? "A completed job can't be reopened. Raise a new job instead."
        : "A cancelled job can't be changed.",
    );
  }

  if (!ALLOWED[from].includes(to)) {
    throw new TransitionError(`A job can't go from ${label(from)} to ${label(to)}.`);
  }

  // Facts the target status implies about the job.
  if ((to === "SCHEDULED" || to === "ASSIGNED") && !context.hasSchedule) {
    throw new TransitionError("Give the job a date and time first.");
  }
  if (to === "ASSIGNED" && !context.hasAssignee) {
    throw new TransitionError("Assign a technician first.");
  }
  if (to === "IN_PROGRESS" && !context.hasAssignee) {
    throw new TransitionError("A job can't start without an assigned technician.");
  }

  // Who may make the change.
  const manages = atLeast(context.role, "MANAGER");
  if (to === "IN_PROGRESS" || to === "COMPLETED") {
    if (!manages && !context.isAssignee) {
      throw new TransitionError("Only the assigned technician can update this job.");
    }
    return;
  }
  if (!manages) {
    throw new TransitionError("Only a manager can change a job's schedule or assignment.");
  }
}

/**
 * Status is a function of two independent facts — does it have a time, does it
 * have a technician — for every stage before work starts. Once a job is in
 * progress or finished, editing its schedule must not drag it backwards.
 */
export function deriveStatus(
  current: JobStatus,
  hasSchedule: boolean,
  hasAssignee: boolean,
): JobStatus {
  if (current === "IN_PROGRESS" || TERMINAL.includes(current)) return current;
  if (hasSchedule && hasAssignee) return "ASSIGNED";
  if (hasSchedule) return "SCHEDULED";
  return "NEW";
}

function label(status: JobStatus): string {
  return status.toLowerCase().replace("_", " ");
}
