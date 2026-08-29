/**
 * Placeholder for a route that exists in the skeleton but isn't built yet.
 * Keeps every route in docs/02-screens-and-flows.md navigable from day one,
 * and gets deleted as the last stub is replaced.
 */
export function RouteStub({
  title,
  route,
  step,
}: {
  title: string;
  route: string;
  step: number;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
        Build order · step {String(step).padStart(2, "0")}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
        {title}
      </h1>
      <p className="font-mono text-sm text-neutral-500">{route}</p>
      <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        This route is scaffolded but not implemented. See{" "}
        <span className="font-mono text-xs">docs/02-screens-and-flows.md</span>{" "}
        for what it does and when it gets built.
      </p>
    </div>
  );
}
