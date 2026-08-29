import { prisma } from "@/lib/db/prisma";
import { renderEmail } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/provider";
import { renderNotification } from "@/lib/notifications/templates";
import { Prisma, type NotificationType, type RecipientKind } from "@prisma/client";

/**
 * Drains the notification outbox. Lives here rather than in the route handler
 * so it can be exercised directly — including the failure path, which is the
 * whole point of the outbox.
 */

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

type ClaimedRow = {
  id: string;
  type: NotificationType;
  recipientKind: RecipientKind;
  toEmail: string;
  toName: string | null;
  subject: string;
  payload: Prisma.JsonValue;
  attempts: number;
};

export type DispatchResult = {
  claimed: number;
  sent: number;
  failed: number;
  retrying: number;
};

/** Exponential backoff: 2, 4, 8, 16 minutes. */
function nextAttemptAt(attempts: number): Date {
  return new Date(Date.now() + 2 ** attempts * 60_000);
}

export async function dispatchNotifications(
  batchSize = BATCH_SIZE,
): Promise<DispatchResult> {
  // SKIP LOCKED is what makes two overlapping cron runs safe: each claims a
  // disjoint set of rows instead of both sending the same email.
  const claimed = await prisma.$queryRaw<ClaimedRow[]>(Prisma.sql`
    UPDATE "Notification"
    SET status = 'SENDING'
    WHERE id IN (
      SELECT id FROM "Notification"
      WHERE status = 'PENDING' AND "scheduledFor" <= now()
      ORDER BY "scheduledFor" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, "recipientKind", "toEmail", "toName", subject, payload, attempts
  `);

  let sent = 0;
  let failed = 0;
  let retrying = 0;

  for (const row of claimed) {
    try {
      const body = renderNotification(row.type, row.recipientKind, row.payload);
      const orgName = (row.payload as Record<string, unknown> | null)?.orgName;
      const { html, text } = renderEmail(
        body,
        typeof orgName === "string" && orgName ? orgName : "ServiceOps",
      );

      const { id } = await sendEmail({
        to: row.toEmail,
        subject: row.subject,
        html,
        text,
      });

      await prisma.notification.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: id,
          attempts: row.attempts + 1,
          lastError: null,
        },
      });
      sent++;
    } catch (error) {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;

      // A failure is a row, not a lost log line.
      await prisma.notification.update({
        where: { id: row.id },
        data: {
          status: giveUp ? "FAILED" : "PENDING",
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          ...(giveUp ? {} : { scheduledFor: nextAttemptAt(attempts) }),
        },
      });

      if (giveUp) failed++;
      else retrying++;
    }
  }

  return { claimed: claimed.length, sent, failed, retrying };
}
