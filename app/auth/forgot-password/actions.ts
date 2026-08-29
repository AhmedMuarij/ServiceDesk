"use server";

import { randomBytes } from "node:crypto";

import { invalid, toActionState, type ActionState } from "@/lib/actions";
import { prisma } from "@/lib/db/prisma";
import { renderEmail } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/provider";
import { appUrl } from "@/lib/urls";
import { forgotPasswordSchema } from "@/lib/validation/auth";

const TOKEN_TTL_MINUTES = 60;

// Same message whether or not the address exists — otherwise this endpoint
// tells an attacker which emails are registered.
const ALWAYS = {
  success: "If that email has an account, a reset link is on its way.",
} satisfies ActionState;

export async function forgotPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  const { email } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true },
    });
    if (!user) return ALWAYS;

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);

    await prisma.$transaction([
      // One live token per address; requesting again invalidates the last link.
      prisma.passwordResetToken.deleteMany({ where: { email, usedAt: null } }),
      prisma.passwordResetToken.create({ data: { email, token, expiresAt } }),
    ]);

    const { html, text } = renderEmail(
      {
        preheader: "Reset your ServiceOps password",
        heading: "Reset your password",
        paragraphs: [
          `Hi ${user.name ?? "there"},`,
          "Use the link below to choose a new password. It expires in an hour.",
          "If you didn't ask for this, you can ignore this email — your password stays as it is.",
        ],
        cta: {
          label: "Choose a new password",
          url: appUrl(`/auth/reset-password?token=${token}`),
        },
        footer: "Sent by ServiceOps.",
      },
      "ServiceOps",
    );

    // Identity email sends directly rather than through the notification
    // outbox: there is no domain write to protect, it has no tenant, and the
    // person is waiting on the result right now.
    await sendEmail({ to: email, subject: "Reset your ServiceOps password", html, text });

    return ALWAYS;
  } catch (error) {
    return toActionState(error);
  }
}
