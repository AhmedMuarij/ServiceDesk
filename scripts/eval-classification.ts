/**
 * Measures the job classifier against evals/classification.json.
 *
 *   npm run eval:classification
 *
 * Service type is scored strictly. Priority is scored with one-step tolerance
 * (HIGH vs MEDIUM is a judgement call; URGENT vs LOW is not), and reported
 * separately so a regression in either is visible.
 *
 * Needs GEMINI_API_KEY and the demo org (`npm run db:seed`). On the Gemini
 * free tier a run costs nothing; it does consume free-tier request quota, so
 * 20 cases back to back may hit the per-minute limit.
 */
export {};

process.loadEnvFile?.();

import { readFileSync } from "node:fs";

type Case = {
  id: string;
  input: string;
  service: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
};

const LADDER = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

function withinOneStep(expected: string, actual: string): boolean {
  const a = LADDER.indexOf(expected as (typeof LADDER)[number]);
  const b = LADDER.indexOf(actual as (typeof LADDER)[number]);
  return a >= 0 && b >= 0 && Math.abs(a - b) <= 1;
}

async function main() {
  const { prisma } = await import("../lib/db/prisma");
  const { classifyJob } = await import("../lib/ai/features/classify-job");
  const { hasApiKey } = await import("../lib/ai/client");
  const { formatMicros } = await import("../lib/ai/config");

  if (!hasApiKey()) {
    console.error("GEMINI_API_KEY is not set — nothing to measure.");
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({
    where: { slug: "karachi-cool" },
    select: { id: true },
  });
  if (!org) {
    console.error("Demo org missing. Run `npm run db:seed` first.");
    process.exit(1);
  }

  const fixtures = JSON.parse(
    readFileSync("evals/classification.json", "utf8"),
  ) as { cases: Case[] };

  let serviceHits = 0;
  let priorityExact = 0;
  let priorityClose = 0;
  let failures = 0;
  let spend = 0;
  const latencies: number[] = [];
  const misses: string[] = [];

  // Pace to stay under our own rate limiter and the free tier's, rather than
  // firing 20 requests at once and scoring a wall of rate-limit errors.
  const { RATE_LIMIT_PER_MINUTE } = await import("../lib/ai/config");
  const gapMs = Math.ceil(60_000 / Math.max(1, RATE_LIMIT_PER_MINUTE)) + 500;

  console.log(
    `\nRunning ${fixtures.cases.length} cases, one every ${(gapMs / 1000).toFixed(1)}s ` +
      `(~${Math.ceil((fixtures.cases.length * gapMs) / 60_000)} min)…\n`,
  );

  let first = true;
  for (const testCase of fixtures.cases) {
    if (!first) await new Promise((resolve) => setTimeout(resolve, gapMs));
    first = false;

    // A free-tier throttle is not a wrong answer — wait the time the provider
    // asked for and try again rather than scoring it as a miss.
    let result = await classifyJob({
      organizationId: org.id,
      description: testCase.input,
    });
    for (let attempt = 0; attempt < 3 && !result.ok && result.reason === "rate_limited"; attempt++) {
      const wait = result.retryAfterMs ?? 30_000;
      console.log(`  wait  ${testCase.id.padEnd(30)} throttled, retrying in ${Math.round(wait / 1000)}s`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      result = await classifyJob({
        organizationId: org.id,
        description: testCase.input,
      });
    }

    if (!result.ok) {
      failures++;
      console.log(`  ERR   ${testCase.id.padEnd(30)} ${result.reason}: ${result.message}`);
      continue;
    }

    spend += result.costMicros;
    latencies.push(result.latencyMs);

    const gotService = result.data.serviceTypeName ?? "__none__";
    const serviceOk = gotService === testCase.service;
    const priorityOk = result.data.priority === testCase.priority;
    const priorityNear = withinOneStep(testCase.priority, result.data.priority);

    if (serviceOk) serviceHits++;
    if (priorityOk) priorityExact++;
    if (priorityNear) priorityClose++;

    const mark = serviceOk && priorityNear ? "ok  " : "MISS";
    if (mark === "MISS") {
      misses.push(
        `${testCase.id}: wanted ${testCase.service}/${testCase.priority}, got ${gotService}/${result.data.priority}`,
      );
    }

    console.log(
      `  ${mark}  ${testCase.id.padEnd(30)} ${gotService.padEnd(22)} ${result.data.priority.padEnd(7)} ${result.latencyMs}ms`,
    );
    console.log(`        "${result.data.title}"`);
  }

  const total = fixtures.cases.length;
  const scored = total - failures;
  const pct = (n: number) => `${((n / Math.max(1, scored)) * 100).toFixed(0)}%`;
  latencies.sort((a, b) => a - b);

  console.log("\n─────────────────────────────────────────────");
  console.log(`  cases scored        ${scored}/${total}${failures ? ` (${failures} errored)` : ""}`);
  console.log(`  service type        ${serviceHits}/${scored}  ${pct(serviceHits)}   (strict)`);
  console.log(`  priority exact      ${priorityExact}/${scored}  ${pct(priorityExact)}`);
  console.log(`  priority ±1 step    ${priorityClose}/${scored}  ${pct(priorityClose)}`);
  console.log(`  median latency      ${latencies[Math.floor(latencies.length / 2)] ?? 0}ms`);
  console.log(`  total spend         ${formatMicros(spend)}  (${formatMicros(Math.round(spend / Math.max(1, scored)))} per case)`);
  console.log("─────────────────────────────────────────────");

  if (misses.length) {
    console.log("\nMisses:");
    for (const miss of misses) console.log(`  ${miss}`);
  }
  console.log("");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
