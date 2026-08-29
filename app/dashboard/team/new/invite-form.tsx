"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormError, Input, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/roles";
import type { Role } from "@prisma/client";

import { inviteMemberAction } from "../actions";

export function InviteForm({ roles }: { roles: Role[] }) {
  const [state, action] = useActionState(inviteMemberAction, emptyState);

  return (
    <form action={action} className="flex max-w-lg flex-col gap-5">
      <FormError message={state.error} />

      <Field
        label="Email"
        htmlFor="email"
        hint="They'll get a link that expires in seven days."
        error={state.fieldErrors?.email}
      >
        <Input id="email" name="email" type="email" required autoFocus />
      </Field>

      <Field label="Role" htmlFor="role" error={state.fieldErrors?.role}>
        <Select id="role" name="role" defaultValue="TECHNICIAN">
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </Select>
      </Field>

      <dl className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        {roles.map((role) => (
          <div key={role} className="flex gap-2">
            <dt className="w-24 shrink-0 font-medium">{ROLE_LABEL[role]}</dt>
            <dd className="text-neutral-600 dark:text-neutral-400">
              {ROLE_DESCRIPTION[role]}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Sending…">Send invitation</SubmitButton>
        <Link
          href="/dashboard/team"
          className="text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
