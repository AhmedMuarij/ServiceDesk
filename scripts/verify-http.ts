/**
 * End-to-end checks against a running server: tenant isolation and role
 * enforcement over real HTTP with real sessions, plus the cron endpoints.
 *
 *   npm run dev            # in one terminal
 *   npm run verify:http    # in another
 *
 * Requires the demo data (`npm run db:seed`) and the second tenant that
 * `npm run verify` creates.
 */
// Marks this file as a module, so its locals do not collide with the other
// scripts under tsc.
export {};

process.loadEnvFile?.();

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) pass++;
  else fail++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${label.padEnd(52)} ${ok ? actual : `got ${actual}, want ${expected}`}`,
  );
}

/** The smallest cookie jar that works: name=value, last write wins. */
class Jar {
  private cookies = new Map<string, string>();

  absorb(response: Response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1));
    }
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function get(path: string, jar?: Jar) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: jar ? { cookie: jar.header() } : {},
  });
  jar?.absorb(response);
  return response;
}

async function status(path: string, jar?: Jar) {
  return (await get(path, jar)).status;
}

async function login(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfResponse = await fetch(`${BASE}/api/auth/csrf`);
  jar.absorb(csrfResponse);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: jar.header(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ csrfToken, email, password }),
  });
  jar.absorb(response);
  return jar;
}

async function main() {
  const { prisma } = await import("../lib/db/prisma");

  const a = await prisma.organization.findUniqueOrThrow({
    where: { slug: "karachi-cool" },
    select: { id: true },
  });
  const b = await prisma.organization.findUnique({
    where: { slug: "lahore-electric" },
    select: { id: true },
  });
  if (!b) {
    console.error("Run `npm run verify` first — it creates the second tenant.");
    process.exit(1);
  }

  const [jobA, jobB, customerB] = await Promise.all([
    prisma.job.findFirstOrThrow({ where: { organizationId: a.id }, select: { id: true } }),
    prisma.job.findFirstOrThrow({ where: { organizationId: b.id }, select: { id: true } }),
    prisma.customer.findFirstOrThrow({
      where: { organizationId: b.id },
      select: { id: true },
    }),
  ]);

  // Wait for the server rather than failing on a cold start.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await fetch(`${BASE}/`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log("\n=== Anonymous ===");
  check("GET / is public", await status("/"), 200);
  check("GET /auth/login is public", await status("/auth/login"), 200);
  check("GET /dashboard redirects", await status("/dashboard"), 307);
  check("GET /my/jobs redirects", await status("/my/jobs"), 307);
  check(
    "dispatcher rejects a request with no secret",
    (await fetch(`${BASE}/api/notifications/dispatch`, { method: "POST" })).status,
    401,
  );

  console.log("\n=== Owner of org A ===");
  const owner = await login("owner@serviceops.demo", "demo1234");
  for (const path of [
    "/dashboard",
    "/dashboard/customers",
    "/dashboard/jobs",
    "/dashboard/schedule",
    "/dashboard/schedule?view=week",
    "/dashboard/invoices",
    "/dashboard/team",
    "/dashboard/settings/company",
    "/dashboard/settings/notifications",
    "/dashboard/settings/services",
  ]) {
    check(`GET ${path}`, await status(path, owner), 200);
  }

  console.log("\n=== Tenant isolation ===");
  check("org A opening org B's job is a 404", await status(`/dashboard/jobs/${jobB.id}`, owner), 404);
  check(
    "org A opening org B's customer is a 404",
    await status(`/dashboard/customers/${customerB.id}`, owner),
    404,
  );
  check(
    "a made-up id is a 404",
    await status("/dashboard/jobs/cmzzzzzzzzzzzzzzzzzzzzzzz", owner),
    404,
  );

  console.log("\n=== Technician ===");
  const tech = await login("hamza@serviceops.demo", "demo1234");
  check("GET /my/jobs", await status("/my/jobs", tech), 200);
  check("GET /dashboard is bounced", await status("/dashboard", tech), 307);
  check("GET /dashboard/invoices is bounced", await status("/dashboard/invoices", tech), 307);
  check("GET /dashboard/team is bounced", await status("/dashboard/team", tech), 307);
  console.log(
    `  note  bounce target: ${(await get("/dashboard", tech)).headers.get("location")}`,
  );

  console.log("\n=== Owner of org B ===");
  const otherOwner = await login("owner@lahore.demo", "demo1234");
  check("GET their own job", await status(`/dashboard/jobs/${jobB.id}`, otherOwner), 200);
  check(
    "org B opening org A's job is a 404",
    await status(`/dashboard/jobs/${jobA.id}`, otherOwner),
    404,
  );

  console.log("\n=== Cron endpoints ===");
  const secret = process.env.CRON_SECRET ?? "";
  const cron = (path: string, token: string) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }).then((response) => response.status);

  check("dispatcher accepts the secret", await cron("/api/notifications/dispatch", secret), 200);
  check("reminders accept the secret", await cron("/api/cron/reminders", secret), 200);
  check("reminders reject a wrong secret", await cron("/api/cron/reminders", "wrong"), 401);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
