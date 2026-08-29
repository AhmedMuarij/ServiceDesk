import { formatDate, formatTime } from "@/lib/dates";
import type { EmailBody } from "@/lib/email/layout";
import { ROLE_LABEL } from "@/lib/roles";
import type { NotificationType, Prisma, RecipientKind, Role } from "@prisma/client";

/**
 * Renders a queued notification into an email body. Reads only the payload
 * snapshotted at enqueue time, never the live record — the email must say what
 * was true when the event happened.
 */

type Payload = Record<string, unknown>;

const str = (payload: Payload, key: string): string | null => {
  const value = payload[key];
  return typeof value === "string" && value ? value : null;
};
const num = (payload: Payload, key: string): number | null => {
  const value = payload[key];
  return typeof value === "number" ? value : null;
};

function when(payload: Payload): { date: string; time: string } | null {
  const iso = str(payload, "scheduledStart");
  if (!iso) return null;
  const timezone = str(payload, "timezone") ?? "UTC";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { date: formatDate(date, timezone), time: formatTime(date, timezone) };
}

function jobFacts(payload: Payload): Array<[string, string]> {
  const facts: Array<[string, string]> = [];
  const number = num(payload, "jobNumber");
  if (number !== null) facts.push(["Job", `#${number}`]);

  const service = str(payload, "serviceName");
  if (service) facts.push(["Service", service]);

  const appointment = when(payload);
  if (appointment) {
    facts.push(["Date", appointment.date]);
    facts.push(["Time", appointment.time]);
  }

  const address = str(payload, "address");
  if (address) facts.push(["Address", address]);

  const technician = str(payload, "technicianName");
  if (technician) facts.push(["Technician", technician]);

  return facts;
}

export function renderNotification(
  type: NotificationType,
  recipientKind: RecipientKind,
  payload: Prisma.JsonValue,
): EmailBody {
  const data = (payload ?? {}) as Payload;
  const orgName = str(data, "orgName") ?? "Your service provider";
  const customer = str(data, "customerName") ?? "the customer";
  const title = str(data, "jobTitle") ?? "your service request";
  const number = num(data, "jobNumber");
  const appointment = when(data);
  const facts = jobFacts(data);

  switch (type) {
    case "JOB_CREATED":
      return {
        preheader: `New job #${number} logged`,
        heading: `New job #${number}`,
        paragraphs: [`A new job has been logged for ${customer}: ${title}.`],
        facts,
      };

    case "JOB_ASSIGNED":
      return {
        preheader: `You've been assigned job #${number}`,
        heading: "You've got a new job",
        paragraphs: [
          `${title} — for ${customer}.`,
          appointment
            ? `It's booked for ${appointment.date} at ${appointment.time}.`
            : "It hasn't been given a time slot yet.",
        ],
        facts,
      };

    case "APPOINTMENT_SCHEDULED":
      return {
        preheader: appointment
          ? `Your appointment is on ${appointment.date}`
          : "Your appointment is booked",
        heading: "Your appointment is booked",
        paragraphs: [
          recipientKind === "CUSTOMER"
            ? `Hi ${customer}, we've booked in ${title.toLowerCase()}.`
            : `${title} for ${customer} has been scheduled.`,
          appointment
            ? `We'll see you on ${appointment.date} at ${appointment.time}.`
            : "We'll confirm the time shortly.",
        ],
        facts,
        footer: `Need to change it? Just reply to this email and ${orgName} will sort it out.`,
      };

    case "APPOINTMENT_RESCHEDULED":
      return {
        preheader: appointment
          ? `Your appointment moved to ${appointment.date}`
          : "Your appointment has moved",
        heading: "Your appointment has moved",
        paragraphs: [
          recipientKind === "CUSTOMER"
            ? `Hi ${customer}, the time for ${title.toLowerCase()} has changed.`
            : `${title} for ${customer} has been rescheduled.`,
          appointment
            ? `It's now ${appointment.date} at ${appointment.time}.`
            : "A new time will follow.",
        ],
        facts,
      };

    case "APPOINTMENT_REMINDER":
      return {
        preheader: "Reminder: your appointment is tomorrow",
        heading: "See you tomorrow",
        paragraphs: [
          recipientKind === "CUSTOMER"
            ? `Hi ${customer}, this is a reminder about ${title.toLowerCase()} tomorrow.`
            : `Reminder: ${title} for ${customer} is tomorrow.`,
          appointment ? `We're booked in for ${appointment.time}.` : "",
        ].filter(Boolean),
        facts,
      };

    case "JOB_COMPLETED":
      return {
        preheader: "Your service is complete",
        heading: "All done",
        paragraphs: [
          `Hi ${customer}, we've finished ${title.toLowerCase()}.`,
          "If anything isn't right, reply to this email and we'll come back out.",
        ],
        facts,
        footer: `Thanks for your business — ${orgName}.`,
      };

    case "INVOICE_SENT": {
      const invoiceNumber = str(data, "invoiceNumber");
      const total = str(data, "totalFormatted");
      const due = str(data, "dueDate");
      return {
        preheader: `Invoice ${invoiceNumber} — ${total}`,
        heading: `Invoice ${invoiceNumber}`,
        paragraphs: [
          `Hi ${customer}, here's the invoice for ${title.toLowerCase()}.`,
          due ? `It's due by ${due}.` : "",
        ].filter(Boolean),
        facts: [
          ...(invoiceNumber ? ([["Invoice", invoiceNumber]] as Array<[string, string]>) : []),
          ...(total ? ([["Total", total]] as Array<[string, string]>) : []),
          ...(due ? ([["Due", due]] as Array<[string, string]>) : []),
          ...jobFacts(data),
        ],
        footer: `Questions about this invoice? Reply and ${orgName} will help.`,
      };
    }

    case "INVOICE_OVERDUE": {
      const invoiceNumber = str(data, "invoiceNumber");
      const total = str(data, "totalFormatted");
      const due = str(data, "dueDate");
      return {
        preheader: `Invoice ${invoiceNumber} is overdue`,
        heading: `Invoice ${invoiceNumber} is overdue`,
        paragraphs: [
          recipientKind === "CUSTOMER"
            ? `Hi ${customer}, invoice ${invoiceNumber} was due on ${due} and is still outstanding.`
            : `Invoice ${invoiceNumber} for ${customer} is overdue.`,
          recipientKind === "CUSTOMER"
            ? "If you've already paid, please ignore this — and thank you."
            : "",
        ].filter(Boolean),
        facts: [
          ...(total ? ([["Amount", total]] as Array<[string, string]>) : []),
          ...(due ? ([["Was due", due]] as Array<[string, string]>) : []),
        ],
      };
    }

    case "TEAM_INVITE": {
      const inviteUrl = str(data, "inviteUrl");
      const role = str(data, "role") as Role | null;
      const name = str(data, "inviteeName");
      return {
        preheader: `${orgName} invited you to ServiceOps`,
        heading: `Join ${orgName} on ServiceOps`,
        paragraphs: [
          name ? `Hi ${name},` : "Hi,",
          `${orgName} has invited you to join their workspace${role ? ` as ${ROLE_LABEL[role].toLowerCase()}` : ""}.`,
          "The link below expires in seven days.",
        ],
        cta: inviteUrl ? { label: "Accept invitation", url: inviteUrl } : undefined,
        footer: "If you weren't expecting this, you can ignore it.",
      };
    }
  }
}
