import { TZDate } from "@date-fns/tz";

/**
 * Everything is stored as UTC and displayed in the organization's time zone.
 * A dispatcher in Karachi and a technician in Dubai must see the same job at
 * the business's local time, so the org's zone — not the browser's — wins.
 */

export function formatDate(date: Date, timeZone: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTime(date: Date, timeZone: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDateTime(date: Date, timeZone: string, locale = "en"): string {
  return `${formatDate(date, timeZone, locale)}, ${formatTime(date, timeZone, locale)}`;
}

export function formatTimeRange(
  start: Date,
  end: Date | null,
  timeZone: string,
  locale = "en",
): string {
  const from = formatTime(start, timeZone, locale);
  return end ? `${from} – ${formatTime(end, timeZone, locale)}` : from;
}

export function formatWeekday(date: Date, timeZone: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: "long" }).format(date);
}

/** "2026-08-30" as seen in the given zone. The key used for day grouping. */
export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** The UTC instant of local midnight starting `dayKey` in `timeZone`. */
export function startOfDay(key: string, timeZone: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  // Plain Date, not TZDate: the subclass serialises as +00:00 rather than Z,
  // and it should never reach Prisma or JSON.
  return new Date(new TZDate(year, month - 1, day, 0, 0, 0, 0, timeZone).getTime());
}

export function endOfDay(key: string, timeZone: string): Date {
  return addDays(startOfDay(key, timeZone), 1);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function shiftDayKey(key: string, days: number, timeZone: string): string {
  return dayKey(addDays(startOfDay(key, timeZone), days), timeZone);
}

/** Monday-start week containing `key`. Returns seven day keys. */
export function weekKeys(key: string, timeZone: string): string[] {
  const start = startOfDay(key, timeZone);
  // getUTCDay on the local-midnight instant would drift; read the weekday in
  // the target zone instead.
  const weekday = new Intl.DateTimeFormat("en", { timeZone, weekday: "short" }).format(start);
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  const monday = shiftDayKey(key, -(index < 0 ? 0 : index), timeZone);
  return Array.from({ length: 7 }, (_, offset) => shiftDayKey(monday, offset, timeZone));
}

export function todayKey(timeZone: string): string {
  return dayKey(new Date(), timeZone);
}

/** Splits a UTC instant into the date and time strings a form input wants. */
export function toInputParts(date: Date, timeZone: string) {
  const zoned = new TZDate(date.getTime(), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(zoned.getDate())}`,
    time: `${pad(zoned.getHours())}:${pad(zoned.getMinutes())}`,
  };
}

/** The inverse: a date input plus a time input, read as org-local, stored UTC. */
export function fromInputParts(
  date: string,
  time: string,
  timeZone: string,
): Date | null {
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour = 9, minute = 0] = (time || "09:00").split(":").map(Number);
  if (!year || !month || !day) return null;
  return new Date(new TZDate(year, month - 1, day, hour, minute, 0, 0, timeZone).getTime());
}
