import type { NotificationType } from "@prisma/client";

export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  JOB_CREATED: "Job created",
  JOB_ASSIGNED: "Job assigned",
  APPOINTMENT_SCHEDULED: "Appointment scheduled",
  APPOINTMENT_RESCHEDULED: "Appointment rescheduled",
  APPOINTMENT_REMINDER: "Appointment reminder",
  JOB_COMPLETED: "Job completed",
  INVOICE_SENT: "Invoice sent",
  INVOICE_OVERDUE: "Invoice overdue",
  TEAM_INVITE: "Team invitation",
};

export const NOTIFICATION_DESCRIPTION: Record<NotificationType, string> = {
  JOB_CREATED: "When a new job is logged.",
  JOB_ASSIGNED: "When a technician is given a job.",
  APPOINTMENT_SCHEDULED: "When a job first gets a date and time.",
  APPOINTMENT_RESCHEDULED: "When a booked appointment moves.",
  APPOINTMENT_REMINDER: "The evening before an appointment.",
  JOB_COMPLETED: "When a technician marks the work done.",
  INVOICE_SENT: "When an invoice is sent to the customer.",
  INVOICE_OVERDUE: "When an invoice passes its due date.",
  TEAM_INVITE: "Always sent — it's how people join.",
};

/** Types whose recipients are fixed by the event, so toggles don't apply. */
export const SYSTEM_TYPES: NotificationType[] = ["TEAM_INVITE"];

export const NOTIFICATION_ORDER: NotificationType[] = [
  "JOB_CREATED",
  "APPOINTMENT_SCHEDULED",
  "APPOINTMENT_RESCHEDULED",
  "APPOINTMENT_REMINDER",
  "JOB_ASSIGNED",
  "JOB_COMPLETED",
  "INVOICE_SENT",
  "INVOICE_OVERDUE",
  "TEAM_INVITE",
];
