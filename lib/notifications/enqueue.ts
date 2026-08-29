import type { Prisma, NotificationType, RecipientKind } from "@prisma/client";

/**
 * Writes PENDING notification rows. Always called with the transaction client
 * of the change that caused the event, so an email is enqueued if and only if
 * the domain write commits. Nothing here talks to an email provider — that is
 * the dispatcher's job. See docs/03-data-model.md.
 */

export type Recipient = {
  kind: RecipientKind;
  email: string | null | undefined;
  name?: string | null;
};

export type EnqueueInput = {
  organizationId: string;
  type: NotificationType;
  subject: string;
  /** Template variables, snapshotted now so the email says what was true. */
  payload: Prisma.InputJsonObject;
  recipients: Recipient[];
  jobId?: string | null;
  invoiceId?: string | null;
  /** Base key for repeatable events; the recipient kind is appended. */
  dedupeKey?: string;
  scheduledFor?: Date;
};

/** Recipients of these are fixed by the event itself, not by org preference. */
const ALWAYS_SEND: NotificationType[] = ["TEAM_INVITE"];

export async function enqueueNotifications(
  tx: Prisma.TransactionClient,
  input: EnqueueInput,
): Promise<number> {
  const {
    organizationId,
    type,
    subject,
    payload,
    recipients,
    jobId = null,
    invoiceId = null,
    dedupeKey,
    scheduledFor,
  } = input;

  let allowed = recipients;

  if (!ALWAYS_SEND.includes(type)) {
    const preference = await tx.notificationPreference.findUnique({
      where: { organizationId_type: { organizationId, type } },
      select: {
        enabled: true,
        notifyCustomer: true,
        notifyTechnician: true,
        notifyOrg: true,
      },
    });

    // No row means the org predates this event type; default to sending.
    if (preference && !preference.enabled) return 0;

    if (preference) {
      allowed = recipients.filter((recipient) =>
        recipient.kind === "CUSTOMER"
          ? preference.notifyCustomer
          : recipient.kind === "TECHNICIAN"
            ? preference.notifyTechnician
            : preference.notifyOrg,
      );
    }
  }

  // A customer with no email address simply cannot be emailed.
  const deliverable = allowed.filter(
    (recipient): recipient is Recipient & { email: string } => Boolean(recipient.email),
  );
  if (deliverable.length === 0) return 0;

  const { count } = await tx.notification.createMany({
    data: deliverable.map((recipient) => ({
      organizationId,
      type,
      recipientKind: recipient.kind,
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject,
      payload,
      jobId,
      invoiceId,
      scheduledFor: scheduledFor ?? new Date(),
      // Unique index makes re-running a cron a no-op rather than a duplicate.
      dedupeKey: dedupeKey ? `${dedupeKey}:${recipient.kind}:${recipient.email}` : null,
    })),
    skipDuplicates: true,
  });

  return count;
}
