import { NOTIFICATION_DEFAULTS } from "@/lib/notifications/defaults";
import type { NotificationType } from "@prisma/client";

import { prisma } from "./prisma";
import { getScope } from "./scope";

export async function listPreferences() {
  const { orgId } = await getScope();
  const rows = await prisma.notificationPreference.findMany({
    where: { organizationId: orgId },
  });

  const byType = new Map(rows.map((row) => [row.type, row]));

  // An org created before a type existed simply has no row; fall back to the
  // default rather than showing an empty toggle.
  return NOTIFICATION_DEFAULTS.map((fallback) => {
    const row = byType.get(fallback.type);
    return {
      type: fallback.type,
      enabled: row?.enabled ?? fallback.enabled,
      notifyCustomer: row?.notifyCustomer ?? fallback.notifyCustomer,
      notifyTechnician: row?.notifyTechnician ?? fallback.notifyTechnician,
      notifyOrg: row?.notifyOrg ?? fallback.notifyOrg,
    };
  });
}

export type PreferenceInput = {
  type: NotificationType;
  enabled: boolean;
  notifyCustomer: boolean;
  notifyTechnician: boolean;
  notifyOrg: boolean;
};

export async function savePreferences(preferences: PreferenceInput[]) {
  const { orgId } = await getScope();

  await prisma.$transaction(
    preferences.map(({ type, ...values }) =>
      prisma.notificationPreference.upsert({
        where: { organizationId_type: { organizationId: orgId, type } },
        create: { organizationId: orgId, type, ...values },
        update: values,
      }),
    ),
  );
}

/** Recent outbox activity, so a stuck email is something you can see. */
export async function recentNotifications(take = 25) {
  const { orgId } = await getScope();
  return prisma.notification.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      status: true,
      toEmail: true,
      subject: true,
      attempts: true,
      lastError: true,
      sentAt: true,
      createdAt: true,
    },
  });
}

export async function notificationCounts() {
  const { orgId } = await getScope();
  const rows = await prisma.notification.groupBy({
    by: ["status"],
    where: { organizationId: orgId },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}
