"use client";

import { useState, useTransition } from "react";

import {
  acceptSummaryAction,
  dismissSummaryAction,
  suggestSummaryAction,
  type SummarySuggestion,
} from "@/app/dashboard/jobs/summary-actions";
import { Badge, Button, Textarea } from "@/components/ui/primitives";

/**
 * Drafts the customer-facing summary from the technician's notes.
 *
 * The draft is editable before it is saved, and the note fragments the model
 * leaned on are shown alongside — reviewing generated text you cannot check is
 * just a slower way of trusting it.
 */
export function SummaryPanel({
  jobId,
  hasNotes,
  existingSummary,
}: {
  jobId: string;
  hasNotes: boolean;
  existingSummary: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<SummarySuggestion | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "quiet" | "error" } | null>(
    null,
  );
  const [showGrounding, setShowGrounding] = useState(false);

  const run = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await suggestSummaryAction({ jobId });
      if (result.ok) {
        setSuggestion(result.suggestion);
        setDraft(result.suggestion.summary);
      } else {
        setSuggestion(null);
        setMessage({
          text: result.message,
          tone: result.kind === "unavailable" ? "quiet" : "error",
        });
      }
    });
  };

  const save = () => {
    if (!suggestion) return;
    startTransition(async () => {
      const result = await acceptSummaryAction({
        id: suggestion.id,
        jobId,
        summary: draft,
      });
      if (result.ok) {
        setSuggestion(null);
        setMessage({ text: "Saved to the job.", tone: "quiet" });
      } else {
        setMessage({ text: result.message ?? "Couldn't save that.", tone: "error" });
      }
    });
  };

  const dismiss = () => {
    const current = suggestion;
    setSuggestion(null);
    if (current) void dismissSummaryAction({ id: current.id });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={run}
          disabled={pending || !hasNotes}
        >
          {pending ? "Reading the notes…" : existingSummary ? "Draft again" : "Draft summary from notes"}
        </Button>
        <span className="text-xs text-neutral-500">
          {hasNotes
            ? "Writes a customer-facing account from what the technician wrote."
            : "Needs at least one technician note to work from."}
        </span>
      </div>

      {message ? (
        <p
          className={
            message.tone === "error"
              ? "text-xs text-red-600 dark:text-red-400"
              : "text-xs text-neutral-500"
          }
        >
          {message.text}
        </p>
      ) : null}

      {suggestion ? (
        <div className="flex flex-col gap-3 rounded-md border border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="teal">Draft</Badge>
            <span className="text-xs text-neutral-500">
              Edit anything before you save it.
            </span>
          </div>

          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={5}
            aria-label="Customer-facing summary"
          />

          {suggestion.workDone.length ? (
            <div>
              <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
                Work done
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {suggestion.workDone.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {suggestion.followUp ? (
            <div>
              <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
                Follow-up
              </p>
              <p className="mt-1 text-sm">{suggestion.followUp}</p>
            </div>
          ) : null}

          <div>
            <button
              type="button"
              onClick={() => setShowGrounding((open) => !open)}
              className="text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {showGrounding ? "Hide" : "Show"} what this was based on (
              {suggestion.groundedIn.length})
            </button>
            {showGrounding ? (
              <ul className="mt-2 flex flex-col gap-1 border-l-2 border-neutral-300 pl-3 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                {suggestion.groundedIn.map((fragment) => (
                  <li key={fragment}>&ldquo;{fragment}&rdquo;</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={save} disabled={pending || !draft.trim()}>
              {pending ? "Saving…" : "Save to job"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
