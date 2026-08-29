"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { DraftPanel } from "@/components/invoices/draft-panel";
import {
  Button,
  Field,
  FormError,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState, type ActionState } from "@/lib/action-state";
import { computeTotals, formatMoney, toCents } from "@/lib/money";

const KINDS = [
  ["LABOUR", "Labour"],
  ["PARTS", "Parts"],
  ["FEE", "Fee"],
  ["DISCOUNT", "Discount"],
  ["OTHER", "Other"],
] as const;

export type ItemRow = {
  description: string;
  kind: string;
  quantity: number;
  unitPriceMajor: number;
};

let nextKey = 0;

export function InvoiceForm({
  action,
  currency,
  jobId,
  invoiceId,
  initialItems,
  initialTaxPercent,
  initialNotes,
  submitLabel,
  cancelHref,
  aiJobId,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  currency: string;
  jobId?: string;
  invoiceId?: string;
  initialItems: ItemRow[];
  initialTaxPercent: number;
  initialNotes?: string;
  submitLabel: string;
  cancelHref: string;
  /** Set when AI drafting is available for this job; undefined hides it. */
  aiJobId?: string;
}) {
  const [state, formAction] = useActionState(action, emptyState);
  const [rows, setRows] = useState(() =>
    initialItems.map((item) => ({ ...item, key: nextKey++ })),
  );
  const [taxPercent, setTaxPercent] = useState(initialTaxPercent);

  // Same arithmetic the server stores, so the preview can't disagree with it.
  const totals = computeTotals(
    rows.map((row) => ({
      quantity: Number(row.quantity) || 0,
      unitPriceCents: toCents(Number(row.unitPriceMajor) || 0),
    })),
    Math.round((Number(taxPercent) || 0) * 100),
  );

  const update = (key: number, patch: Partial<ItemRow>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      {jobId ? <input type="hidden" name="jobId" value={jobId} /> : null}
      {invoiceId ? <input type="hidden" name="id" value={invoiceId} /> : null}

      <FormError message={state.error} />

      {aiJobId ? (
        <DraftPanel
          jobId={aiJobId}
          currency={currency}
          onApply={(lines) =>
            setRows(
              lines.map((line) => ({
                key: nextKey++,
                description: line.description,
                kind: line.kind,
                quantity: line.quantity,
                unitPriceMajor: line.unitPriceMajor,
              })),
            )
          }
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="hidden gap-3 px-1 text-xs text-neutral-500 sm:grid sm:grid-cols-[1fr_7rem_5rem_8rem_2rem]">
          <span>Description</span>
          <span>Type</span>
          <span>Qty</span>
          <span className="text-right">Unit price</span>
          <span />
        </div>

        {rows.map((row) => (
          <div
            key={row.key}
            className="grid gap-3 sm:grid-cols-[1fr_7rem_5rem_8rem_2rem] sm:items-center"
          >
            <Input
              name="itemDescription"
              value={row.description}
              onChange={(event) => update(row.key, { description: event.target.value })}
              placeholder="Labour — 2 hours on site"
              aria-label="Description"
            />
            <Select
              name="itemKind"
              value={row.kind}
              onChange={(event) => update(row.key, { kind: event.target.value })}
              aria-label="Type"
            >
              {KINDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Input
              name="itemQuantity"
              type="number"
              min={1}
              max={9999}
              value={row.quantity}
              onChange={(event) => update(row.key, { quantity: Number(event.target.value) })}
              aria-label="Quantity"
            />
            <Input
              name="itemUnitPrice"
              type="number"
              step="0.01"
              value={row.unitPriceMajor}
              onChange={(event) =>
                update(row.key, { unitPriceMajor: Number(event.target.value) })
              }
              className="text-right"
              aria-label="Unit price"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              disabled={rows.length === 1}
              aria-label="Remove line"
            >
              ×
            </Button>
          </div>
        ))}

        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  key: nextKey++,
                  description: "",
                  kind: "PARTS",
                  quantity: 1,
                  unitPriceMajor: 0,
                },
              ])
            }
          >
            Add line
          </Button>
        </div>
        {state.fieldErrors?.items ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            {state.fieldErrors.items[0]}
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Tax rate (%)"
          htmlFor="taxRatePercent"
          hint="Stored as basis points, so 17.5 is exact."
          error={state.fieldErrors?.taxRatePercent}
        >
          <Input
            id="taxRatePercent"
            name="taxRatePercent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={taxPercent}
            onChange={(event) => setTaxPercent(Number(event.target.value))}
          />
        </Field>

        <div className="flex flex-col justify-end gap-1 text-sm tabular-nums">
          <div className="flex justify-between">
            <span className="text-neutral-500">Subtotal</span>
            <span>{formatMoney(totals.subtotalCents, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Tax</span>
            <span>{formatMoney(totals.taxCents, currency)}</span>
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold dark:border-neutral-800">
            <span>Total</span>
            <span>{formatMoney(totals.totalCents, currency)}</span>
          </div>
        </div>
      </div>

      <Field label="Notes" htmlFor="notes" error={state.fieldErrors?.notes}>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={initialNotes ?? ""}
          placeholder="Payment terms, bank details, anything the customer needs."
        />
      </Field>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        <Link
          href={cancelHref}
          className="text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
