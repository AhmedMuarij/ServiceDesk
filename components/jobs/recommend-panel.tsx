"use client";

import { useState, useTransition } from "react";

import {
  acceptTechnicianAction,
  dismissTechnicianAction,
  suggestTechnicianAction,
  type TechnicianSuggestion,
} from "@/app/dashboard/jobs/recommend-actions";
import { Badge, Button } from "@/components/ui/primitives";

/**
 * Suggests who should take the job. The reasoning is shown because the
 * dispatcher knows things the model does not — who is off sick, who does not
 * do rooftop work any more — and needs enough to disagree on.
 */
export function RecommendPanel({
  jobId,
  currentAssignee,
}: {
  jobId: string;
  currentAssignee: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<TechnicianSuggestion | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "quiet" | "error" } | null>(
    null,
  );

  const run = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await suggestTechnicianAction({ jobId });
      if (result.ok) setSuggestion(result.suggestion);
      else {
        setSuggestion(null);
        setMessage({
          text: result.message,
          tone: result.kind === "unavailable" ? "quiet" : "error",
        });
      }
    });
  };

  const assign = (membershipId: string) => {
    const current = suggestion;
    if (!current) return;
    startTransition(async () => {
      const result = await acceptTechnicianAction({
        id: current.id,
        jobId,
        membershipId,
      });
      if (result.ok) {
        setSuggestion(null);
        setMessage({ text: "Assigned.", tone: "quiet" });
      } else {
        setMessage({ text: result.message ?? "Couldn't assign that.", tone: "error" });
      }
    });
  };

  const dismiss = () => {
    const current = suggestion;
    setSuggestion(null);
    if (current) void dismissTechnicianAction({ id: current.id });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={run} disabled={pending}>
          {pending ? "Weighing it up…" : currentAssignee ? "Suggest someone else" : "Suggest a technician"}
        </Button>
        <span className="text-xs text-neutral-500">
          Weighs skills, that day&apos;s load, and who has been to this customer before.
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
            <Badge tone="teal">Suggested</Badge>
            <span className="text-sm font-medium">{suggestion.name}</span>
          </div>

          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            {suggestion.rationale}
          </p>

          {suggestion.concern ? (
            <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
              {suggestion.concern}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => assign(suggestion.membershipId)}
              disabled={pending}
            >
              Assign {suggestion.name.split(" ")[0]}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
              Dismiss
            </Button>
          </div>

          {suggestion.alternatives.length ? (
            <div className="border-t border-neutral-200 pt-2 dark:border-neutral-800">
              <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
                Also worth considering
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {suggestion.alternatives.map((alternative) => (
                  <li
                    key={alternative.membershipId}
                    className="flex flex-wrap items-baseline gap-2 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => assign(alternative.membershipId)}
                      disabled={pending}
                      className="font-medium underline underline-offset-4 disabled:opacity-50"
                    >
                      {alternative.name}
                    </button>
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {alternative.why}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
