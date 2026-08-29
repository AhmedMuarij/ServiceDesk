import { randomBytes } from "node:crypto";

import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { enqueueNotifications } from "@/lib/notifications/enqueue";
import { appUrl } from "@/lib/urls";
import type { Prisma, Role } from "@prisma/client";

import { prisma } from "./prisma";
import { getScope } from "./scope";

const INVITE_TTL_DAYS = 7;

export async function listMembers() {
  const { orgId } = await getScope();
  return prisma.membership.findMany({
    where: { organizationId: orgId },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      status: true,
      inviteEmail: true,
      inviteExpiresAt: true,
      joinedAt: true,
      user: { select: { name: true, email: true } },
      technician: {
        select: { skills: true, isAvailable: true, calendarColor: true, phone: true },
      },
      _count: { select: { assignedJobs: true } },
    },
  });
}

export async function getMember(id: string) {
  const { orgId } = await getScope();
  const member = await prisma.membership.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      role: true,
      status: true,
      inviteEmail: true,
      joinedAt: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      technician: true,
      assignedJobs: {
        where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
        orderBy: { scheduledStart: { sort: "asc", nulls: "last" } },
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          scheduledStart: true,
          customer: { select: { name: true } },
        },
      },
      _count: { select: { assignedJobs: true } },
    },
  });
  if (!member) throw new NotFoundError("Team member not found");
  return member;
}

/** Everyone who can hold a job. Managers do field work in small businesses. */
export async function assignableMembers() {
  const { orgId } = await getScope();
  return prisma.membership.findMany({
    where: { organizationId: orgId, status: "ACTIVE" },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      user: { select: { name: true, email: true } },
      technician: { select: { calendarColor: true, isAvailable: true } },
    },
  });
}

export async function inviteMember(email: string, role: Role) {
  const { orgId, membershipId, role: actorRole } = await getScope();

  // Only an owner may mint another owner.
  if (role === "OWNER" && actorRole !== "OWNER") {
    throw new ForbiddenError("Only an owner can invite another owner.");
  }

  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email },
      select: { id: true, name: true },
    });

    if (existingUser) {
      const already = await tx.membership.findFirst({
        where: { organizationId: orgId, userId: existingUser.id },
        select: { id: true },
      });
      if (already) throw new ForbiddenError("They're already on your team.");
    }

    const pending = await tx.membership.findFirst({
      where: { organizationId: orgId, inviteEmail: email, status: "INVITED" },
      select: { id: true },
    });

    const token = randomBytes(32).toString("hex");
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

    // Re-inviting refreshes the existing invitation rather than stacking rows.
    const membership = pending
      ? await tx.membership.update({
          where: { id: pending.id },
          data: { role, inviteToken: token, inviteExpiresAt, invitedById: membershipId },
          select: { id: true },
        })
      : await tx.membership.create({
          data: {
            organizationId: orgId,
            role,
            status: "INVITED",
            inviteEmail: email,
            inviteToken: token,
            inviteExpiresAt,
            invitedById: membershipId,
          },
          select: { id: true },
        });

    const org = await tx.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true },
    });

    await enqueueNotifications(tx, {
      organizationId: orgId,
      type: "TEAM_INVITE",
      subject: `${org.name} invited you to ServiceOps`,
      payload: {
        orgName: org.name,
        role,
        inviteUrl: appUrl(`/invite/${token}`),
        inviteeName: existingUser?.name ?? null,
      },
      recipients: [{ kind: "TECHNICIAN", email, name: existingUser?.name }],
    });

    return membership;
  });
}

/** Reads an invite by token. Not org-scoped — the token is the credential. */
export async function findInvite(token: string) {
  return prisma.membership.findFirst({
    where: { inviteToken: token, status: "INVITED" },
    select: {
      id: true,
      role: true,
      inviteEmail: true,
      inviteExpiresAt: true,
      organization: { select: { name: true } },
    },
  });
}

export async function acceptInvite(token: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const invite = await tx.membership.findFirst({
      where: { inviteToken: token, status: "INVITED" },
      select: { id: true, organizationId: true, inviteExpiresAt: true, role: true },
    });
    if (!invite) throw new NotFoundError("That invitation is no longer valid.");
    if (invite.inviteExpiresAt && invite.inviteExpiresAt < new Date()) {
      throw new NotFoundError("That invitation has expired. Ask for a new one.");
    }

    const clash = await tx.membership.findFirst({
      where: { organizationId: invite.organizationId, userId },
      select: { id: true },
    });
    if (clash) throw new ForbiddenError("You're already a member of that workspace.");

    const membership = await tx.membership.update({
      where: { id: invite.id },
      data: {
        userId,
        status: "ACTIVE",
        joinedAt: new Date(),
        inviteToken: null,
        inviteExpiresAt: null,
      },
      select: { id: true, role: true },
    });

    if (membership.role === "TECHNICIAN") {
      await tx.technicianProfile.upsert({
        where: { membershipId: membership.id },
        create: { membershipId: membership.id },
        update: {},
      });
    }

    return membership;
  });
}

export async function updateMemberRole(id: string, role: Role) {
  const { orgId, membershipId, role: actorRole } = await getScope();

  if (id === membershipId) throw new ForbiddenError("You can't change your own role.");
  if ((role === "OWNER" || actorRole !== "OWNER") && role === "OWNER") {
    throw new ForbiddenError("Only an owner can promote someone to owner.");
  }

  const target = await prisma.membership.findFirst({
    where: { id, organizationId: orgId },
    select: { role: true },
  });
  if (!target) throw new NotFoundError("Team member not found");
  if (target.role === "OWNER" && actorRole !== "OWNER") {
    throw new ForbiddenError("Only an owner can change another owner.");
  }

  await ensureAnotherOwnerRemains(orgId, id, target.role, role);

  await prisma.membership.update({ where: { id }, data: { role } });

  if (role === "TECHNICIAN") {
    await prisma.technicianProfile.upsert({
      where: { membershipId: id },
      create: { membershipId: id },
      update: {},
    });
  }
}

export async function setMemberStatus(id: string, suspended: boolean) {
  const { orgId, membershipId } = await getScope();
  if (id === membershipId) throw new ForbiddenError("You can't suspend yourself.");

  const target = await prisma.membership.findFirst({
    where: { id, organizationId: orgId },
    select: { role: true, status: true },
  });
  if (!target) throw new NotFoundError("Team member not found");

  if (suspended) {
    await ensureAnotherOwnerRemains(orgId, id, target.role, "TECHNICIAN");
  }

  await prisma.membership.update({
    where: { id },
    data: { status: suspended ? "SUSPENDED" : "ACTIVE" },
  });
}

export async function cancelInvite(id: string) {
  const { orgId } = await getScope();
  const { count } = await prisma.membership.deleteMany({
    where: { id, organizationId: orgId, status: "INVITED" },
  });
  if (count === 0) throw new NotFoundError("Invitation not found");
}

export async function updateTechnicianProfile(
  id: string,
  input: { phone?: string; skills: string[]; maxJobsPerDay: number; isAvailable: boolean },
) {
  const { orgId } = await getScope();
  const member = await prisma.membership.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  if (!member) throw new NotFoundError("Team member not found");

  const data = {
    phone: input.phone ?? null,
    skills: input.skills,
    maxJobsPerDay: input.maxJobsPerDay,
    isAvailable: input.isAvailable,
  } satisfies Prisma.TechnicianProfileUncheckedUpdateInput;

  await prisma.technicianProfile.upsert({
    where: { membershipId: id },
    create: { membershipId: id, ...data },
    update: data,
  });
}

/** An organization must never end up with nobody who can administer it. */
async function ensureAnotherOwnerRemains(
  orgId: string,
  membershipId: string,
  currentRole: Role,
  nextRole: Role,
) {
  if (currentRole !== "OWNER" || nextRole === "OWNER") return;
  const owners = await prisma.membership.count({
    where: {
      organizationId: orgId,
      role: "OWNER",
      status: "ACTIVE",
      id: { not: membershipId },
    },
  });
  if (owners === 0) {
    throw new ForbiddenError("Promote someone else to owner first — an organization needs one.");
  }
}
