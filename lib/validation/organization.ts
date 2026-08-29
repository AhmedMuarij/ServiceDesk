import { z } from "zod";

import { CURRENCY_CODES } from "@/lib/constants";

const currency = z
  .string()
  .refine((value) => CURRENCY_CODES.includes(value), "Pick a supported currency");

const timezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Pick a valid time zone");

export const onboardingSchema = z.object({
  timezone,
  currency,
  // Three optional slots; blank ones are skipped.
  service1: z.string().trim().max(80).optional(),
  service2: z.string().trim().max(80).optional(),
  service3: z.string().trim().max(80).optional(),
});

export const companySettingsSchema = z.object({
  name: z.string().trim().min(1, "Enter a company name").max(120),
  email: z.union([z.literal(""), z.email("Enter a valid email address")]).optional(),
  phone: z.string().trim().max(40).optional(),
  addressLine: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  timezone,
  currency,
  invoicePrefix: z
    .string()
    .trim()
    .min(1, "Enter a prefix")
    .max(8)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  invoiceDueDays: z.coerce.number().int().min(0).max(180),
  // Percent in the UI; the action converts to basis points for storage.
  defaultTaxPercent: z.coerce.number().min(0).max(100),
  invoiceFooter: z.string().trim().max(400).optional(),
});

export const serviceTypeSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  defaultDurationMinutes: z.coerce.number().int().min(5).max(1440),
  defaultPriceMajor: z.coerce.number().min(0).max(10_000_000),
});
