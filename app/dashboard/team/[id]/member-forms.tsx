"use client";

import { useActionState } from "react";

import { Field, FormError, Input, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";
import { ROLE_LABEL } from "@/lib/roles";
import type { Role } from "@prisma/client";

import { updateMemberRoleAction, updateTechnicianProfileAction } from "../actions";

function Saved({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-green-700 dark:text-green-400">{message}</p>;
}

export function RoleForm({
  memberId,
  currentRole,
  roles,
  disabled,
}: {
  memberId: string;
  currentRole: Role;
  roles: Role[];
  disabled?: string;
}) {
  const [state, action] = useActionState(updateMemberRoleAction, emptyState);

  if (disabled) {
    return <p className="text-sm text-neutral-500">{disabled}</p>;
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={memberId} />
      <FormError message={state.error} />
      <Field label="Role" htmlFor="role" error={state.fieldErrors?.role}>
        <Select id="role" name="role" defaultValue={currentRole} className="w-48">
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Update role
      </SubmitButton>
      <Saved message={state.success} />
    </form>
  );
}

export function TechnicianProfileForm({
  memberId,
  profile,
}: {
  memberId: string;
  profile: {
    phone: string | null;
    skills: string[];
    maxJobsPerDay: number;
    isAvailable: boolean;
  } | null;
}) {
  const [state, action] = useActionState(updateTechnicianProfileAction, emptyState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={memberId} />
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" htmlFor="phone" error={state.fieldErrors?.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={profile?.phone ?? ""} />
        </Field>
        <Field
          label="Max jobs per day"
          htmlFor="maxJobsPerDay"
          error={state.fieldErrors?.maxJobsPerDay}
        >
          <Input
            id="maxJobsPerDay"
            name="maxJobsPerDay"
            type="number"
            min={1}
            max={24}
            defaultValue={profile?.maxJobsPerDay ?? 6}
          />
        </Field>
      </div>

      <Field
        label="Skills"
        htmlFor="skills"
        hint="Comma separated, matched against your service types."
        error={state.fieldErrors?.skills}
      >
        <Input
          id="skills"
          name="skills"
          defaultValue={profile?.skills.join(", ") ?? ""}
          placeholder="AC repair, AC installation"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isAvailable"
          defaultChecked={profile?.isAvailable ?? true}
          className="size-4"
        />
        Available for new work
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save profile
        </SubmitButton>
        <Saved message={state.success} />
      </div>
    </form>
  );
}
