"use client";

import { useActionState } from "react";

import { Field, FormError, Input, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";
import { CURRENCIES } from "@/lib/constants";

import { saveCompanySettingsAction } from "../actions";

type Settings = {
  name: string;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  timezone: string;
  currency: string;
  invoicePrefix: string;
  invoiceDueDays: number;
  defaultTaxRateBps: number;
  invoiceFooter: string | null;
};

export function CompanyForm({
  settings,
  zones,
}: {
  settings: Settings;
  zones: string[];
}) {
  const [state, action] = useActionState(saveCompanySettingsAction, emptyState);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <FormError message={state.error} />
      {state.success ? (
        <p className="text-sm text-green-700 dark:text-green-400">{state.success}</p>
      ) : null}

      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold">Business details</h2>

        <Field label="Company name" htmlFor="name" error={state.fieldErrors?.name}>
          <Input id="name" name="name" defaultValue={settings.name} required />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Email"
            htmlFor="email"
            hint="Where job notifications for the office go."
            error={state.fieldErrors?.email}
          >
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={settings.email ?? ""}
            />
          </Field>
          <Field label="Phone" htmlFor="phone" error={state.fieldErrors?.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={settings.phone ?? ""} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Address"
            htmlFor="addressLine"
            error={state.fieldErrors?.addressLine}
          >
            <Input
              id="addressLine"
              name="addressLine"
              defaultValue={settings.addressLine ?? ""}
            />
          </Field>
          <Field label="City" htmlFor="city" error={state.fieldErrors?.city}>
            <Input id="city" name="city" defaultValue={settings.city ?? ""} />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold">Locale</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Time zone"
            htmlFor="timezone"
            hint="All appointment times are shown in this zone."
            error={state.fieldErrors?.timezone}
          >
            <Select id="timezone" name="timezone" defaultValue={settings.timezone}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Currency"
            htmlFor="currency"
            hint="Existing invoices keep the currency they were issued in."
            error={state.fieldErrors?.currency}
          >
            <Select id="currency" name="currency" defaultValue={settings.currency}>
              {CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold">Invoice defaults</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            label="Number prefix"
            htmlFor="invoicePrefix"
            error={state.fieldErrors?.invoicePrefix}
          >
            <Input
              id="invoicePrefix"
              name="invoicePrefix"
              defaultValue={settings.invoicePrefix}
              maxLength={8}
              required
            />
          </Field>
          <Field
            label="Payment terms (days)"
            htmlFor="invoiceDueDays"
            error={state.fieldErrors?.invoiceDueDays}
          >
            <Input
              id="invoiceDueDays"
              name="invoiceDueDays"
              type="number"
              min={0}
              max={180}
              defaultValue={settings.invoiceDueDays}
              required
            />
          </Field>
          <Field
            label="Default tax (%)"
            htmlFor="defaultTaxPercent"
            error={state.fieldErrors?.defaultTaxPercent}
          >
            <Input
              id="defaultTaxPercent"
              name="defaultTaxPercent"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={settings.defaultTaxRateBps / 100}
              required
            />
          </Field>
        </div>

        <Field
          label="Invoice footer"
          htmlFor="invoiceFooter"
          hint="Bank details, payment instructions, thank-you note."
          error={state.fieldErrors?.invoiceFooter}
        >
          <Textarea
            id="invoiceFooter"
            name="invoiceFooter"
            defaultValue={settings.invoiceFooter ?? ""}
          />
        </Field>
      </section>

      <div>
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </div>
    </form>
  );
}
