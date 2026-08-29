import { NotFoundError } from "@/lib/errors";

import { prisma } from "./prisma";
import { getScope } from "./scope";

export async function listServiceTypes({ includeInactive = true } = {}) {
  const { orgId } = await getScope();
  return prisma.serviceType.findMany({
    where: {
      organizationId: orgId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      defaultDurationMinutes: true,
      defaultPriceCents: true,
      isActive: true,
      _count: { select: { jobs: true } },
    },
  });
}

/** Active only — a retired service shouldn't appear on a new job. */
export async function serviceTypeOptions() {
  const { orgId } = await getScope();
  return prisma.serviceType.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      defaultDurationMinutes: true,
      defaultPriceCents: true,
    },
  });
}

export async function createServiceType(input: {
  name: string;
  defaultDurationMinutes: number;
  defaultPriceCents: number;
}) {
  const { orgId } = await getScope();
  return prisma.serviceType.create({
    data: { ...input, organizationId: orgId },
    select: { id: true },
  });
}

export async function updateServiceType(
  id: string,
  input: { name: string; defaultDurationMinutes: number; defaultPriceCents: number },
) {
  const { orgId } = await getScope();
  const { count } = await prisma.serviceType.updateMany({
    where: { id, organizationId: orgId },
    data: input,
  });
  if (count === 0) throw new NotFoundError("Service type not found");
}

/** Retire, never delete — existing jobs keep pointing at it. */
export async function setServiceTypeActive(id: string, isActive: boolean) {
  const { orgId } = await getScope();
  const { count } = await prisma.serviceType.updateMany({
    where: { id, organizationId: orgId },
    data: { isActive },
  });
  if (count === 0) throw new NotFoundError("Service type not found");
}
