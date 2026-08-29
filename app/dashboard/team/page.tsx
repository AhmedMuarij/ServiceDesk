import type { Metadata } from "next";
import Link from "next/link";

import {
  Badge,
  Button,
  Card,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";
import { listMembers } from "@/lib/db/team";
import { formatDate } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/roles";

import { cancelInviteAction, setMemberStatusAction } from "./actions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const scope = await requireDashboardAccess("ADMIN");
  const [members, org] = await Promise.all([listMembers(), getOrgSettings()]);

  const active = members.filter((member) => member.status !== "INVITED");
  const invited = members.filter((member) => member.status === "INVITED");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Team"
        description={`${active.length} ${active.length === 1 ? "member" : "members"}${invited.length ? `, ${invited.length} pending` : ""}`}
        actions={<LinkButton href="/dashboard/team/new">Invite someone</LinkButton>}
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Joined</Th>
              <Th className="text-right">Open jobs</Th>
              <Th className="text-right">Status</Th>
            </tr>
          </thead>
          <tbody>
            {active.map((member) => (
              <tr key={member.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <Td>
                  <Link
                    href={`/dashboard/team/${member.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {member.user?.name ?? member.user?.email ?? "Unknown"}
                  </Link>
                  {member.id === scope.membershipId ? (
                    <span className="ml-2 text-xs text-neutral-500">you</span>
                  ) : null}
                  <span className="block text-xs text-neutral-500">
                    {member.user?.email}
                  </span>
                </Td>
                <Td>{ROLE_LABEL[member.role]}</Td>
                <Td className="text-neutral-600 dark:text-neutral-400">
                  {member.joinedAt ? formatDate(member.joinedAt, org.timezone) : "—"}
                </Td>
                <Td className="text-right tabular-nums">{member._count.assignedJobs}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {member.status === "SUSPENDED" ? (
                      <Badge tone="red">Suspended</Badge>
                    ) : null}
                    {member.id === scope.membershipId ? null : (
                      <form action={setMemberStatusAction}>
                        <input type="hidden" name="id" value={member.id} />
                        <input
                          type="hidden"
                          name="suspended"
                          value={String(member.status !== "SUSPENDED")}
                        />
                        <Button variant="ghost" size="sm" type="submit">
                          {member.status === "SUSPENDED" ? "Restore" : "Suspend"}
                        </Button>
                      </form>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {invited.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Pending invitations</h2>
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Expires</Th>
                  <Th className="text-right"> </Th>
                </tr>
              </thead>
              <tbody>
                {invited.map((invite) => (
                  <tr key={invite.id}>
                    <Td>{invite.inviteEmail}</Td>
                    <Td>{ROLE_LABEL[invite.role]}</Td>
                    <Td className="text-neutral-600 dark:text-neutral-400">
                      {invite.inviteExpiresAt
                        ? formatDate(invite.inviteExpiresAt, org.timezone)
                        : "—"}
                    </Td>
                    <Td className="text-right">
                      <form action={cancelInviteAction}>
                        <input type="hidden" name="id" value={invite.id} />
                        <Button variant="ghost" size="sm" type="submit">
                          Cancel
                        </Button>
                      </form>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </section>
      ) : null}

      <p className="text-xs text-neutral-500">
        Suspending someone blocks their sign-in but keeps their job history intact
        and correctly attributed.
      </p>
    </div>
  );
}
