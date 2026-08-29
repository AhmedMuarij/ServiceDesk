"use client";

import { useActionState, useState } from "react";

import { Button, FormError, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState, type ActionState } from "@/lib/action-state";
import { JOB_STATUS_LABEL } from "@/lib/status";
import type { JobStatus } from "@prisma/client";

const VERB: Partial<Record<JobStatus, string>> = {
  SCHEDULED: "Mark scheduled",
  ASSIGNED: "Mark assigned",
  IN_PROGRESS: "Start job",
  COMPLETED: "Complete job",
  CANCELLED: "Cancel job",
  NEW: "Unschedule",
};

export function StatusActions({
  action,
  jobId,
  options,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  jobId: string;
  options: JobStatus[];
}) {
  const [state, formAction] = useActionState(action, emptyState);
  const [cancelling, setCancelling] = useState(false);

  if (options.length === 0) {
    return <FormError message={state.error} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <FormError message={state.error} />

      <div className="flex flex-wrap items-center gap-2">
        {options
          .filter((status) => status !== "CANCELLED")
          .map((status) => (
            <form key={status} action={formAction}>
              <input type="hidden" name="id" value={jobId} />
              <input type="hidden" name="status" value={status} />
              <SubmitButton
                variant={status === "COMPLETED" ? "primary" : "secondary"}
                pendingLabel="Updating…"
              >
                {VERB[status] ?? JOB_STATUS_LABEL[status]}
              </SubmitButton>
            </form>
          ))}

        {options.includes("CANCELLED") && !cancelling ? (
          <Button variant="danger" type="button" onClick={() => setCancelling(true)}>
            Cancel job
          </Button>
        ) : null}
      </div>

      {cancelling ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={jobId} />
          <input type="hidden" name="status" value="CANCELLED" />
          <div className="flex flex-col gap-1">
            <label htmlFor="note" className="text-xs text-neutral-500">
              Why is it being cancelled?
            </label>
            <Input
              id="note"
              name="note"
              className="w-72"
              placeholder="Customer rescheduled, duplicate job…"
              autoFocus
            />
          </div>
          <SubmitButton variant="danger" pendingLabel="Cancelling…">
            Confirm cancel
          </SubmitButton>
          <Button variant="ghost" type="button" onClick={() => setCancelling(false)}>
            Keep it
          </Button>
        </form>
      ) : null}
    </div>
  );
}
