import { redirect } from "next/navigation";

import type { Session } from "next-auth";

import { auth } from "@/auth";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { atLeast } from "@/lib/roles";
import type { Role } from "@prisma/client";

export { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/errors";
export { atLeast } from "@/lib/roles";

/**
 * The active organization for the current request. Every accessor in lib/db/
 * opens by calling this and putting `organizationId` into the where clause —
 * application code must never reach for `prisma.*` on tenant data directly.
 * See docs/03-data-model.md.
 */
export type Scope = {
  userId: string;
  userName: string;
  userEmail: string;
  membershipId: string;
  orgId: string;
  orgName: string;
  role: Role;
};

type SessionUser = Session["user"];

function toScope(user: SessionUser): Scope | null {
  if (!user?.id || !user.membershipId || !user.orgId || !user.role) return null;
  return {
    userId: user.id,
    userName: user.name ?? user.email ?? "Unknown",
    userEmail: user.email ?? "",
    membershipId: user.membershipId,
    orgId: user.orgId,
    orgName: user.orgName,
    role: user.role,
  };
}

/** Throws if there is no session. For server actions, which return errors. */
export async function getScope(): Promise<Scope> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();

  const scope = toScope(session.user);
  if (!scope) throw new UnauthorizedError("No active organization on this account");
  return scope;
}

/** Redirects instead of throwing. For pages, where a redirect is the right UX. */
export async function requireScope(): Promise<Scope> {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const scope = toScope(session.user);
  if (!scope) redirect("/onboarding");
  return scope;
}


/** Throws ForbiddenError. For server actions. */
export async function requireRole(minimum: Role): Promise<Scope> {
  const scope = await getScope();
  if (!atLeast(scope.role, minimum)) throw new ForbiddenError();
  return scope;
}

/** Redirects a technician to their own surface. For dashboard pages. */
export async function requireDashboardAccess(minimum: Role = "MANAGER"): Promise<Scope> {
  const scope = await requireScope();
  if (!atLeast(scope.role, minimum)) redirect("/my/jobs");
  return scope;
}
