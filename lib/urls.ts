/**
 * Absolute base URL for links that leave the app — invitations, password
 * resets, anything a customer or technician clicks in an email.
 *
 * Ordered so the app configures itself on Vercel and nobody has to remember to
 * set a URL by hand. Getting this wrong is quiet and nasty: every emailed link
 * points at localhost and nobody notices until an invite fails.
 *
 *   AUTH_URL                        an explicit override, if you want one
 *   VERCEL_PROJECT_PRODUCTION_URL   the stable production domain
 *   VERCEL_URL                      this specific deployment (preview builds)
 *   localhost                       development
 *
 * Auth.js does not read this — it derives its own base URL from the request
 * host, because `trustHost: true` is set in auth.ts. So sign-in redirects are
 * correct on production and preview deployments alike, with nothing to
 * configure.
 */
export function appUrl(path = "/"): string {
  const fromVercel = (host: string | undefined) =>
    host ? `https://${host.replace(/^https?:\/\//, "")}` : null;

  const base =
    process.env.AUTH_URL ||
    fromVercel(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    fromVercel(process.env.VERCEL_URL) ||
    "http://localhost:3000";

  return new URL(path, base).toString();
}
