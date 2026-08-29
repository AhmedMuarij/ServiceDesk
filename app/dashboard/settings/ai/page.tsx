import type { Metadata } from "next";

import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { hasApiKey } from "@/lib/ai/client";
import {
  AI_FEATURE_LABEL,
  AI_MODEL,
  AI_PROVIDER,
  IS_FREE_TIER,
  formatMicros,
} from "@/lib/ai/config";
import { aiUsageSummary, listAiSettings, suggestionStats } from "@/lib/db/ai";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";
import { formatDateTime } from "@/lib/dates";

import { AiSettingsForm } from "./ai-settings-form";

export const metadata: Metadata = { title: "AI settings" };

export default async function AiSettingsPage() {
  await requireDashboardAccess("ADMIN");

  const [settings, usage, stats, org] = await Promise.all([
    listAiSettings(),
    aiUsageSummary(),
    suggestionStats(),
    getOrgSettings(),
  ]);

  const configured = hasApiKey();

  // Accept vs reject is the only real signal on whether the suggestions are
  // any good in practice. Insights are excluded — they are read, not decided.
  const decided = stats.filter(
    (row) => row.status === "ACCEPTED" || row.status === "REJECTED",
  );
  const accepted = decided
    .filter((row) => row.status === "ACCEPTED")
    .reduce((sum, row) => sum + row._count._all, 0);
  const totalDecided = decided.reduce((sum, row) => sum + row._count._all, 0);

  const usageByFeature = new Map(
    usage.byFeature.map((row) => [row.feature, row]),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI"
        description={`${AI_PROVIDER} · ${AI_MODEL}${IS_FREE_TIER ? " · free tier" : ""}`}
      />

      {!configured ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
          No API key is configured on the server, so every AI feature is
          currently off regardless of the settings below. ServiceOps works
          normally without it.
        </p>
      ) : null}

      <Card className="p-5">
        <AiSettingsForm
          enabled={settings.enabled}
          capDollars={Math.round(settings.capMicros / 1_000_000)}
          features={settings.features}
          freeTier={IS_FREE_TIER}
        />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">This month</h2>

        <div className="grid gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
              Requests
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{usage.totalCalls}</p>
          </Card>
          <Card className="p-4">
            <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
              Cost
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatMicros(usage.totalMicros)}
            </p>
            {!IS_FREE_TIER ? (
              <p className="text-xs text-neutral-500">
                of {formatMicros(settings.capMicros)} cap
              </p>
            ) : null}
          </Card>
          <Card className={usage.failures > 0 ? "border-amber-300 p-4 dark:border-amber-900" : "p-4"}>
            <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
              Failed
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{usage.failures}</p>
          </Card>
          <Card className="p-4">
            <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
              Suggestions kept
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {totalDecided > 0 ? `${Math.round((accepted / totalDecided) * 100)}%` : "—"}
            </p>
            <p className="text-xs text-neutral-500">
              {totalDecided > 0 ? `${accepted} of ${totalDecided} decided` : "nothing decided yet"}
            </p>
          </Card>
        </div>

        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Feature</Th>
                <Th className="text-right">Requests</Th>
                <Th className="text-right">Tokens in</Th>
                <Th className="text-right">Tokens out</Th>
                <Th className="text-right">Cost</Th>
              </tr>
            </thead>
            <tbody>
              {settings.features.map(({ feature }) => {
                const row = usageByFeature.get(feature);
                return (
                  <tr key={feature}>
                    <Td>{AI_FEATURE_LABEL[feature]}</Td>
                    <Td className="text-right tabular-nums">{row?._count._all ?? 0}</Td>
                    <Td className="text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                      {(row?._sum.inputTokens ?? 0).toLocaleString()}
                    </Td>
                    <Td className="text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                      {(row?._sum.outputTokens ?? 0).toLocaleString()}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatMicros(row?._sum.costMicros ?? 0)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      </section>

      {usage.recent.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Recent requests</h2>
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Feature</Th>
                  <Th>When</Th>
                  <Th className="text-right">Took</Th>
                  <Th>Result</Th>
                </tr>
              </thead>
              <tbody>
                {usage.recent.map((entry) => (
                  <tr key={entry.id}>
                    <Td>{AI_FEATURE_LABEL[entry.feature]}</Td>
                    <Td className="text-neutral-600 dark:text-neutral-400">
                      {formatDateTime(entry.createdAt, org.timezone)}
                    </Td>
                    <Td className="text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                      {entry.latencyMs.toLocaleString()} ms
                    </Td>
                    <Td>
                      {entry.ok ? (
                        <Badge tone="green">ok</Badge>
                      ) : (
                        <>
                          <Badge tone="red">failed</Badge>
                          {entry.error ? (
                            <span className="block max-w-md truncate text-xs text-red-600 dark:text-red-400">
                              {entry.error}
                            </span>
                          ) : null}
                        </>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </section>
      ) : null}

      <p className="text-xs text-neutral-500">
        Every AI output is a suggestion someone confirms — nothing is written to a
        job, an assignment or an invoice by the model. Failed requests are logged
        here rather than only in a server log, so a broken key or a quota trip is
        something you can see.
      </p>
    </div>
  );
}
