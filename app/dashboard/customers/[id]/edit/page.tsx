import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/primitives";
import { getCustomer } from "@/lib/db/customers";
import { NotFoundError } from "@/lib/errors";

import { updateCustomerAction } from "../../actions";
import { CustomerForm } from "../../customer-form";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage(
  props: PageProps<"/dashboard/customers/[id]/edit">,
) {
  const { id } = await props.params;

  // The try wraps only the fetch. JSX built inside a try/catch would not have
  // its render errors caught anyway — that's what error boundaries are for.
  let customer: Awaited<ReturnType<typeof getCustomer>>;
  try {
    customer = await getCustomer(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Edit ${customer.name}`} />
      <CustomerForm
        action={updateCustomerAction}
        customer={customer}
        submitLabel="Save changes"
        cancelHref={`/dashboard/customers/${id}`}
      />
    </div>
  );
}
