import type { Metadata } from "next";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";
import { listServiceTypes } from "@/lib/db/service-types";
import { formatMoney } from "@/lib/money";

import { toggleServiceTypeAction } from "./actions";
import { NewServiceTypeForm } from "./service-type-form";

export const metadata: Metadata = { title: "Service types" };

export default async function ServiceTypesPage() {
  await requireDashboardAccess("ADMIN");
  const [org, services] = await Promise.all([getOrgSettings(), listServiceTypes()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Service types"
        description="What you sell. Every job is one of these, and each carries the price that prefills its invoice."
      />

      <Card className="p-5">
        <NewServiceTypeForm currency={org.currency} />
      </Card>

      {services.length === 0 ? (
        <EmptyState
          title="No services yet"
          description="Add the two or three things you do most often. You can add more any time."
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="text-right">Duration</Th>
                <Th className="text-right">Default price</Th>
                <Th className="text-right">Jobs</Th>
                <Th className="text-right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id}>
                  <Td className="font-medium">{service.name}</Td>
                  <Td className="text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                    {service.defaultDurationMinutes} min
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(service.defaultPriceCents, org.currency)}
                  </Td>
                  <Td className="text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                    {service._count.jobs}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {service.isActive ? null : <Badge tone="neutral">Retired</Badge>}
                      <form action={toggleServiceTypeAction}>
                        <input type="hidden" name="id" value={service.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(!service.isActive)}
                        />
                        <Button variant="ghost" size="sm" type="submit">
                          {service.isActive ? "Retire" : "Restore"}
                        </Button>
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <p className="text-xs text-neutral-500">
        Retiring a service hides it from new jobs. Existing jobs keep pointing at it,
        so history and reports stay correct.
      </p>
    </div>
  );
}
