"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import { invalid, toActionState, type ActionState } from "@/lib/actions";
import { prisma } from "@/lib/db/prisma";
import { resetPasswordSchema } from "@/lib/validation/auth";

export async function resetPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  const { token, password } = parsed.data;

  try {
    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
      select: { id: true, email: true, expiresAt: true, usedAt: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return { error: "That reset link has expired. Request a new one." };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { email: record.email },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Any other outstanding link for this address is now void.
      prisma.passwordResetToken.deleteMany({
        where: { email: record.email, usedAt: null },
      }),
    ]);
  } catch (error) {
    return toActionState(error);
  }

  redirect("/auth/login?reset=1");
}
