import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/auth">) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
        ServiceOps
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
