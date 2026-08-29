"use client";

import { useState, useTransition } from "react";

import {
  decideSuggestionAction,
  suggestClassificationAction,
  type ClassifySuggestion,
} from "@/app/dashboard/jobs/ai-actions";
import { Badge, Button } from "@/components/ui/primitives";
import { PRIORITY_LABEL } from "@/lib/status";

/**
 * Sits under the description on the job form. Proposes a classification; the
 * dispatcher applies it or dismisses it. Nothing is written to the job here —
 * applying fills the form, and the ordinary submit does the writing.
 */
export function ClassifyPanel({
  description,
  jobId,
  onApply,
}: {
  description: string;
  jobId?: string;
  onApply: (suggestion: ClassifySuggestion) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<ClassifySuggestion | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "quiet" | "error" } | null>(
    null,
  );

  const run = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await suggestClassificationAction({ description, jobId });
      if (result.ok) {
        setSuggestion(result.suggestion);
      } else {
        setSuggestion(null);
        setMessage({
          text: result.message,
          tone: result.kind === "unavailable" ? "quiet" : "error",
        });
      }
    });
  };

  const decide = (accept: boolean) => {
    const current = suggestion;
    if (!current) return;
    if (accept) onApply(current);
    setSuggestion(null);
    // Recording the decision is bookkeeping — don't make the user wait on it.
    void decideSuggestionAction({ id: current.id, accept });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={run}
          disabled={pending || description.trim().length < 12}
        >
          {pending ? "Reading…" : "Suggest classification"}
        </Button>
        <span className="text-xs text-neutral-500">
          Reads the description and proposes a service, priority and title.
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
            <Badge tone="teal">Suggestion</Badge>
            <span className="text-sm font-medium">{suggestion.title}</span>
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <div className="flex gap-1.5">
              <dt className="text-neutral-500">Service</dt>
              <dd className="font-medium">
                {suggestion.serviceTypeName ?? "none of yours fit"}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-neutral-500">Priority</dt>
              <dd className="font-medium">{PRIORITY_LABEL[suggestion.priority]}</dd>
            </div>
          </dl>

          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {suggestion.rationale}
          </p>

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => decide(true)}>
              Apply
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => decide(false)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
