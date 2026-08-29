"use client";

import { useActionState } from "react";

import { Field, FormError, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";

import { createServiceTypeAction } from "./actions";

export function NewServiceTypeForm({ currency }: { currency: string }) {
  const [state, action] = useActionState(createServiceTypeAction, emptyState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error} />
      {state.success ? (
        <p className="text-sm text-green-700 dark:text-green-400">{state.success}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <Field label="Service name" htmlFor="name" error={state.fieldErrors?.name}>
          <Input id="name" name="name" placeholder="AC repair" required />
        </Field>

        <Field
          label="Minutes"
          htmlFor="defaultDurationMinutes"
          error={state.fieldErrors?.defaultDurationMinutes}
        >
          <Input
            id="defaultDurationMinutes"
            name="defaultDurationMinutes"
            type="number"
            min={5}
            max={1440}
            step={5}
            defaultValue={60}
            required
          />
        </Field>

        <Field
          label={`Price (${currency})`}
          htmlFor="defaultPriceMajor"
          error={state.fieldErrors?.defaultPriceMajor}
        >
          <Input
            id="defaultPriceMajor"
            name="defaultPriceMajor"
            type="number"
            min={0}
            step="0.01"
            defaultValue={0}
            required
          />
        </Field>

        <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
      </div>
    </form>
  );
}
