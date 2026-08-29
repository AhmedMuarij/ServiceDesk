import { z } from "zod";

export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "TECHNICIAN"]),
});

export const memberRoleSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "TECHNICIAN"]),
});

export const technicianProfileSchema = z.object({
  id: z.string().min(1),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => (value ? value : undefined)),
  // Comma-separated in the form; matched against service type names.
  skills: z
    .string()
    .max(500)
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean),
    ),
  maxJobsPerDay: z.coerce.number().int().min(1).max(24),
  isAvailable: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((value) => value === "on"),
});

export const acceptInviteSchema = z
  .object({
    token: z.string().min(1),
    name: z.string().trim().min(1, "Enter your name").max(120),
    password: z.string().min(8, "Use at least 8 characters").max(200),
  })
  .or(z.object({ token: z.string().min(1) }));
