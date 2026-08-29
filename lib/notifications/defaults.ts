import type { NotificationType } from "@prisma/client";

export type NotificationDefault = {
  type: NotificationType;
  enabled: boolean;
  notifyCustomer: boolean;
  notifyTechnician: boolean;
  notifyOrg: boolean;
};

/**
 * Seeded once per organization at registration. A business can change any of
 * it on /dashboard/settings/notifications; preferences are checked at enqueue
 * time, so a disabled event never creates a row at all.
 */
export const NOTIFICATION_DEFAULTS: NotificationDefault[] = [
  { type: "JOB_CREATED", enabled: true, notifyCustomer: false, notifyTechnician: false, notifyOrg: true },
  { type: "JOB_ASSIGNED", enabled: true, notifyCustomer: false, notifyTechnician: true, notifyOrg: false },
  { type: "APPOINTMENT_SCHEDULED", enabled: true, notifyCustomer: true, notifyTechnician: true, notifyOrg: false },
  { type: "APPOINTMENT_RESCHEDULED", enabled: true, notifyCustomer: true, notifyTechnician: true, notifyOrg: false },
  { type: "APPOINTMENT_REMINDER", enabled: true, notifyCustomer: true, notifyTechnician: true, notifyOrg: false },
  { type: "JOB_COMPLETED", enabled: true, notifyCustomer: true, notifyTechnician: false, notifyOrg: false },
  { type: "INVOICE_SENT", enabled: true, notifyCustomer: true, notifyTechnician: false, notifyOrg: false },
  { type: "INVOICE_OVERDUE", enabled: true, notifyCustomer: true, notifyTechnician: false, notifyOrg: true },
  // The recipient of an invite is the invitee, so the recipient toggles do not
  // apply — only `enabled`, and turning it off would make invites unusable.
  { type: "TEAM_INVITE", enabled: true, notifyCustomer: false, notifyTechnician: false, notifyOrg: false },
];
