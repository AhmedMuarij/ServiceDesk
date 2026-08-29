"use client";

import { useActionState } from "react";

import { FormError } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";

import { markPaidAction, sendInvoiceAction } from "../actions";

export function SendInvoiceButton({
  invoiceId,
  hasEmail,
}: {
  invoiceId: string;
  hasEmail: boolean;
}) {
  const [state, action] = useActionState(sendInvoiceAction, emptyState);

  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <input type="hidden" name="id" value={invoiceId} />
        <SubmitButton pendingLabel="Sending…">Send to customer</SubmitButton>
      </form>
      <FormError message={state.error} />
      {!hasEmail ? (
        <p className="text-xs text-amber-700 dark:text-amber-500">
          This customer has no email address — sending will mark the invoice sent
          but won&apos;t queue an email.
        </p>
      ) : null}
    </div>
  );
}

export function MarkPaidButton({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(markPaidAction, emptyState);

  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <input type="hidden" name="id" value={invoiceId} />
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Mark as paid
        </SubmitButton>
      </form>
      <FormError message={state.error} />
    </div>
  );
}
