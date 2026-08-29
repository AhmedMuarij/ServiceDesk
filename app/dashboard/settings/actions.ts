"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { invalid, toActionState, type ActionState } from "@/lib/actions";
import { prisma } from "@/lib/db/prisma";
import { getScope, requireRole } from "@/lib/db/scope";
import { changePasswordSchema, profileSchema } from "@/lib/validation/auth";
import { companySettingsSchema } from "@/lib/validation/organization";

export async function saveCompanySettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = companySettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    const { orgId } = await requireRole("ADMIN");
    const { name, email, phone, addressLine, city, defaultTaxPercent, ...rest } =
      parsed.data;

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        name,
        email: email || null,
        phone: phone || null,
        addressLine: addressLine || null,
        city: city || null,
        ...rest,
        defaultTaxRateBps: Math.round(defaultTaxPercent * 100),
        invoiceFooter: rest.invoiceFooter || null,
      },
    });
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath("/dashboard/settings/company");
  revalidatePath("/dashboard");
  return { success: "Company settings saved." };
}

export async function saveProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    const { userId } = await getScope();
    await prisma.user.update({
      where: { id: userId },
      data: { name: parsed.data.name },
    });
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath("/dashboard/settings/profile");
  // The name in the sidebar comes from the session token, which only refreshes
  // on the next sign-in.
  return { success: "Saved. Your display name updates when you next sign in." };
}

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    const { userId } = await getScope();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash) {
      return { error: "This account has no password set." };
    }

    const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok) {
      return {
        error: "That's not your current password.",
        fieldErrors: { currentPassword: ["Incorrect"] },
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) },
    });
  } catch (error) {
    return toActionState(error);
  }

  return { success: "Password changed." };
}
