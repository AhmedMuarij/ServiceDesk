/**
 * All money in the system is an integer of minor units. Nothing multiplies or
 * divides a float that represents currency; formatting happens only at the
 * edge. See docs/03-data-model.md.
 */

export function toCents(major: number): number {
  return Math.round(major * 100);
}

export function toMajor(cents: number): number {
  return cents / 100;
}

export function formatMoney(cents: number, currency: string, locale = "en"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Basis points: 1700 = 17%. Integer percents can't express 17.5%. */
export function formatTaxRate(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

export type LineItem = { quantity: number; unitPriceCents: number };

/**
 * The single definition of an invoice's arithmetic. Called on every draft
 * mutation and the result stored — an invoice must not change when a service
 * type's price is edited later.
 */
export function computeTotals(items: LineItem[], taxRateBps: number) {
  const subtotalCents = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0,
  );
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

export function lineAmountCents(item: LineItem): number {
  return item.quantity * item.unitPriceCents;
}
