"use client";

import { useActionState } from "react";

import { Field, FormError, Input, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";
import { CURRENCIES, SERVICE_TYPE_SUGGESTIONS } from "@/lib/constants";

import { completeOnboardingAction } from "./actions";

export function OnboardingForm({
  orgName,
  zones,
  defaultZone,
}: {
  orgName: string;
  zones: string[];
  defaultZone: string;
}) {
  const [state, action] = useActionState(completeOnboardingAction, emptyState);

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-xs tracking-widest text-neutral-500 uppercase">
          Setting up {orgName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">A few basics</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          These set how appointments and invoices are shown. You can change all of
          it later in settings.
        </p>
      </div>

      <FormError message={state.error} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Time zone" htmlFor="timezone" error={state.fieldErrors?.timezone}>
          <Select id="timezone" name="timezone" defaultValue={defaultZone}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Currency" htmlFor="currency" error={state.fieldErrors?.currency}>
          <Select id="currency" name="currency" defaultValue="PKR">
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">What services do you offer?</legend>
        <p className="-mt-1 text-xs text-neutral-500">
          Add up to three to start. Every job is one of these, and they carry the
          default price you&apos;ll invoice.
        </p>
        {SERVICE_TYPE_SUGGESTIONS.map((suggestion, index) => (
          <Input
            key={suggestion}
            name={`service${index + 1}`}
            placeholder={suggestion}
            aria-label={`Service ${index + 1}`}
            maxLength={80}
          />
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Finish setup</SubmitButton>
        <span className="text-xs text-neutral-500">Blank services are skipped.</span>
      </div>
    </form>
  );
}
