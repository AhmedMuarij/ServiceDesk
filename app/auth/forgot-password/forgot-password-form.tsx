"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormError, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";

import { forgotPasswordAction } from "./actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, emptyState);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          We&apos;ll email you a link. It expires in an hour.
        </p>
      </div>

      <FormError message={state.error} />

      {state.success ? (
        <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400">
          {state.success}
        </p>
      ) : null}

      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        <Link href="/auth/login" className="underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
