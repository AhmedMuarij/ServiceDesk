import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { listCustomers } from "@/lib/db/customers";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage(props: PageProps<"/dashboard/customers">) {
  const search = await props.searchParams;
  const query = typeof search.q === "string" ? search.q : "";
  const page = Math.max(1, Number(search.page) || 1);

  const { customers, total, pageCount } = await listCustomers({ query, page });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        description={`${total} ${total === 1 ? "customer" : "customers"}`}
        actions={<LinkButton href="/dashboard/customers/new">New customer</LinkButton>}
      />

      <form className="flex max-w-sm gap-2">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Search name, phone or email"
          aria-label="Search customers"
        />
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Search
        </button>
      </form>

      {customers.length === 0 ? (
        <EmptyState
          title={query ? "No matches" : "No customers yet"}
          description={
            query
              ? `Nothing matches "${query}". Try a partial phone number.`
              : "Add the first one, then you can raise a job against them."
          }
          action={
            query ? (
              <Link href="/dashboard/customers" className="text-sm underline underline-offset-4">
                Clear search
              </Link>
            ) : (
              <LinkButton href="/dashboard/customers/new">Add a customer</LinkButton>
            )
          }
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th>City</Th>
                <Th className="text-right">Jobs</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <Td>
                    <Link
                      href={`/dashboard/customers/${customer.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {customer.name}
                    </Link>
                  </Td>
                  <Td className="text-neutral-600 dark:text-neutral-400">
                    {customer.phone ?? "—"}
                  </Td>
                  <Td className="text-neutral-600 dark:text-neutral-400">
                    {customer.email ?? "—"}
                  </Td>
                  <Td className="text-neutral-600 dark:text-neutral-400">
                    {customer.city ?? "—"}
                  </Td>
                  <Td className="text-right tabular-nums">{customer._count.jobs}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={`/dashboard/customers?${new URLSearchParams({ q: query, page: String(page - 1) })}`}
              className="underline underline-offset-4"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-neutral-500">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/dashboard/customers?${new URLSearchParams({ q: query, page: String(page + 1) })}`}
              className="underline underline-offset-4"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
