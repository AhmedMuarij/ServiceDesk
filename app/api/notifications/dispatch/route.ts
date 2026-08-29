import { NextResponse } from "next/server";

import { dispatchNotifications } from "@/lib/notifications/dispatch";

/**
 * Cron entry point for the notification outbox. Thin on purpose — the logic
 * lives in lib/notifications/dispatch.ts so it can be tested directly.
 */

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Without a configured secret the endpoint stays shut rather than open.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await dispatchNotifications());
}

export const POST = handle;
// Vercel Cron issues GET requests.
export const GET = handle;
