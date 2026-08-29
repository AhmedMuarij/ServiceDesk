/**
 * Step 10: is context caching reachable at our prompt size?
 *
 *   npm run ai:cache-probe
 *
 * Makes the same call twice and reports what the provider says it cached.
 * Written to settle the question with a number rather than an assumption —
 * see docs/05-module-2-scope.md decision 7.
 */
export {};

process.loadEnvFile?.();

async function main() {
  const { prisma } = await import("../lib/db/prisma");
  const { classifyJob, orgContext } = await import("../lib/ai/features/classify-job");
  const { hasApiKey } = await import("../lib/ai/client");
  const { AI_MODEL } = await import("../lib/ai/config");

  if (!hasApiKey()) {
    console.error("GEMINI_API_KEY is not set.");
    process.exit(1);
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { slug: "karachi-cool" },
    select: { id: true },
  });

  const context = await orgContext(org.id);
  // Rough but adequate: providers count tokens at roughly 4 characters each.
  const approxTokens = Math.round(context.length / 4);

  console.log(`\nmodel:                 ${AI_MODEL}`);
  console.log(`per-tenant block:      ${context.length} chars, ~${approxTokens} tokens`);
  console.log(`typical cache minimum: 1,024–4,096 tokens depending on provider and model`);
  console.log(
    `verdict:               ${approxTokens >= 1024 ? "possibly reachable — measuring" : "BELOW the minimum — caching cannot engage"}\n`,
  );

  const before = await prisma.aiUsageLog.count({ where: { organizationId: org.id } });

  for (const attempt of [1, 2]) {
    const result = await classifyJob({
      organizationId: org.id,
      description: "AC chal raha hai lekin thanda nahi ho raha, do din se",
    });
    if (!result.ok) {
      console.log(`  call ${attempt}: failed — ${result.reason}`);
      continue;
    }
    console.log(
      `  call ${attempt}: ${result.latencyMs}ms, cached tokens read: ${result.cacheReadTokens}`,
    );
    if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  const rows = await prisma.aiUsageLog.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { inputTokens: true, cacheReadTokens: true },
  });

  console.log(
    `\nactual input tokens per call: ${rows.map((row) => row.inputTokens).join(", ")}`,
  );
  console.log(
    `cache reads:                  ${rows.map((row) => row.cacheReadTokens).join(", ")}`,
  );
  console.log(
    rows.every((row) => row.cacheReadTokens === 0)
      ? "\nNothing cached. The prompt is too small to reach the minimum — as expected.\nKeep the per-tenant block separable and revisit when the context grows.\n"
      : "\nCaching is engaging. Worth wiring explicitly.\n",
  );

  // Leave the log as we found it.
  const added = (await prisma.aiUsageLog.count({ where: { organizationId: org.id } })) - before;
  if (added > 0) {
    const recent = await prisma.aiUsageLog.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
      take: added,
      select: { id: true },
    });
    await prisma.aiUsageLog.deleteMany({
      where: { id: { in: recent.map((row) => row.id) } },
    });
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
