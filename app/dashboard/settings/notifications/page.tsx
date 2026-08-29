import type { Metadata } from "next";

import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { listPreferences, recentNotifications } from "@/lib/db/notifications";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";
import { formatDateTime } from "@/lib/dates";
import { NOTIFICATION_LABEL } from "@/lib/notifications/labels";
import type { BadgeTone } from "@/components/ui/primitives";
import type { NotificationStatus } from "@prisma/client";

import { PreferencesForm } from "./preferences-form";

export const metadata: Metadata = { title: "Notification settings" };

const STATUS_TONE: Record<NotificationStatus, BadgeTone> = {
  PENDING: "neutral",
  SENDING: "blue",
  SENT: "green",
  FAILED: "red",
  CANCELLED: "neutral",
};

export default async function NotificationSettingsPage() {
  await requireDashboardAccess("ADMIN");
  const [preferences, recent, org] = await Promise.all([
    listPreferences(),
    recentNotifications(),
    getOrgSettings(),
  ]);

  const pending = recent.filter((n) => n.status === "PENDING").length;
  const failed = recent.filter((n) => n.status === "FAILED").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Which events send an email, and who gets it. Turning an event off stops the email being queued at all."
      />

      <Card className="p-5">
        <PreferencesForm preferences={preferences} />
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
          {pending > 0 ? (
            <span className="text-xs text-neutral-500">{pending} waiting to send</span>
          ) : null}
          {failed > 0 ? (
            <span className="text-xs text-red-600 dark:text-red-400">
              {failed} gave up after 5 attempts
            </span>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nothing sent yet. Emails appear here the moment they&apos;re queued.
          </p>
        ) : (
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>To</Th>
                  <Th>Queued</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((notification) => (
                  <tr key={notification.id}>
                    <Td>
                      <span className="font-medium">
                        {NOTIFICATION_LABEL[notification.type]}
                      </span>
                      <span className="block max-w-xs truncate text-xs text-neutral-500">
                        {notification.subject}
                      </span>
                    </Td>
                    <Td className="text-neutral-600 dark:text-neutral-400">
                      {notification.toEmail}
                    </Td>
                    <Td className="text-neutral-600 dark:text-neutral-400">
                      {formatDateTime(notification.createdAt, org.timezone)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[notification.status]}>
                        {notification.status.toLowerCase()}
                      </Badge>
                      {notification.attempts > 1 ? (
                        <span className="ml-1 text-xs text-neutral-500">
                          ×{notification.attempts}
                        </span>
                      ) : null}
                      {notification.lastError ? (
                        <span className="block max-w-xs truncate text-xs text-red-600 dark:text-red-400">
                          {notification.lastError}
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      <p className="text-xs text-neutral-500">
        Emails are queued in the same transaction as the change that caused them,
        then sent by a background dispatcher. A provider outage delays delivery —
        it never fails the job update that triggered it.
      </p>
    </div>
  );
}
