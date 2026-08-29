"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ClassifyPanel } from "@/components/jobs/classify-panel";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState, type ActionState } from "@/lib/action-state";
import { PRIORITY_LABEL } from "@/lib/status";
import type { JobPriority } from "@prisma/client";

type Option = { id: string; name: string };
type ServiceOption = Option & { defaultDurationMinutes: number };
type MemberOption = { id: string; label: string; role: string };

export type JobFormValues = {
  id?: string;
  customerId?: string;
  serviceTypeId?: string | null;
  title?: string;
  description?: string | null;
  priority?: JobPriority;
  scheduledDate?: string;
  scheduledTime?: string;
  durationMinutes?: number;
  assignedMembershipId?: string | null;
  addressLine?: string | null;
  city?: string | null;
};

export function JobForm({
  action,
  customers,
  services,
  members,
  values,
  submitLabel,
  cancelHref,
  aiEnabled = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  customers: Array<Option & { phone: string | null }>;
  services: ServiceOption[];
  members: MemberOption[];
  values?: JobFormValues;
  submitLabel: string;
  cancelHref: string;
  /** Resolved on the server; false hides the AI affordance entirely. */
  aiEnabled?: boolean;
}) {
  const [state, formAction] = useActionState(action, emptyState);
  const [duration, setDuration] = useState(values?.durationMinutes ?? 60);

  // Controlled so an accepted suggestion can fill them.
  const [description, setDescription] = useState(values?.description ?? "");
  const [title, setTitle] = useState(values?.title ?? "");
  const [priority, setPriority] = useState<JobPriority>(values?.priority ?? "MEDIUM");
  const [serviceTypeId, setServiceTypeId] = useState(values?.serviceTypeId ?? "");

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <FormError message={state.error} />

      <Field label="Customer" htmlFor="customerId" error={state.fieldErrors?.customerId}>
        <Select
          id="customerId"
          name="customerId"
          defaultValue={values?.customerId ?? ""}
          required
        >
          <option value="" disabled>
            Choose a customer…
          </option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
              {customer.phone ? ` — ${customer.phone}` : ""}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Service"
          htmlFor="serviceTypeId"
          hint="Sets the default duration and invoice price."
          error={state.fieldErrors?.serviceTypeId}
        >
          <Select
            id="serviceTypeId"
            name="serviceTypeId"
            value={serviceTypeId}
            onChange={(event) => {
              setServiceTypeId(event.target.value);
              const service = services.find((s) => s.id === event.target.value);
              if (service) setDuration(service.defaultDurationMinutes);
            }}
          >
            <option value="">Not specified</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Priority" htmlFor="priority" error={state.fieldErrors?.priority}>
          <Select
            id="priority"
            name="priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as JobPriority)}
          >
            {(Object.keys(PRIORITY_LABEL) as JobPriority[]).map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="What needs doing"
        htmlFor="title"
        hint="One line the technician will read first."
        error={state.fieldErrors?.title}
      >
        <Input
          id="title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="AC not cooling"
          required
        />
      </Field>

      <Field label="Details" htmlFor="description" error={state.fieldErrors?.description}>
        <Textarea
          id="description"
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What the customer said, what has been tried, anything the technician should know."
        />
      </Field>

      {aiEnabled ? (
        <ClassifyPanel
          description={description}
          jobId={values?.id}
          onApply={(suggestion) => {
            setTitle(suggestion.title);
            setPriority(suggestion.priority);
            if (suggestion.serviceTypeId) {
              setServiceTypeId(suggestion.serviceTypeId);
              const service = services.find((s) => s.id === suggestion.serviceTypeId);
              if (service) setDuration(service.defaultDurationMinutes);
            }
          }}
        />
      ) : null}

      <fieldset className="grid gap-5 rounded-lg border border-neutral-200 p-4 sm:grid-cols-3 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Appointment</legend>

        <Field label="Date" htmlFor="scheduledDate" error={state.fieldErrors?.scheduledDate}>
          <Input
            id="scheduledDate"
            name="scheduledDate"
            type="date"
            defaultValue={values?.scheduledDate ?? ""}
          />
        </Field>

        <Field label="Start time" htmlFor="scheduledTime" error={state.fieldErrors?.scheduledTime}>
          <Input
            id="scheduledTime"
            name="scheduledTime"
            type="time"
            defaultValue={values?.scheduledTime ?? "09:00"}
          />
        </Field>

        <Field
          label="Minutes"
          htmlFor="durationMinutes"
          error={state.fieldErrors?.durationMinutes}
        >
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={5}
            max={1440}
            step={5}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          />
        </Field>

        <p className="text-xs text-neutral-500 sm:col-span-3">
          Leave the date blank to keep this job unscheduled — it stays in the New
          column until someone books it.
        </p>
      </fieldset>

      <Field
        label="Technician"
        htmlFor="assignedMembershipId"
        hint="Assigning without a date leaves the job unscheduled."
        error={state.fieldErrors?.assignedMembershipId}
      >
        <Select
          id="assignedMembershipId"
          name="assignedMembershipId"
          defaultValue={values?.assignedMembershipId ?? ""}
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Address"
          htmlFor="addressLine"
          hint="Defaults to the customer's address."
          error={state.fieldErrors?.addressLine}
        >
          <Input
            id="addressLine"
            name="addressLine"
            defaultValue={values?.addressLine ?? ""}
          />
        </Field>
        <Field label="City" htmlFor="city" error={state.fieldErrors?.city}>
          <Input id="city" name="city" defaultValue={values?.city ?? ""} />
        </Field>
      </div>

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
