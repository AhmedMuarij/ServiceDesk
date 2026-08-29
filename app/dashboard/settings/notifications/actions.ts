"use server";

import { revalidatePath } from "next/cache";

import { toActionState, type ActionState } from "@/lib/actions";
import { savePreferences, type PreferenceInput } from "@/lib/db/notifications";
import { requireRole } from "@/lib/db/scope";
import { NOTIFICATION_DEFAULTS } from "@/lib/notifications/defaults";

export async function savePreferencesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireRole("ADMIN");

    // Unchecked boxes are absent from FormData, so read every known type
    // rather than iterating what was submitted.
    const preferences: PreferenceInput[] = NOTIFICATION_DEFAULTS.map(({ type }) => ({
      type,
      enabled: formData.get(`${type}:enabled`) === "on",
      notifyCustomer: formData.get(`${type}:customer`) === "on",
      notifyTechnician: formData.get(`${type}:technician`) === "on",
      notifyOrg: formData.get(`${type}:org`) === "on",
    }));

    await savePreferences(preferences);
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath("/dashboard/settings/notifications");
  return { success: "Notification settings saved." };
}
