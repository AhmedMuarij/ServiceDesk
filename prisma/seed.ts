/**
 * Seeds one demo organization with a week of realistic work either side of
 * today, so every screen has something to show. Safe to re-run: it deletes the
 * demo organization first and rebuilds it.
 *
 *   npm run db:seed
 */
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type JobStatus } from "@prisma/client";

const SLUG = "karachi-cool";
const PASSWORD = "demo1234";
const TZ = "Asia/Karachi";

function client() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** UTC instant for a local time in the demo org's zone (UTC+5, no DST). */
function at(dayOffset: number, hour: number, minute = 0): Date {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return new Date(base.getTime() + (hour - 5) * 3_600_000 + minute * 60_000);
}

async function main() {
  process.loadEnvFile?.();
  const prisma = client();

  console.log("clearing any previous demo data…");
  const previous = await prisma.organization.findUnique({
    where: { slug: SLUG },
    select: { id: true, memberships: { select: { userId: true } } },
  });
  if (previous) {
    const userIds = previous.memberships
      .map((m) => m.userId)
      .filter((id): id is string => Boolean(id));
    // Cascades clear customers, jobs, invoices and notifications.
    await prisma.organization.delete({ where: { id: previous.id } });
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const org = await prisma.organization.create({
    data: {
      name: "Karachi Cool AC Services",
      slug: SLUG,
      email: "office@karachicool.demo",
      phone: "+92 300 1234567",
      addressLine: "Shop 14, Block 6, PECHS",
      city: "Karachi",
      country: "Pakistan",
      timezone: TZ,
      currency: "PKR",
      invoicePrefix: "KC",
      invoiceDueDays: 7,
      defaultTaxRateBps: 1700,
      invoiceFooter: "Bank: Meezan 0123-4567890  ·  Thank you for your business.",
    },
    select: { id: true },
  });

  const { NOTIFICATION_DEFAULTS } = await import("../lib/notifications/defaults");
  await prisma.notificationPreference.createMany({
    data: NOTIFICATION_DEFAULTS.map((p) => ({ ...p, organizationId: org.id })),
  });

  const people = [
    { name: "Ayesha Siddiqui", email: "owner@serviceops.demo", role: "OWNER" as const },
    { name: "Bilal Ahmed", email: "manager@serviceops.demo", role: "MANAGER" as const },
    { name: "Hamza Tariq", email: "hamza@serviceops.demo", role: "TECHNICIAN" as const },
    { name: "Imran Qureshi", email: "imran@serviceops.demo", role: "TECHNICIAN" as const },
  ];

  const members: Record<string, string> = {};
  const colours = ["#2563eb", "#0d9488", "#c2410c", "#7c3aed"];

  for (const [index, person] of people.entries()) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      create: { name: person.name, email: person.email, passwordHash },
      update: { name: person.name, passwordHash },
      select: { id: true },
    });

    const membership = await prisma.membership.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: person.role,
        status: "ACTIVE",
        joinedAt: at(-30, 9),
      },
      select: { id: true },
    });
    members[person.email] = membership.id;

    if (person.role === "TECHNICIAN" || person.role === "MANAGER") {
      await prisma.technicianProfile.create({
        data: {
          membershipId: membership.id,
          phone: `+92 30${index} 555000${index}`,
          skills:
            person.role === "TECHNICIAN"
              ? ["AC repair", "AC installation", "Routine maintenance"]
              : ["AC repair"],
          calendarColor: colours[index],
          maxJobsPerDay: person.role === "TECHNICIAN" ? 6 : 3,
        },
      });
    }
  }

  // A pending invitation, so the team screen shows that state too.
  await prisma.membership.create({
    data: {
      organizationId: org.id,
      role: "TECHNICIAN",
      status: "INVITED",
      inviteEmail: "newhire@serviceops.demo",
      inviteToken: randomUUID().replace(/-/g, ""),
      inviteExpiresAt: at(6, 12),
      invitedById: members["owner@serviceops.demo"],
    },
  });

  const serviceSpecs = [
    ["AC repair", 90, 3500_00],
    ["AC installation", 180, 12000_00],
    ["Routine maintenance", 60, 2000_00],
    ["Gas refilling", 60, 4500_00],
    ["Duct cleaning", 120, 6000_00],
  ] as const;

  const services: Record<string, { id: string; price: number }> = {};
  for (const [name, minutes, price] of serviceSpecs) {
    const service = await prisma.serviceType.create({
      data: {
        organizationId: org.id,
        name,
        defaultDurationMinutes: minutes,
        defaultPriceCents: price,
      },
      select: { id: true },
    });
    services[name] = { id: service.id, price };
  }

  const customerSpecs = [
    ["Ahmed Khan", "ahmed.khan@example.com", "+92 321 2223344", "Flat 3B, Sea Breeze", "Karachi"],
    ["Fatima Malik", "fatima.malik@example.com", "+92 333 4445566", "House 27, Gulshan-e-Iqbal", "Karachi"],
    ["Usman Sheikh", "usman.sheikh@example.com", "+92 300 7778899", "Office 11, Clifton Block 4", "Karachi"],
    ["Zainab Rizvi", "zainab.rizvi@example.com", "+92 345 1112233", "House 5, DHA Phase 2", "Karachi"],
    ["Kamran Yousuf", null, "+92 322 9990011", "Shop 8, Tariq Road", "Karachi"],
    ["Sana Iqbal", "sana.iqbal@example.com", "+92 311 6667788", "Apartment 12, Bahadurabad", "Karachi"],
    ["Rehan Aslam", "rehan.aslam@example.com", "+92 302 5556677", "House 44, North Nazimabad", "Karachi"],
    ["Nadia Hussain", "nadia.hussain@example.com", "+92 336 2224455", "Villa 9, Askari 5", "Karachi"],
  ] as const;

  const customers: string[] = [];
  for (const [name, email, phone, addressLine, city] of customerSpecs) {
    const customer = await prisma.customer.create({
      data: {
        organizationId: org.id,
        name,
        email,
        phone,
        addressLine,
        city,
        notes: name === "Ahmed Khan" ? "Gate code 4417. Ask for the guard." : null,
      },
      select: { id: true },
    });
    customers.push(customer.id);
  }

  const hamza = members["hamza@serviceops.demo"];
  const imran = members["imran@serviceops.demo"];
  const manager = members["manager@serviceops.demo"];

  type JobSpec = {
    customer: number;
    service: keyof typeof services;
    title: string;
    status: JobStatus;
    day: number;
    hour: number;
    tech?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  };

  const jobSpecs: JobSpec[] = [
    // Finished work, last week — these become the invoices.
    { customer: 0, service: "AC repair", title: "AC not cooling in bedroom", status: "COMPLETED", day: -6, hour: 10, tech: hamza, priority: "HIGH" },
    { customer: 1, service: "Routine maintenance", title: "Annual service, two units", status: "COMPLETED", day: -5, hour: 12, tech: imran },
    { customer: 2, service: "Gas refilling", title: "Low cooling, suspected gas leak", status: "COMPLETED", day: -4, hour: 15, tech: hamza },
    { customer: 3, service: "AC installation", title: "Install 1.5 ton inverter unit", status: "COMPLETED", day: -3, hour: 9, tech: imran, priority: "HIGH" },
    { customer: 4, service: "Duct cleaning", title: "Shop ducts full of dust", status: "COMPLETED", day: -2, hour: 11, tech: hamza },
    { customer: 5, service: "AC repair", title: "Outdoor unit making noise", status: "COMPLETED", day: -1, hour: 14, tech: imran },

    // Today.
    { customer: 6, service: "AC repair", title: "Water dripping from indoor unit", status: "IN_PROGRESS", day: 0, hour: 9, tech: hamza, priority: "URGENT" },
    { customer: 7, service: "Routine maintenance", title: "Quarterly service", status: "ASSIGNED", day: 0, hour: 12, tech: imran },
    { customer: 0, service: "Gas refilling", title: "Top-up after repair", status: "ASSIGNED", day: 0, hour: 15, tech: hamza },
    { customer: 1, service: "AC repair", title: "Remote not responding", status: "COMPLETED", day: 0, hour: 8, tech: imran, priority: "LOW" },

    // The days ahead.
    { customer: 2, service: "AC installation", title: "Second unit for meeting room", status: "ASSIGNED", day: 1, hour: 10, tech: imran, priority: "HIGH" },
    { customer: 3, service: "Routine maintenance", title: "Pre-summer check", status: "ASSIGNED", day: 1, hour: 14, tech: hamza },
    { customer: 4, service: "AC repair", title: "Compressor cutting out", status: "SCHEDULED", day: 2, hour: 11 },
    { customer: 5, service: "Duct cleaning", title: "Full apartment ducts", status: "ASSIGNED", day: 3, hour: 9, tech: manager },
    { customer: 6, service: "Routine maintenance", title: "Service both units", status: "SCHEDULED", day: 4, hour: 13 },
    { customer: 7, service: "AC repair", title: "Unit tripping the breaker", status: "ASSIGNED", day: 5, hour: 10, tech: hamza, priority: "HIGH" },

    // Not booked in yet, and one that fell through.
    { customer: 0, service: "AC installation", title: "Quote for two new units", status: "NEW", day: 0, hour: 0 },
    { customer: 2, service: "AC repair", title: "Intermittent cooling upstairs", status: "NEW", day: 0, hour: 0, priority: "LOW" },
    { customer: 3, service: "Gas refilling", title: "Customer went with someone else", status: "CANCELLED", day: -2, hour: 16, tech: imran },
  ];

  let jobNumber = 1001;
  const completedJobs: Array<{ id: string; customerId: string; price: number; title: string }> = [];

  for (const spec of jobSpecs) {
    const unscheduled = spec.status === "NEW";
    const start = unscheduled ? null : at(spec.day, spec.hour);
    const service = services[spec.service];
    const end = start
      ? new Date(
          start.getTime() +
            (serviceSpecs.find((s) => s[0] === spec.service)?.[1] ?? 60) * 60_000,
        )
      : null;

    const job = await prisma.job.create({
      data: {
        organizationId: org.id,
        number: jobNumber++,
        customerId: customers[spec.customer],
        serviceTypeId: service.id,
        title: spec.title,
        description:
          spec.status === "NEW"
            ? "Customer called; waiting on a slot."
            : "Reported by phone. Confirmed with the customer.",
        priority: spec.priority ?? "MEDIUM",
        status: spec.status,
        scheduledStart: start,
        scheduledEnd: end,
        assignedMembershipId: spec.tech ?? null,
        createdByMembershipId: manager,
        createdAt: at(spec.day - 2, 9),
        ...(spec.status === "IN_PROGRESS" ? { startedAt: at(0, 9, 20) } : {}),
        ...(spec.status === "COMPLETED"
          ? { startedAt: start, completedAt: end ?? start }
          : {}),
        ...(spec.status === "CANCELLED"
          ? { cancelledAt: at(spec.day, spec.hour), cancelReason: "Customer went elsewhere" }
          : {}),
      },
      select: { id: true, customerId: true },
    });

    // A plausible trail, so the timeline and Recent activity aren't empty.
    const trail: JobStatus[] = unscheduled
      ? ["NEW"]
      : spec.status === "CANCELLED"
        ? ["NEW", "SCHEDULED", "CANCELLED"]
        : spec.status === "SCHEDULED"
          ? ["NEW", "SCHEDULED"]
          : spec.status === "ASSIGNED"
            ? ["NEW", "SCHEDULED", "ASSIGNED"]
            : spec.status === "IN_PROGRESS"
              ? ["NEW", "SCHEDULED", "ASSIGNED", "IN_PROGRESS"]
              : ["NEW", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"];

    for (const [index, to] of trail.entries()) {
      await prisma.jobStatusHistory.create({
        data: {
          jobId: job.id,
          from: index === 0 ? null : trail[index - 1],
          to,
          changedByMembershipId: index >= 3 ? (spec.tech ?? manager) : manager,
          createdAt: at(spec.day - 2 + index * 0.5, 9 + index),
        },
      });
    }

    if (spec.status === "COMPLETED") {
      // Varied, and deliberately written the way a technician actually types:
      // terse, abbreviated, sometimes leaving a follow-up implied rather than
      // stated. This is the input the summariser has to cope with.
      const NOTES: Record<string, string> = {
        "AC repair":
          "filter bohot ganda tha, cleaned. gas pressure low - topped up 200g. cooling ok now, tested 15 min. customer satisfied",
        "AC installation":
          "unit mounted on bracket, drilled 2 holes for piping. copper pipe 3m used. vacuum done 20min. test run ok, cooling within 8 min",
        "Routine maintenance":
          "both units serviced. filters washed, coils cleaned. outdoor fan bearing thoda noise kar raha hai - customer ko bataya, abhi urgent nahi",
        "Gas refilling":
          "leak found at flare joint near outdoor unit. re-flared and tightened. vacuum 30 min then charged 450g R410. no drop after 20 min",
        "Duct cleaning":
          "all ducts vacuumed, 2 vents removed and washed separately. lot of dust. recommended 6 monthly",
      };
      await prisma.jobNote.create({
        data: {
          jobId: job.id,
          body: NOTES[spec.service] ?? "work completed, tested ok",
          authorMembershipId: spec.tech ?? manager,
          createdAt: end ?? at(spec.day, spec.hour + 1),
        },
      });
      completedJobs.push({
        id: job.id,
        customerId: job.customerId,
        price: service.price,
        title: spec.title,
      });
    }
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { nextJobNumber: jobNumber },
  });

  // Invoices for the finished work, spread across the statuses.
  const invoicePlan = ["PAID", "PAID", "PAID", "SENT", "OVERDUE", "DRAFT", "DRAFT"] as const;
  let sequence = 1;

  for (const [index, job] of completedJobs.entries()) {
    const status = invoicePlan[index] ?? "DRAFT";
    // Explicit type rather than Prisma's create input: amountCents has a DB
    // default there, so it types as optional and the reduce below cannot rely
    // on it being present.
    const items: Array<{
      description: string;
      kind: "LABOUR" | "PARTS";
      quantity: number;
      unitPriceCents: number;
      amountCents: number;
      position: number;
    }> = [
      {
        description: job.title,
        kind: "LABOUR",
        quantity: 1,
        unitPriceCents: job.price,
        amountCents: job.price,
        position: 0,
      },
    ];
    if (index % 2 === 0) {
      items.push({
        description: "Parts — capacitor and filter",
        kind: "PARTS",
        quantity: 1,
        unitPriceCents: 850_00,
        amountCents: 850_00,
        position: 1,
      });
    }

    const subtotalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
    const taxCents = Math.round((subtotalCents * 1700) / 10_000);
    const totalCents = subtotalCents + taxCents;
    const issuedAt = at(-6 + index, 17);
    const dueAt = new Date(issuedAt.getTime() + 7 * 86_400_000);

    await prisma.invoice.create({
      data: {
        organizationId: org.id,
        sequence,
        number: `KC-${String(sequence).padStart(4, "0")}`,
        customerId: job.customerId,
        jobId: job.id,
        status,
        currency: "PKR",
        subtotalCents,
        taxRateBps: 1700,
        taxCents,
        totalCents,
        amountPaidCents: status === "PAID" ? totalCents : 0,
        issuedAt: status === "DRAFT" ? null : issuedAt,
        dueAt: status === "DRAFT" ? null : status === "OVERDUE" ? at(-2, 17) : dueAt,
        sentAt: status === "DRAFT" ? null : issuedAt,
        paidAt: status === "PAID" ? new Date(issuedAt.getTime() + 2 * 86_400_000) : null,
        items: { create: items },
      },
    });
    sequence++;
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { nextInvoiceNumber: sequence },
  });

  const counts = {
    customers: customers.length,
    services: serviceSpecs.length,
    team: people.length,
    jobs: jobSpecs.length,
    invoices: sequence - 1,
  };

  console.log("\nDemo workspace ready — Karachi Cool AC Services");
  console.log(counts);
  console.log("\nSign in as any of:");
  for (const person of people) {
    console.log(`  ${person.email.padEnd(30)} ${PASSWORD}   (${person.role})`);
  }
  console.log("");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
