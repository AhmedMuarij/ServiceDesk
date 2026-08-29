"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { invalid, type ActionState } from "@/lib/actions";
import { loginSchema } from "@/lib/validation/auth";

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    // Technicians are bounced to /my/jobs by the authorized callback in
    // auth.config.ts, so one destination works for every role.
    await signIn("credentials", { ...parsed.data, redirectTo: "/dashboard" });
  } catch (error) {
    // Deliberately vague: saying "no such account" confirms which emails exist.
    if (error instanceof AuthError) {
      return { error: "Email or password is incorrect." };
    }
    throw error;
  }

  return {};
}
