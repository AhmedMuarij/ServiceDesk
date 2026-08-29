import type { BadgeTone } from "@/components/ui/primitives";
import type { InvoiceStatus, JobPriority, JobStatus } from "@prisma/client";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  NEW: "New",
  SCHEDULED: "Scheduled",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const JOB_STATUS_TONE: Record<JobStatus, BadgeTone> = {
  NEW: "neutral",
  SCHEDULED: "blue",
  ASSIGNED: "teal",
  IN_PROGRESS: "amber",
  COMPLETED: "green",
  CANCELLED: "red",
};

export const JOB_STATUS_ORDER: JobStatus[] = [
  "NEW",
  "SCHEDULED",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

/** Statuses that still need someone to do something. */
export const OPEN_JOB_STATUSES: JobStatus[] = [
  "NEW",
  "SCHEDULED",
  "ASSIGNED",
  "IN_PROGRESS",
];

export const PRIORITY_LABEL: Record<JobPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_TONE: Record<JobPriority, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "blue",
  HIGH: "amber",
  URGENT: "red",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  DRAFT: "neutral",
  SENT: "blue",
  PAID: "green",
  OVERDUE: "red",
  CANCELLED: "neutral",
};
