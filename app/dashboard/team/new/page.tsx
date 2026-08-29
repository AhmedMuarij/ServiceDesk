import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/primitives";
import { requireDashboardAccess } from "@/lib/db/scope";
import { ASSIGNABLE_ROLES } from "@/lib/roles";

import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Invite a teammate" };

export default async function InviteMemberPage() {
  const { role } = await requireDashboardAccess("ADMIN");

  // Only an owner can mint another owner.
  const roles = role === "OWNER" ? (["OWNER", ...ASSIGNABLE_ROLES] as const) : ASSIGNABLE_ROLES;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invite a teammate"
        description="They choose their own password when they accept."
      />
      <InviteForm roles={[...roles]} />
    </div>
  );
}
