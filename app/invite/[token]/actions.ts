"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { auth, signIn, signOut } from "@/auth";
import { invalid, toActionState, type ActionState } from "@/lib/actions";
import { prisma } from "@/lib/db/prisma";
import { acceptInvite, findInvite } from "@/lib/db/team";
import { z } from "zod";

const newUserSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1, "Enter your name").max(120),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

/** Signed-in user accepting an invitation addressed to them. */
export async function acceptInviteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = formData.get("token");
  if (typeof token !== "string" || !token) return { error: "Missing invitation." };

  let hadMembership = false;
  try {
    const session = await auth();
    if (!session?.user?.id) redirect(`/auth/login?callbackUrl=/invite/${token}`);

    hadMembership = Boolean(session.user.membershipId);
    await acceptInvite(token, session.user.id);
  } catch (error) {
    return toActionState(error);
  }

  // With no prior membership the jwt callback re-resolves on the next request
  // and picks this one up. Someone who already belonged to another workspace
  // needs a fresh token, and Module 1 has no workspace switcher — so sign them
  // out and let them come back in.
  if (hadMembership) {
    await signOut({ redirectTo: "/auth/login?invited=1" });
  }

  redirect("/dashboard");
}

/** No account yet: create one from the invitation, then sign in. */
export async function acceptInviteAsNewUserAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = newUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  const { token, name, password } = parsed.data;
  let email: string;

  try {
    const invite = await findInvite(token);
    if (!invite?.inviteEmail) {
      return { error: "That invitation is no longer valid. Ask for a new one." };
    }
    if (invite.inviteExpiresAt && invite.inviteExpiresAt < new Date()) {
      return { error: "That invitation has expired. Ask for a new one." };
    }
    email = invite.inviteEmail;

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return { error: "You already have an account — sign in to accept." };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: { id: true },
    });

    await acceptInvite(token, user.id);
  } catch (error) {
    return toActionState(error);
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/auth/login?invited=1");
    throw error;
  }

  return {};
}
