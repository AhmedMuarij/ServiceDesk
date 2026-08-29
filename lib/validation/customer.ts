import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  email: z
    .union([z.literal(""), z.email("Enter a valid email address")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  phone: optionalText(40),
  addressLine: optionalText(200),
  city: optionalText(80),
  notes: optionalText(2000),
});

export type CustomerInput = z.infer<typeof customerSchema>;
