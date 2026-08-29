import { Badge } from "@/components/ui/primitives";
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  PRIORITY_LABEL,
  PRIORITY_TONE,
} from "@/lib/status";
import type { InvoiceStatus, JobPriority, JobStatus } from "@prisma/client";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={JOB_STATUS_TONE[status]}>{JOB_STATUS_LABEL[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: JobPriority }) {
  // Medium is the default and carries no signal — showing it is just noise.
  if (priority === "MEDIUM") return null;
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge tone={INVOICE_STATUS_TONE[status]}>{INVOICE_STATUS_LABEL[status]}</Badge>;
}
