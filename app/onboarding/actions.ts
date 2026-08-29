"use server";

import { redirect } from "next/navigation";

import { invalid, toActionState, type ActionState } from "@/lib/actions";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/db/scope";
import { onboardingSchema } from "@/lib/validation/organization";

export async function completeOnboardingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  const { timezone, currency, service1, service2, service3 } = parsed.data;

  try {
    const { orgId } = await requireRole("ADMIN");

    const names = [service1, service2, service3]
      .map((name) => name?.trim())
      .filter((name): name is string => Boolean(name));

    // Two people typing the same service name should not create two rows.
    const unique = [...new Set(names)];

    await prisma.$transaction([
      prisma.organization.update({
        where: { id: orgId },
        data: { timezone, currency },
      }),
      prisma.serviceType.createMany({
        data: unique.map((name) => ({ organizationId: orgId, name })),
        skipDuplicates: true,
      }),
    ]);
  } catch (error) {
    return toActionState(error);
  }

  redirect("/dashboard");
}
