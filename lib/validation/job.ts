import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalId = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

export const jobSchema = z.object({
  customerId: z.string().min(1, "Pick a customer"),
  serviceTypeId: optionalId,
  title: z.string().trim().min(1, "Describe the job in a few words").max(160),
  description: optionalText(2000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  // Scheduling is two inputs; the action turns them into a UTC instant using
  // the organization's time zone.
  scheduledDate: optionalText(10),
  scheduledTime: optionalText(5),
  durationMinutes: z.coerce.number().int().min(5).max(1440).optional(),
  assignedMembershipId: optionalId,
  addressLine: optionalText(200),
  city: optionalText(80),
});

export const jobStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum([
    "NEW",
    "SCHEDULED",
    "ASSIGNED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ]),
  note: optionalText(500),
});

export const jobNoteSchema = z.object({
  jobId: z.string().min(1),
  body: z.string().trim().min(1, "Write something").max(2000),
});

export type JobInput = z.infer<typeof jobSchema>;
