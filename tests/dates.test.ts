import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dayKey,
  endOfDay,
  fromInputParts,
  startOfDay,
  toInputParts,
  weekKeys,
} from "../lib/dates";

const KHI = "Asia/Karachi"; // UTC+5, no DST
const NYC = "America/New_York"; // DST

describe("time zones", () => {
  it("puts the day boundary where the business is, not where the server is", () => {
    assert.equal(startOfDay("2026-08-30", KHI).toISOString(), "2026-08-29T19:00:00.000Z");
    assert.equal(endOfDay("2026-08-30", KHI).toISOString(), "2026-08-30T19:00:00.000Z");
  });

  it("buckets an instant into the right local day", () => {
    // One minute either side of local midnight in Karachi.
    assert.equal(dayKey(new Date("2026-08-29T19:00:00Z"), KHI), "2026-08-30");
    assert.equal(dayKey(new Date("2026-08-29T18:59:00Z"), KHI), "2026-08-29");
  });

  it("survives the day a clock goes back", () => {
    // 1 Nov 2026 is 25 hours long in New York.
    const hours =
      (startOfDay("2026-11-02", NYC).getTime() - startOfDay("2026-11-01", NYC).getTime()) /
      3_600_000;
    assert.equal(hours, 25);
  });

  it("returns plain Dates, never a TZDate subclass", () => {
    // A TZDate serialises as +00:00 rather than Z and must not reach Prisma.
    assert.equal(startOfDay("2026-08-30", KHI).constructor.name, "Date");
    assert.equal(fromInputParts("2026-08-30", "15:30", KHI)!.constructor.name, "Date");
  });

  it("starts weeks on Monday", () => {
    // 30 Aug 2026 is a Sunday, so its week starts on the 24th.
    assert.deepEqual(weekKeys("2026-08-30", KHI), [
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("round-trips a form's date and time inputs", () => {
    const stored = fromInputParts("2026-08-30", "15:30", KHI)!;
    assert.equal(stored.toISOString(), "2026-08-30T10:30:00.000Z");
    assert.deepEqual(toInputParts(stored, KHI), { date: "2026-08-30", time: "15:30" });
  });
});
