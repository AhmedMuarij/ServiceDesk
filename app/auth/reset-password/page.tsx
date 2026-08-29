import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage(props: PageProps<"/auth/reset-password">) {
  const { token } = await props.searchParams;

  if (typeof token !== "string" || !token) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">That link is incomplete</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Reset links expire after an hour. Request a fresh one and try again.
        </p>
        <Link href="/auth/forgot-password" className="text-sm underline underline-offset-4">
          Request a new link
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
