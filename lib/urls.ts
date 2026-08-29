/**
 * Absolute base URL for links that leave the app — emails, invites.
 * Vercel sets VERCEL_URL per deployment; AUTH_URL wins when set explicitly.
 */
export function appUrl(path = "/"): string {
  const base =
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";
  return new URL(path, base).toString();
}
