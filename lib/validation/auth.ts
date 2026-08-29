import { z } from "zod";

// Normalise before validating — z.email() on a raw string would reject
// "  a@b.com " for the whitespace rather than trimming it first.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));
const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(200, "That password is too long");

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  companyName: z.string().trim().min(1, "Enter your company name").max(120),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password,
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: password,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
