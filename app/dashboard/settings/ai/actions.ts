"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { invalid, toActionState, type ActionState } from "@/lib/actions";
import { AI_FEATURES } from "@/lib/ai/config";
import { saveAiSettings } from "@/lib/db/ai";
import { requireRole } from "@/lib/db/scope";

const schema = z.object({
  // Dollars in the form, micro-dollars in storage — same pattern as money
  // elsewhere: integers underneath, a friendly unit on the surface.
  capDollars: z.coerce.number().min(0).max(2000),
});

export async function saveAiSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse({ capDollars: formData.get("capDollars") });
  if (!parsed.success) return invalid(parsed.error);

  try {
    await requireRole("ADMIN");
    await saveAiSettings({
      enabled: formData.get("aiEnabled") === "on",
      capMicros: Math.round(parsed.data.capDollars * 1_000_000),
      // Unchecked boxes are absent from FormData, so read every known feature
      // rather than iterating what was submitted.
      features: AI_FEATURES.map((feature) => ({
        feature,
        enabled: formData.get(`feature:${feature}`) === "on",
      })),
    });
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath("/dashboard/settings/ai");
  revalidatePath("/dashboard");
  return { success: "AI settings saved." };
}
