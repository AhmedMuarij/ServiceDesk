import { customerOptions } from "@/lib/db/customers";
import { serviceTypeOptions } from "@/lib/db/service-types";
import { assignableMembers } from "@/lib/db/team";
import { ROLE_LABEL } from "@/lib/roles";

/** Everything the job form's three pickers need, in one round trip. */
export async function loadJobFormOptions() {
  const [customers, services, members] = await Promise.all([
    customerOptions(),
    serviceTypeOptions(),
    assignableMembers(),
  ]);

  return {
    customers,
    services,
    members: members.map((member) => ({
      id: member.id,
      role: member.role,
      label: `${member.user?.name ?? member.user?.email ?? "Unknown"} · ${ROLE_LABEL[member.role]}`,
    })),
  };
}
