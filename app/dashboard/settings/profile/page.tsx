import type { Metadata } from "next";

import { Card, PageHeader } from "@/components/ui/primitives";
import { requireScope } from "@/lib/db/scope";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/roles";

import { PasswordForm, ProfileForm } from "./profile-forms";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const { userName, userEmail, role, orgName } = await requireScope();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your profile"
        description={`${ROLE_LABEL[role]} at ${orgName} — ${ROLE_DESCRIPTION[role].toLowerCase()}`}
      />
      <Card className="p-5">
        <ProfileForm name={userName} email={userEmail} />
      </Card>
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">Password</h2>
        <PasswordForm />
      </Card>
    </div>
  );
}
