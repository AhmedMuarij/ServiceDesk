import { randomUUID } from "node:crypto";

import { Resend } from "resend";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * The only place that talks to an email provider. Swapping Resend for SES or
 * Postmark is a change to this file and nothing else — callers go through
 * lib/notifications/ or, for identity email, call this directly.
 *
 * Without RESEND_API_KEY it logs instead of sending, so development and tests
 * work with no third-party account.
 */
export async function sendEmail(message: EmailMessage): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "ServiceOps <onboarding@resend.dev>";

  if (!apiKey) {
    console.info(
      `[email:dev] to=${message.to} subject=${JSON.stringify(message.subject)}\n` +
        message.text.replace(/^/gm, "  "),
    );
    return { id: `dev-${randomUUID()}` };
  }

  const { data, error } = await new Resend(apiKey).emails.send({
    from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });

  if (error) throw new Error(`${error.name}: ${error.message}`);
  if (!data?.id) throw new Error("Email provider returned no message id");

  return { id: data.id };
}
