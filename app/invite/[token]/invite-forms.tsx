"use client";

import { useActionState } from "react";

import { Field, FormError, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";

import { acceptInviteAction, acceptInviteAsNewUserAction } from "./actions";

export function AcceptInviteButton({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInviteAction, emptyState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <SubmitButton pendingLabel="Joining…">Accept invitation</SubmitButton>
    </form>
  );
}

export function NewUserInviteForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(acceptInviteAsNewUserAction, emptyState);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />

      <Field label="Email" htmlFor="email">
        <Input id="email" value={email} disabled readOnly />
      </Field>

      <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" autoComplete="name" required autoFocus />
      </Field>

      <Field
        label="Choose a password"
        htmlFor="password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <SubmitButton pendingLabel="Creating account…">Join the team</SubmitButton>
    </form>
  );
}
