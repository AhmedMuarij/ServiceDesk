"use client";

import { useActionState, useState } from "react";

import { Field, FormError, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";
import { AI_FEATURE_DESCRIPTION, AI_FEATURE_LABEL } from "@/lib/ai/config";
import type { AiFeature } from "@prisma/client";

import { saveAiSettingsAction } from "./actions";

export function AiSettingsForm({
  enabled,
  capDollars,
  features,
  freeTier,
}: {
  enabled: boolean;
  capDollars: number;
  features: Array<{ feature: AiFeature; enabled: boolean }>;
  freeTier: boolean;
}) {
  const [state, action] = useActionState(saveAiSettingsAction, emptyState);
  const [master, setMaster] = useState(enabled);

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormError message={state.error} />
      {state.success ? (
        <p className="text-sm text-green-700 dark:text-green-400">{state.success}</p>
      ) : null}

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="aiEnabled"
          checked={master}
          onChange={(event) => setMaster(event.target.checked)}
          className="mt-1 size-4"
        />
        <span>
          <span className="text-sm font-medium">AI features on</span>
          <span className="block text-xs text-neutral-500">
            Off means no suggestions anywhere and no requests leave the server.
            Everything else in ServiceOps works exactly the same.
          </span>
        </span>
      </label>

      <fieldset
        className={master ? "flex flex-col gap-3" : "flex flex-col gap-3 opacity-50"}
        disabled={!master}
      >
        <legend className="text-sm font-medium">Which features</legend>
        {features.map(({ feature, enabled: on }) => (
          <label key={feature} className="flex items-start gap-3">
            <input
              type="checkbox"
              name={`feature:${feature}`}
              defaultChecked={on}
              className="mt-1 size-4"
            />
            <span>
              <span className="text-sm">{AI_FEATURE_LABEL[feature]}</span>
              <span className="block text-xs text-neutral-500">
                {AI_FEATURE_DESCRIPTION[feature]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <Field
        label="Monthly spending cap (USD)"
        htmlFor="capDollars"
        hint={
          freeTier
            ? "Inert while you're on a free tier — nothing is billed, so nothing accumulates. It starts working the moment you enable paid billing."
            : "Once this month's usage reaches the cap, no further requests are made."
        }
        error={state.fieldErrors?.capDollars}
      >
        <Input
          id="capDollars"
          name="capDollars"
          type="number"
          min={0}
          max={2000}
          step="1"
          defaultValue={capDollars}
          className="max-w-40"
        />
      </Field>

      <div>
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </div>
    </form>
  );
}
