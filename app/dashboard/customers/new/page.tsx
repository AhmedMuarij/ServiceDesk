import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/primitives";

import { createCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "New customer" };

export default function NewCustomerPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="New customer"
        description="Only the name is required — the rest can follow."
      />
      <CustomerForm
        action={createCustomerAction}
        submitLabel="Create customer"
        cancelHref="/dashboard/customers"
      />
    </div>
  );
}
