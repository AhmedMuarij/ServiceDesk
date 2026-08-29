import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { findInvite } from "@/lib/db/team";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/roles";

import { AcceptInviteButton, NewUserInviteForm } from "./invite-forms";

export const metadata: Metadata = { title: "Accept invitation" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
        ServiceOps
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function Dead({ message }: { message: string }) {
  return (
    <Shell>
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">This invitation isn&apos;t valid</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{message}</p>
        <Link href="/auth/login" className="text-sm underline underline-offset-4">
          Go to sign in
        </Link>
      </div>
    </Shell>
  );
}

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;

  const invite = await findInvite(token);
  if (!invite?.inviteEmail) {
    return <Dead message="It may have been cancelled, or already accepted." />;
  }
  if (invite.inviteExpiresAt && invite.inviteExpiresAt < new Date()) {
    return <Dead message="Invitations expire after seven days. Ask for a fresh one." />;
  }

  const session = await auth();
  const header = (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-xs tracking-widest text-neutral-500 uppercase">
        Invitation
      </p>
      <h1 className="text-xl font-semibold tracking-tight">
        Join {invite.organization.name}
      </h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        As a {ROLE_LABEL[invite.role].toLowerCase()} — {ROLE_DESCRIPTION[invite.role].toLowerCase()}
      </p>
    </div>
  );

  if (session?.user?.id) {
    const signedInAs = session.user.email?.toLowerCase();
    if (signedInAs && signedInAs !== invite.inviteEmail.toLowerCase()) {
      return (
        <Shell>
          <div className="flex flex-col gap-3">
            {header}
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
              This invitation is for <strong>{invite.inviteEmail}</strong>, but
              you&apos;re signed in as {signedInAs}. Sign out and open the link again.
            </p>
          </div>
        </Shell>
      );
    }

    return (
      <Shell>
        <div className="flex flex-col gap-5">
          {header}
          <AcceptInviteButton token={token} />
        </div>
      </Shell>
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: invite.inviteEmail },
    select: { id: true },
  });

  if (existing) {
    return (
      <Shell>
        <div className="flex flex-col gap-5">
          {header}
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            You already have a ServiceOps account. Sign in and this page will let
            you accept.
          </p>
          <Link
            href={`/auth/login?callbackUrl=/invite/${token}`}
            className="text-sm underline underline-offset-4"
          >
            Sign in as {invite.inviteEmail}
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-5">
        {header}
        <NewUserInviteForm token={token} email={invite.inviteEmail} />
      </div>
    </Shell>
  );
}
