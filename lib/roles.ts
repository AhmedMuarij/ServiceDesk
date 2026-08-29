import type { Role } from "@prisma/client";

/** Roles are a ladder: an OWNER can do anything a MANAGER can. */
const RANK: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  TECHNICIAN: 1,
};

export function atLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  TECHNICIAN: "Technician",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  OWNER: "Everything, including billing and other owners.",
  ADMIN: "Manage the team, settings and all jobs.",
  MANAGER: "Create and schedule jobs, manage customers and invoices.",
  TECHNICIAN: "See and update only the jobs assigned to them.",
};

/** Roles an admin may hand out. Owner is reserved to owners. */
export const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "MANAGER", "TECHNICIAN"];
