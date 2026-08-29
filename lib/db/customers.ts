import { NotFoundError } from "@/lib/errors";
import type { CustomerInput } from "@/lib/validation/customer";

import { prisma } from "./prisma";
import { getScope } from "./scope";

export const CUSTOMERS_PER_PAGE = 20;

/**
 * Every function here opens with getScope() and puts organizationId in the
 * where clause. findFirst rather than findUnique on purpose: a cross-tenant id
 * returns null, which becomes a 404, so a probe learns nothing.
 */

export async function listCustomers({
  query = "",
  page = 1,
  includeArchived = false,
}: {
  query?: string;
  page?: number;
  includeArchived?: boolean;
} = {}) {
  const { orgId } = await getScope();
  const trimmed = query.trim();

  const where = {
    organizationId: orgId,
    ...(includeArchived ? {} : { archivedAt: null }),
    ...(trimmed
      ? {
          OR: [
            { name: { contains: trimmed, mode: "insensitive" as const } },
            { phone: { contains: trimmed, mode: "insensitive" as const } },
            { email: { contains: trimmed, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * CUSTOMERS_PER_PAGE,
      take: CUSTOMERS_PER_PAGE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        archivedAt: true,
        _count: { select: { jobs: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    customers,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / CUSTOMERS_PER_PAGE)),
  };
}

export async function getCustomer(id: string) {
  const { orgId } = await getScope();
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!customer) throw new NotFoundError("Customer not found");
  return customer;
}

/** The customer profile: contact details plus full service history. */
export async function getCustomerProfile(id: string) {
  const { orgId } = await getScope();

  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: orgId },
    include: {
      jobs: {
        orderBy: [{ scheduledStart: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          priority: true,
          scheduledStart: true,
          serviceType: { select: { name: true } },
          assignedTo: { select: { user: { select: { name: true } } } },
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          number: true,
          status: true,
          totalCents: true,
          currency: true,
          dueAt: true,
        },
      },
    },
  });

  if (!customer) throw new NotFoundError("Customer not found");
  return customer;
}

export async function createCustomer(input: CustomerInput) {
  const { orgId } = await getScope();
  return prisma.customer.create({
    data: { ...input, organizationId: orgId },
    select: { id: true },
  });
}

export async function updateCustomer(id: string, input: CustomerInput) {
  const { orgId } = await getScope();
  // updateMany so the org filter is part of the write, not a prior read.
  const { count } = await prisma.customer.updateMany({
    where: { id, organizationId: orgId },
    data: {
      ...input,
      email: input.email ?? null,
      phone: input.phone ?? null,
      addressLine: input.addressLine ?? null,
      city: input.city ?? null,
      notes: input.notes ?? null,
    },
  });
  if (count === 0) throw new NotFoundError("Customer not found");
}

/** Archive, never delete — jobs and invoices must keep resolving. */
export async function setCustomerArchived(id: string, archived: boolean) {
  const { orgId } = await getScope();
  const { count } = await prisma.customer.updateMany({
    where: { id, organizationId: orgId },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (count === 0) throw new NotFoundError("Customer not found");
}

/** For the job form's customer picker. */
export async function customerOptions() {
  const { orgId } = await getScope();
  return prisma.customer.findMany({
    where: { organizationId: orgId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true, addressLine: true, city: true },
  });
}
