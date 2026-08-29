import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  registered: "Your workspace is ready. Sign in to continue.",
  reset: "Password updated. Sign in with your new password.",
  invited: "Sign in to accept your invitation.",
};

export default async function LoginPage(props: PageProps<"/auth/login">) {
  const search = await props.searchParams;
  const key = Object.keys(NOTICES).find((name) => name in search);

  return <LoginForm notice={key ? NOTICES[key] : undefined} />;
}
