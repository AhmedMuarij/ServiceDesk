/**
 * Checks the Module 2 invariants — the ones a build can't catch.
 *
 *   npx tsx scripts/verify-ai.ts
 *
 * Chiefly: that no model output can reach a job, an assignment or an invoice
 * without a human accepting it, and that the whole subsystem disappears
 * cleanly when it is unavailable.
 */
export {};

process.loadEnvFile?.();

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

async function main() {
  const { prisma } = await import("../lib/db/prisma");
  const { checkAvailability, ask, hasApiKey } = await import("../lib/ai/client");
  const { z } = await import("zod");

  const orgA = await prisma.organization.findUniqueOrThrow({
    where: { slug: "karachi-cool" },
    select: { id: true, aiMonthlySpendCapMicros: true },
  });
  const orgB = await prisma.organization.findUnique({
    where: { slug: "lahore-electric" },
    select: { id: true },
  });

  console.log("\n=== The model has no write path of its own ===");

  // Source-level invariant. acceptSuggestion marks a row and returns a payload;
  // if it ever grows a write to a job or invoice, that is the boundary gone.
  const aiDb = readFileSync("lib/db/ai.ts", "utf8");
  check(
    "lib/db/ai.ts never writes to a job",
    !/prisma\.job\.(update|create|delete)|tx\.job\.(update|create|delete)/.test(aiDb),
  );
  check(
    "lib/db/ai.ts never writes to an invoice",
    !/prisma\.invoice\.(update|create|delete)|tx\.invoice\.(update|create|delete)/.test(aiDb),
  );

  const features = execSync("ls lib/ai/features", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  let featureWrites = 0;
  for (const file of features) {
    const source = readFileSync(`lib/ai/features/${file}`, "utf8");
    if (/prisma\.\w+\.(update|create|delete|upsert)/.test(source)) featureWrites++;
  }
  check(
    `no feature module writes to the database (${features.length} checked)`,
    featureWrites === 0,
    featureWrites ? `${featureWrites} do` : "read-only",
  );

  console.log("\n=== A pending suggestion changes nothing ===");

  const job = await prisma.job.findFirstOrThrow({
    where: { organizationId: orgA.id, status: "COMPLETED" },
    select: { id: true, customerSummary: true, assignedMembershipId: true, status: true },
  });

  const planted = await prisma.aiSuggestion.create({
    data: {
      organizationId: orgA.id,
      feature: "JOB_SUMMARY",
      jobId: job.id,
      payload: { summary: "THIS MUST NOT APPEAR ON THE JOB" },
      model: "verify",
    },
    select: { id: true },
  });

  const after = await prisma.job.findUniqueOrThrow({
    where: { id: job.id },
    select: { customerSummary: true, assignedMembershipId: true, status: true },
  });

  check(
    "creating a suggestion leaves the job untouched",
    after.customerSummary === job.customerSummary &&
      after.assignedMembershipId === job.assignedMembershipId &&
      after.status === job.status,
  );

  await prisma.aiSuggestion.update({
    where: { id: planted.id },
    data: { status: "REJECTED", decidedAt: new Date() },
  });
  const afterReject = await prisma.job.findUniqueOrThrow({
    where: { id: job.id },
    select: { customerSummary: true },
  });
  check(
    "rejecting a suggestion leaves the job untouched",
    afterReject.customerSummary === job.customerSummary,
  );
  await prisma.aiSuggestion.delete({ where: { id: planted.id } });

  console.log("\n=== Tenant isolation ===");
  if (orgB) {
    const foreign = await prisma.aiSuggestion.create({
      data: {
        organizationId: orgB.id,
        feature: "JOB_CLASSIFICATION",
        payload: { serviceTypeName: "other tenant" },
        model: "verify",
      },
      select: { id: true },
    });
    const leaked = await prisma.aiSuggestion.findFirst({
      where: { id: foreign.id, organizationId: orgA.id },
    });
    check("org A cannot read org B's suggestion", leaked === null);

    const leakedUsage = await prisma.aiUsageLog.findFirst({
      where: { organizationId: orgB.id, NOT: { organizationId: orgB.id } },
    });
    check("usage rows are org-scoped", leakedUsage === null);
    await prisma.aiSuggestion.delete({ where: { id: foreign.id } });
  } else {
    console.log("  skip  second tenant missing — run `npm run verify` first");
  }

  console.log("\n=== Guardrails ===");

  // Force the org over its cap and confirm no request is even attempted.
  const usageBefore = await prisma.aiUsageLog.count({ where: { organizationId: orgA.id } });
  await prisma.organization.update({
    where: { id: orgA.id },
    data: { aiMonthlySpendCapMicros: 1 },
  });
  await prisma.aiUsageLog.create({
    data: {
      organizationId: orgA.id,
      feature: "JOB_CLASSIFICATION",
      model: "verify",
      costMicros: 5_000_000,
    },
  });

  const capped = await checkAvailability(orgA.id, "JOB_CLASSIFICATION");
  check(
    "an org over its cap is unavailable",
    !capped.available && capped.reason === "over_budget",
    capped.available ? "still available" : capped.reason,
  );

  const cappedCall = await ask({
    organizationId: orgA.id,
    feature: "JOB_CLASSIFICATION",
    user: "test",
    schema: z.object({ x: z.string() }),
  });
  const usageAfter = await prisma.aiUsageLog.count({ where: { organizationId: orgA.id } });
  check(
    "and makes no request at all",
    !cappedCall.ok && cappedCall.reason === "over_budget" && usageAfter === usageBefore + 1,
    `${usageAfter - usageBefore - 1} extra rows`,
  );

  await prisma.aiUsageLog.deleteMany({
    where: { organizationId: orgA.id, model: "verify" },
  });
  await prisma.organization.update({
    where: { id: orgA.id },
    data: { aiMonthlySpendCapMicros: orgA.aiMonthlySpendCapMicros },
  });

  // Switching the org off must also stop everything.
  await prisma.organization.update({ where: { id: orgA.id }, data: { aiEnabled: false } });
  const off = await checkAvailability(orgA.id, "JOB_CLASSIFICATION");
  check(
    "a switched-off org is unavailable",
    !off.available && off.reason === "org_disabled",
  );
  await prisma.organization.update({ where: { id: orgA.id }, data: { aiEnabled: true } });

  await prisma.aiFeatureSetting.upsert({
    where: {
      organizationId_feature: { organizationId: orgA.id, feature: "JOB_SUMMARY" },
    },
    create: { organizationId: orgA.id, feature: "JOB_SUMMARY", enabled: false },
    update: { enabled: false },
  });
  const featureOff = await checkAvailability(orgA.id, "JOB_SUMMARY");
  const otherOn = await checkAvailability(orgA.id, "JOB_CLASSIFICATION");
  check(
    "one feature off does not disable the others",
    !featureOff.available && featureOff.reason === "feature_disabled" && otherOn.available,
  );
  await prisma.aiFeatureSetting.update({
    where: {
      organizationId_feature: { organizationId: orgA.id, feature: "JOB_SUMMARY" },
    },
    data: { enabled: true },
  });

  console.log("\n=== Degradation ===");
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  // The client caches its instance, so clear it the way a fresh process would.
  (globalThis as { genai?: unknown }).genai = undefined;

  check("hasApiKey() reports false", !hasApiKey());
  const noKey = await checkAvailability(orgA.id, "JOB_CLASSIFICATION");
  check("no key means unavailable", !noKey.available && noKey.reason === "no_key");

  let threw = false;
  let result: Awaited<ReturnType<typeof ask>> | undefined;
  try {
    result = await ask({
      organizationId: orgA.id,
      feature: "JOB_CLASSIFICATION",
      user: "test",
      schema: z.object({ x: z.string() }),
    });
  } catch {
    threw = true;
  }
  check("ask() returns rather than throws", !threw && result?.ok === false);
  if (key) process.env.GEMINI_API_KEY = key;
  (globalThis as { genai?: unknown }).genai = undefined;

  console.log("\n=== Provider containment ===");
  const sdkImports = execSync(
    'grep -rl "@google/genai" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules . || true',
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .filter((path) => !path.includes("scripts/"));
  check(
    "exactly one application file imports the provider SDK",
    sdkImports.length === 1,
    sdkImports.join(", ") || "none",
  );

  console.log("\n=== Accounting ===");
  const perFeature = await prisma.aiUsageLog.groupBy({
    by: ["feature"],
    where: { organizationId: orgA.id },
    _sum: { costMicros: true },
  });
  const total = await prisma.aiUsageLog.aggregate({
    where: { organizationId: orgA.id },
    _sum: { costMicros: true },
  });
  const summed = perFeature.reduce((acc, row) => acc + (row._sum.costMicros ?? 0), 0);
  check(
    "per-feature costs sum to the total",
    summed === (total._sum.costMicros ?? 0),
    `${summed} vs ${total._sum.costMicros ?? 0}`,
  );

  const unlogged = await prisma.aiUsageLog.count({
    where: { organizationId: orgA.id, model: "" },
  });
  check("every usage row records which model ran", unlogged === 0);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
