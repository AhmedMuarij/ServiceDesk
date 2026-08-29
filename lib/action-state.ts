/**
 * Shared by server actions and the client forms that render their result.
 * Import this from client components — never lib/actions.ts, which reaches
 * into the database layer.
 */
export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  success?: string;
};

export const emptyState: ActionState = {};
