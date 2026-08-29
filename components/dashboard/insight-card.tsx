"use client";

import { useState, useTransition } from "react";

import { generateInsightAction, type Insight } from "@/app/dashboard/insight-actions";
import { Button, Card } from "@/components/ui/primitives";

/**
 * The week in words. The figures are computed in Postgres and handed to the
 * model as facts — it is asked what they mean, never to do the arithmetic.
 */
export function InsightCard() {
  const [pending, startTransition] = useTransition();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "quiet" | "error" } | null>(
    null,
  );

  const run = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await generateInsightAction();
      if (result.ok) setInsight(result.insight);
      else {
        setInsight(null);
        setMessage({
          text: result.message,
          tone: result.kind === "unavailable" ? "quiet" : "error",
        });
      }
    });
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">How the week went</h2>
        <Button type="button" variant="secondary" size="sm" onClick={run} disabled={pending}>
          {pending ? "Reading the numbers…" : insight ? "Refresh" : "Read my week"}
        </Button>
      </div>

      {message ? (
        <p
          className={
            message.tone === "error"
              ? "mt-2 text-xs text-red-600 dark:text-red-400"
              : "mt-2 text-xs text-neutral-500"
          }
        >
          {message.text}
        </p>
      ) : null}

      {!insight && !message ? (
        <p className="mt-2 text-sm text-neutral-500">
          A short read of the last seven days — what moved, and what is worth
          doing something about.
        </p>
      ) : null}

      {insight ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm font-medium">{insight.headline}</p>

          <ul className="flex flex-col gap-1.5">
            {insight.observations.map((observation) => (
              <li
                key={observation}
                className="border-l-2 border-neutral-300 pl-3 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
              >
                {observation}
              </li>
            ))}
          </ul>

          {insight.watchOut ? (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {insight.watchOut}
            </p>
          ) : null}

          <p className="font-mono text-[0.65rem] tracking-wide text-neutral-500 uppercase">
            {insight.numbers.from} → {insight.numbers.to} ·{" "}
            {insight.numbers.completed} completed · {insight.numbers.paidFormatted} collected
          </p>
        </div>
      ) : null}
    </Card>
  );
}
