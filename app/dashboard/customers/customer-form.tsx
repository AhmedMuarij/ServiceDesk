"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormError, Input, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState, type ActionState } from "@/lib/action-state";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  notes: string | null;
};

export function CustomerForm({
  action,
  customer,
  submitLabel,
  cancelHref,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  customer?: Customer;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, emptyState);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

      <FormError message={state.error} />

      <Field label="Name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" defaultValue={customer?.name} required autoFocus />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Phone"
          htmlFor="phone"
          hint="How you'll actually reach them."
          error={state.fieldErrors?.phone}
        >
          <Input id="phone" name="phone" type="tel" defaultValue={customer?.phone ?? ""} />
        </Field>

        <Field
          label="Email"
          htmlFor="email"
          hint="Needed for appointment and invoice emails."
          error={state.fieldErrors?.email}
        >
          <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
        </Field>
      </div>

      <Field label="Address" htmlFor="addressLine" error={state.fieldErrors?.addressLine}>
        <Input
          id="addressLine"
          name="addressLine"
          defaultValue={customer?.addressLine ?? ""}
        />
      </Field>

      <Field label="City" htmlFor="city" error={state.fieldErrors?.city}>
        <Input id="city" name="city" defaultValue={customer?.city ?? ""} />
      </Field>

      <Field
        label="Notes"
        htmlFor="notes"
        hint="Gate codes, which floor, who to ask for."
        error={state.fieldErrors?.notes}
      >
        <Textarea id="notes" name="notes" defaultValue={customer?.notes ?? ""} />
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
