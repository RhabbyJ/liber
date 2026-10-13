import { describe, expect, it } from "vitest";
import { isTimeZone, tourEventIsCurrent, tourMutationSchema, tourNotificationTime } from "./tour-scheduling";

const startsAt = new Date("2026-10-01T18:00:00Z");
const base = { revision: 2, currentRevision: 2, status: "CONFIRMED", startsAt, durationMinutes: 60, now: new Date("2026-10-01T17:30:00Z") };

describe("tour scheduling contracts", () => {
  it("validates an explicit UTC time, bounded duration and real IANA zone", () => {
    const proposal = { action: "PROPOSE", clientActionId: "019f62c5-1c07-4a62-9f9a-8302778aa014", expectedRevision: 0, startsAt: startsAt.toISOString(), timeZone: "America/Los_Angeles", durationMinutes: 60 };
    expect(tourMutationSchema.safeParse(proposal).success).toBe(true);
    for (const override of [{ startsAt: "2026-10-01T18:00" }, { timeZone: "America/Unknown" }, { durationMinutes: 500 }, { expectedRevision: -1 }, { userId: "someone else" }]) {
      expect(tourMutationSchema.safeParse({ ...proposal, ...override }).success).toBe(false);
    }
    expect(isTimeZone("UTC")).toBe(true);
  });
  it("suppresses old revisions after reschedule or cancellation", () => {
    for (const event of ["PROPOSED", "CONFIRMED", "CANCELLED", "REMINDER", "FOLLOW_UP"]) {
      expect(tourEventIsCurrent({ ...base, event, revision: 1 })).toBe(false);
    }
    expect(tourEventIsCurrent({ ...base, event: "REMINDER", status: "CANCELLED" })).toBe(false);
  });
  it("never sends a reminder before its window or after the start", () => {
    expect(tourEventIsCurrent({ ...base, event: "REMINDER" })).toBe(true);
    expect(tourEventIsCurrent({ ...base, event: "REMINDER", now: new Date("2026-10-01T16:59:00Z") })).toBe(false);
    expect(tourEventIsCurrent({ ...base, event: "REMINDER", now: startsAt })).toBe(false);
  });
  it("opens post-tour follow-up two hours after the end and expires it after seven days", () => {
    expect(tourEventIsCurrent({ ...base, event: "FOLLOW_UP", now: new Date("2026-10-01T21:00:00Z") })).toBe(true);
    expect(tourEventIsCurrent({ ...base, event: "FOLLOW_UP", now: new Date("2026-10-01T20:59:00Z") })).toBe(false);
    expect(tourEventIsCurrent({ ...base, event: "FOLLOW_UP", now: new Date("2026-10-08T19:00:00Z") })).toBe(false);
  });
  it("uses a ten-minute reminder when confirmed less than an hour before the tour", () => {
    expect(tourNotificationTime("REMINDER", startsAt, 60, base.now).toISOString()).toBe("2026-10-01T17:50:00.000Z");
    expect(tourNotificationTime("REMINDER", startsAt, 60, new Date("2026-10-01T15:00:00Z")).toISOString()).toBe("2026-10-01T17:00:00.000Z");
    expect(tourNotificationTime("FOLLOW_UP", startsAt, 60, base.now).toISOString()).toBe("2026-10-01T21:00:00.000Z");
  });
});
