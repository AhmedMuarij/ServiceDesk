import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeTotals, formatTaxRate, toCents, toMajor } from "../lib/money";

describe("money", () => {
  it("round-trips minor units", () => {
    assert.equal(toCents(35.5), 3550);
    assert.equal(toCents(0.1 + 0.2), 30); // the float that famously isn't 0.3
    assert.equal(toMajor(3550), 35.5);
  });

  it("totals an invoice the way the invoice stores it", () => {
    const items = [
      { quantity: 2, unitPriceCents: 1500_00 },
      { quantity: 1, unitPriceCents: 850_00 },
    ];
    const totals = computeTotals(items, 1700);
    assert.equal(totals.subtotalCents, 3850_00);
    assert.equal(totals.taxCents, 654_50);
    assert.equal(totals.totalCents, 4504_50);
  });

  it("handles a discount line without going negative on tax", () => {
    const totals = computeTotals(
      [
        { quantity: 1, unitPriceCents: 5000_00 },
        { quantity: 1, unitPriceCents: -500_00 },
      ],
      1000,
    );
    assert.equal(totals.subtotalCents, 4500_00);
    assert.equal(totals.taxCents, 450_00);
    assert.equal(totals.totalCents, 4950_00);
  });

  it("expresses fractional tax rates exactly", () => {
    // 17.5% is why the rate is basis points and not an integer percent.
    const totals = computeTotals([{ quantity: 1, unitPriceCents: 1000_00 }], 1750);
    assert.equal(totals.taxCents, 175_00);
    assert.equal(formatTaxRate(1750), "17.50%");
    assert.equal(formatTaxRate(1700), "17%");
  });

  it("is empty-safe", () => {
    assert.deepEqual(computeTotals([], 1700), {
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });
});
