"use client";

import { useActionState } from "react";

import { Field, FormError, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";

import { changePasswordAction, saveProfileAction } from "../actions";

function Saved({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-green-700 dark:text-green-400">{message}</p>;
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action] = useActionState(saveProfileAction, emptyState);

  return (
    <form action={action} className="flex max-w-md flex-col gap-5">
      <FormError message={state.error} />
      <Saved message={state.success} />

      <Field label="Email" htmlFor="email" hint="Sign-in address — not editable yet.">
        <Input id="email" value={email} disabled readOnly />
      </Field>

      <Field label="Name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" defaultValue={name} required />
      </Field>

      <div>
        <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, emptyState);

  return (
    <form action={action} className="flex max-w-md flex-col gap-5">
      <FormError message={state.error} />
      <Saved message={state.success} />

      <Field
        label="Current password"
        htmlFor="currentPassword"
        error={state.fieldErrors?.currentPassword}
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Field
        label="New password"
        htmlFor="newPassword"
        hint="At least 8 characters."
        error={state.fieldErrors?.newPassword}
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <div>
        <SubmitButton variant="secondary" pendingLabel="Updating…">
          Change password
        </SubmitButton>
      </div>
    </form>
  );
}
