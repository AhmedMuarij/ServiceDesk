import { cache } from "react";

import { NotFoundError } from "@/lib/errors";

import { prisma } from "./prisma";
import { getScope } from "./scope";

/**
 * Display settings — timezone and currency — are needed by almost every page.
 * React's cache() collapses them to one query per request.
 */
export const getOrgSettings = cache(async () => {
  const { orgId } = await getScope();
  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      phone: true,
      addressLine: true,
      city: true,
      country: true,
      logoUrl: true,
      timezone: true,
      currency: true,
      invoicePrefix: true,
      invoiceDueDays: true,
      invoiceFooter: true,
      defaultTaxRateBps: true,
    },
  });
  if (!organization) throw new NotFoundError("Organization not found");
  return organization;
});

export type OrgSettings = Awaited<ReturnType<typeof getOrgSettings>>;
