"use client";

import { useActionState } from "react";

import { FormError, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState, type ActionState } from "@/lib/action-state";

export type JobNote = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
};

export function JobNotes({
  action,
  jobId,
  notes,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  jobId: string;
  notes: JobNote[];
}) {
  const [state, formAction] = useActionState(action, emptyState);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="jobId" value={jobId} />
        <FormError message={state.error} />
        <Textarea
          name="body"
          rows={3}
          placeholder="What you found, what you did, what's still outstanding."
          aria-label="Add a note"
          required
        />
        <div>
          <SubmitButton size="sm" pendingLabel="Adding…">
            Add note
          </SubmitButton>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-neutral-500">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <p className="text-sm whitespace-pre-wrap">{note.body}</p>
              <p className="mt-1.5 font-mono text-[0.65rem] tracking-wide text-neutral-500 uppercase">
                {note.authorName} · {note.createdAt}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
