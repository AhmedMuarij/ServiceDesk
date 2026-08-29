/** Escapes a value for interpolation into email HTML. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type EmailBody = {
  preheader: string;
  heading: string;
  /** Paragraphs of plain text; escaped and wrapped for you. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Rendered as a definition list — job details, invoice lines. */
  facts?: Array<[label: string, value: string]>;
  footer?: string;
};

/**
 * Table-based layout on purpose: email clients are not browsers, and this has
 * to survive Outlook and Gmail's stripped CSS.
 */
export function renderEmail(body: EmailBody, orgName: string): { html: string; text: string } {
  const factRows = (body.facts ?? [])
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:4px 16px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap;">${esc(label)}</td>
          <td style="padding:4px 0;color:#111827;font-size:13px;font-weight:600;">${esc(value)}</td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f5f5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(body.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f5;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
        <tr><td style="padding:24px 28px 8px;">
          <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;">${esc(orgName)}</p>
        </td></tr>
        <tr><td style="padding:0 28px;">
          <h1 style="margin:8px 0 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:20px;line-height:1.3;color:#111827;">${esc(body.heading)}</h1>
          ${body.paragraphs
            .map(
              (p) =>
                `<p style="margin:0 0 14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#374151;">${esc(p)}</p>`,
            )
            .join("")}
          ${factRows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${factRows}</table>` : ""}
          ${
            body.cta
              ? `<p style="margin:0 0 22px;"><a href="${esc(body.cta.url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;">${esc(body.cta.label)}</a></p>`
              : ""
          }
        </td></tr>
        <tr><td style="padding:4px 28px 24px;border-top:1px solid #f3f4f6;">
          <p style="margin:14px 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#9ca3af;">${esc(body.footer ?? `Sent by ${orgName} via ServiceOps.`)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    orgName.toUpperCase(),
    "",
    body.heading,
    "",
    ...body.paragraphs,
    ...(body.facts?.length ? ["", ...body.facts.map(([l, v]) => `${l}: ${v}`)] : []),
    ...(body.cta ? ["", `${body.cta.label}: ${body.cta.url}`] : []),
    "",
    body.footer ?? `Sent by ${orgName} via ServiceOps.`,
  ].join("\n");

  return { html, text };
}
