import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/errors";

export type { ActionState };
export { emptyState } from "@/lib/action-state";

/** Turns a zod failure into the shape a form can render. */
export function invalid(error: z.ZodError): ActionState {
  const { fieldErrors, formErrors } = z.flattenError(error);
  return {
    error: formErrors[0] ?? "Check the highlighted fields",
    fieldErrors,
  };
}

/** Next signals redirects and 404s by throwing; those must not be swallowed. */
function isFrameworkSignal(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

/** Maps a thrown error to a message the form can show. */
export function toActionState(error: unknown): ActionState {
  if (isFrameworkSignal(error)) throw error;

  if (error instanceof UnauthorizedError) return { error: "Please sign in again." };
  if (error instanceof ForbiddenError) {
    return { error: "You do not have permission to do that." };
  }
  if (error instanceof NotFoundError) return { error: "That record no longer exists." };
  // Matched by name rather than imported: transitions.ts must not be pulled
  // into every module that handles an action error.
  if (error instanceof Error && error.name === "TransitionError") {
    return { error: error.message };
  }

  console.error(error);
  return { error: "Something went wrong. Please try again." };
}
