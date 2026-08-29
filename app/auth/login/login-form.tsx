"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormError, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";

import { loginAction } from "./actions";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action] = useActionState(loginAction, emptyState);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Welcome back.
        </p>
      </div>

      {notice ? (
        <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400">
          {notice}
        </p>
      ) : null}

      <FormError message={state.error} />

      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>

      <div className="flex flex-col gap-2 text-center text-sm text-neutral-600 dark:text-neutral-400">
        <Link href="/auth/forgot-password" className="underline underline-offset-4">
          Forgot your password?
        </Link>
        <span>
          New here?{" "}
          <Link href="/auth/register" className="underline underline-offset-4">
            Create a workspace
          </Link>
        </span>
      </div>
    </form>
  );
}
