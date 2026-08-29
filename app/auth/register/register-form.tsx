"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormError, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";

import { registerAction } from "./actions";

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, emptyState);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Create your workspace</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          You&apos;ll be the owner. Teammates come later, by invitation.
        </p>
      </div>

      <FormError message={state.error} />

      <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" autoComplete="name" required />
      </Field>

      <Field
        label="Company name"
        htmlFor="companyName"
        hint="What your customers know you as."
        error={state.fieldErrors?.companyName}
      >
        <Input id="companyName" name="companyName" autoComplete="organization" required />
      </Field>

      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      <Field
        label="Password"
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

      <SubmitButton pendingLabel="Creating workspace…">Create workspace</SubmitButton>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        Already have an account?{" "}
        <Link href="/auth/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
