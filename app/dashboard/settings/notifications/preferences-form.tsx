"use client";

import { useActionState } from "react";

import { FormError, Table, Td, Th } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { emptyState } from "@/lib/action-state";
import {
  NOTIFICATION_DESCRIPTION,
  NOTIFICATION_LABEL,
  NOTIFICATION_ORDER,
  SYSTEM_TYPES,
} from "@/lib/notifications/labels";
import type { NotificationType } from "@prisma/client";

import { savePreferencesAction } from "./actions";

type Preference = {
  type: NotificationType;
  enabled: boolean;
  notifyCustomer: boolean;
  notifyTechnician: boolean;
  notifyOrg: boolean;
};

export function PreferencesForm({ preferences }: { preferences: Preference[] }) {
  const [state, action] = useActionState(savePreferencesAction, emptyState);
  const byType = new Map(preferences.map((preference) => [preference.type, preference]));

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error} />
      {state.success ? (
        <p className="text-sm text-green-700 dark:text-green-400">{state.success}</p>
      ) : null}

      <div className="overflow-x-auto">
        <Table className="min-w-[560px]">
          <thead>
            <tr>
              <Th>Event</Th>
              <Th className="text-center">On</Th>
              <Th className="text-center">Customer</Th>
              <Th className="text-center">Technician</Th>
              <Th className="text-center">You</Th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_ORDER.map((type) => {
              const preference = byType.get(type);
              if (!preference) return null;
              const system = SYSTEM_TYPES.includes(type);

              return (
                <tr key={type}>
                  <Td>
                    <span className="font-medium">{NOTIFICATION_LABEL[type]}</span>
                    <span className="block text-xs text-neutral-500">
                      {NOTIFICATION_DESCRIPTION[type]}
                    </span>
                  </Td>
                  <Td className="text-center">
                    <input
                      type="checkbox"
                      name={`${type}:enabled`}
                      defaultChecked={preference.enabled}
                      disabled={system}
                      className="size-4"
                      aria-label={`${NOTIFICATION_LABEL[type]} enabled`}
                    />
                    {system ? (
                      <input type="hidden" name={`${type}:enabled`} value="on" />
                    ) : null}
                  </Td>
                  {(["customer", "technician", "org"] as const).map((who) => (
                    <Td key={who} className="text-center">
                      {system ? (
                        <span className="text-xs text-neutral-400">—</span>
                      ) : (
                        <input
                          type="checkbox"
                          name={`${type}:${who}`}
                          defaultChecked={
                            who === "customer"
                              ? preference.notifyCustomer
                              : who === "technician"
                                ? preference.notifyTechnician
                                : preference.notifyOrg
                          }
                          className="size-4"
                          aria-label={`${NOTIFICATION_LABEL[type]} notify ${who}`}
                        />
                      )}
                    </Td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      <div>
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </div>
    </form>
  );
}
