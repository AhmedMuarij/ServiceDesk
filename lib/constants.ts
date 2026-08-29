/** Currencies offered in settings. Stored as ISO 4217 on the organization. */
export const CURRENCIES = [
  { code: "PKR", label: "PKR — Pakistani rupee" },
  { code: "USD", label: "USD — US dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — Pound sterling" },
  { code: "AED", label: "AED — UAE dirham" },
  { code: "SAR", label: "SAR — Saudi riyal" },
  { code: "INR", label: "INR — Indian rupee" },
  { code: "BDT", label: "BDT — Bangladeshi taka" },
  { code: "CAD", label: "CAD — Canadian dollar" },
  { code: "AUD", label: "AUD — Australian dollar" },
] as const;

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as unknown as string[];

/** Suggested starting catalog, shown as placeholders during onboarding. */
export const SERVICE_TYPE_SUGGESTIONS = [
  "AC repair",
  "AC installation",
  "Routine maintenance",
] as const;

export const JOB_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

/** Time zones, from the runtime rather than a hand-maintained list. */
export function timeZones(): string[] {
  const supported = Intl.supportedValuesOf?.("timeZone");
  return supported?.length ? [...supported] : ["UTC", "Asia/Karachi"];
}
