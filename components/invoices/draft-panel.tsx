"use client";

import { useState, useTransition } from "react";

import {
  decideInvoiceDraftAction,
  suggestInvoiceDraftAction,
  type DraftLine,
  type InvoiceDraftSuggestion,
} from "@/app/dashboard/invoices/ai-actions";
import { Badge, Button } from "@/components/ui/primitives";
import { formatMoney, toCents } from "@/lib/money";

/**
 * Drafts the invoice lines from the job's notes.
 *
 * Prices the model could not source are shown as "needs a price" rather than
 * quietly as zero — the whole point of the priceSource field is that the
 * reviewer can see which numbers came from the catalog and which are still
 * blanks waiting for them.
 */
export function DraftPanel({
  jobId,
  currency,
  onApply,
}: {
  jobId: string;
  currency: string;
  onApply: (lines: DraftLine[]) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<InvoiceDraftSuggestion | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "quiet" | "error" } | null>(
    null,
  );

  const run = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await suggestInvoiceDraftAction({ jobId });
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

  const decide = (accept: boolean) => {
    const current = suggestion;
    if (!current) return;
    if (accept) onApply(current.lines);
    setSuggestion(null);
    void decideInvoiceDraftAction({ id: current.id, accept });
  };

  const unpriced = suggestion?.lines.filter((line) => line.priceSource === "unknown").length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={run} disabled={pending}>
          {pending ? "Reading the job…" : "Draft lines from the job"}
        </Button>
        <span className="text-xs text-neutral-500">
          Uses your price list. Anything it can&apos;t source is left for you.
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
            {unpriced > 0 ? (
              <Badge tone="amber">
                {unpriced} line{unpriced === 1 ? "" : "s"} need a price
              </Badge>
            ) : null}
          </div>

          <ul className="flex flex-col gap-1.5">
            {suggestion.lines.map((line, index) => (
              <li
                key={`${line.description}-${index}`}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span>
                  {line.quantity > 1 ? `${line.quantity} × ` : ""}
                  {line.description}
                  <span className="ml-1.5 font-mono text-[0.65rem] text-neutral-500 uppercase">
                    {line.kind.toLowerCase()}
                  </span>
                </span>
                <span className="tabular-nums">
                  {line.priceSource === "unknown" ? (
                    <span className="text-amber-700 dark:text-amber-500">needs a price</span>
                  ) : (
                    <>
                      {formatMoney(toCents(line.unitPriceMajor) * line.quantity, currency)}
                      <span className="ml-1.5 font-mono text-[0.6rem] text-neutral-500">
                        {line.priceSource}
                      </span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {suggestion.rationale}
          </p>

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => decide(true)}>
              Use these lines
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => decide(false)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
