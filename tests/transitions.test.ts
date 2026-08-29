import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { allowedTransitions, assertTransition, deriveStatus } from "../lib/jobs/transitions";
import type { JobStatus, Role } from "@prisma/client";

const manager = {
  role: "MANAGER" as Role,
  isAssignee: false,
  hasSchedule: true,
  hasAssignee: true,
};

const rejects = (from: JobStatus, to: JobStatus, context = manager) =>
  assert.throws(() => assertTransition(from, to, context), /.+/);

const allows = (from: JobStatus, to: JobStatus, context = manager) =>
  assert.doesNotThrow(() => assertTransition(from, to, context));

describe("job status machine", () => {
  it("rejects skipping straight to completed", () => {
    rejects("NEW", "COMPLETED");
    rejects("NEW", "IN_PROGRESS");
    rejects("SCHEDULED", "COMPLETED");
  });

  it("treats completed and cancelled as terminal", () => {
    rejects("COMPLETED", "IN_PROGRESS");
    rejects("COMPLETED", "CANCELLED");
    rejects("CANCELLED", "NEW");
    assert.equal(allowedTransitions("COMPLETED").length, 0);
    assert.equal(allowedTransitions("CANCELLED").length, 0);
  });

  it("requires the facts a status implies", () => {
    rejects("NEW", "SCHEDULED", { ...manager, hasSchedule: false });
    rejects("SCHEDULED", "ASSIGNED", { ...manager, hasAssignee: false });
    rejects("ASSIGNED", "IN_PROGRESS", { ...manager, hasAssignee: false });
  });

  it("lets only the assigned technician start and finish", () => {
    const other = { ...manager, role: "TECHNICIAN" as Role, isAssignee: false };
    const mine = { ...manager, role: "TECHNICIAN" as Role, isAssignee: true };
    rejects("IN_PROGRESS", "COMPLETED", other);
    allows("IN_PROGRESS", "COMPLETED", mine);
    // Scheduling stays with the office.
    rejects("ASSIGNED", "SCHEDULED", mine);
  });

  it("walks the happy path", () => {
    allows("NEW", "SCHEDULED");
    allows("SCHEDULED", "ASSIGNED");
    allows("ASSIGNED", "IN_PROGRESS");
    allows("IN_PROGRESS", "COMPLETED");
  });

  it("cancels from anything unfinished", () => {
    for (const status of ["NEW", "SCHEDULED", "ASSIGNED", "IN_PROGRESS"] as JobStatus[]) {
      allows(status, "CANCELLED");
    }
  });
});

describe("deriveStatus", () => {
  it("is a function of a time and a technician", () => {
    assert.equal(deriveStatus("NEW", false, false), "NEW");
    assert.equal(deriveStatus("NEW", true, false), "SCHEDULED");
    assert.equal(deriveStatus("NEW", true, true), "ASSIGNED");
    // A technician with no slot is still an unscheduled job.
    assert.equal(deriveStatus("NEW", false, true), "NEW");
  });

  it("never drags started or finished work backwards", () => {
    assert.equal(deriveStatus("IN_PROGRESS", false, false), "IN_PROGRESS");
    assert.equal(deriveStatus("COMPLETED", false, false), "COMPLETED");
    assert.equal(deriveStatus("CANCELLED", true, true), "CANCELLED");
  });
});
