"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormError, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";

import { resetPasswordAction } from "./actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, emptyState);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          You&apos;ll be signed out everywhere else.
        </p>
      </div>

      <FormError message={state.error} />

      <Field
        label="New password"
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

      <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        <Link href="/auth/forgot-password" className="underline underline-offset-4">
          Request a new link
        </Link>
      </p>
    </form>
  );
}
