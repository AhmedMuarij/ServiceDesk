"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { invalid, toActionState, type ActionState } from "@/lib/actions";
import { prisma } from "@/lib/db/prisma";
import { NOTIFICATION_DEFAULTS } from "@/lib/notifications/defaults";
import { slugify } from "@/lib/slug";
import { registerSchema } from "@/lib/validation/auth";

export async function registerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  const { name, companyName, email, password } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return {
        error: "An account with that email already exists.",
        fieldErrors: { email: ["Already registered — try signing in"] },
      };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // The account, the workspace, and the ownership of it are one fact. If any
    // part fails, none of it should exist.
    await prisma.$transaction(async (tx) => {
      const base = slugify(companyName);
      let slug = base;
      for (let n = 2; ; n++) {
        const clash = await tx.organization.findUnique({
          where: { slug },
          select: { id: true },
        });
        if (!clash) break;
        slug = `${base}-${n}`;
      }

      const user = await tx.user.create({
        data: { name, email, passwordHash },
        select: { id: true },
      });

      const organization = await tx.organization.create({
        data: { name: companyName, slug, email },
        select: { id: true },
      });

      await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      await tx.notificationPreference.createMany({
        data: NOTIFICATION_DEFAULTS.map((preference) => ({
          ...preference,
          organizationId: organization.id,
        })),
      });
    });
  } catch (error) {
    return toActionState(error);
  }

  // On success signIn throws NEXT_REDIRECT, which must propagate.
  try {
    await signIn("credentials", { email, password, redirectTo: "/onboarding" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/auth/login?registered=1");
    throw error;
  }

  return {};
}
