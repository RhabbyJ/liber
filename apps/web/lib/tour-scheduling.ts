import { z } from "zod";

export const tourMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("PROPOSE"),
    clientActionId: z.string().uuid(),
    expectedRevision: z.number().int().min(0),
    startsAt: z.string().datetime(),
    timeZone: z.string().min(1).max(100).refine(isTimeZone),
    durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  }).strict(),
  z.object({ action: z.enum(["CONFIRM", "CANCEL"]), clientActionId: z.string().uuid(), expectedRevision: z.number().int().min(1) }).strict(),
]);

export type TourMutation = z.infer<typeof tourMutationSchema>;
export type TourEvent = "PROPOSED" | "CONFIRMED" | "CANCELLED" | "REMINDER" | "FOLLOW_UP";
export type TourView = {
  canSchedule: boolean;
  schedule: null | {
    revision: number;
    status: "PROPOSED" | "CONFIRMED" | "CANCELLED";
    startsAt: string;
    timeZone: string;
    durationMinutes: number;
    proposedByYou: boolean;
  };
};

export function isTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); return true; }
  catch { return false; }
}

export function tourEnd(startsAt: Date, durationMinutes: number) {
  return new Date(startsAt.getTime() + durationMinutes * 60_000);
}

export function tourNotificationTime(event: TourEvent, startsAt: Date, durationMinutes: number, now: Date) {
  if (event === "REMINDER") {
    const hourBefore = startsAt.getTime() - 60 * 60_000;
    return new Date(hourBefore > now.getTime() ? hourBefore : startsAt.getTime() - 10 * 60_000);
  }
  if (event === "FOLLOW_UP") return new Date(tourEnd(startsAt, durationMinutes).getTime() + 2 * 60 * 60_000);
  return now;
}

export function tourEventIsCurrent(args: {
  event: string; revision: number; currentRevision: number; status: string;
  startsAt: Date; durationMinutes: number; now: Date;
}) {
  if (args.revision !== args.currentRevision) return false;
  const start = args.startsAt.getTime();
  const now = args.now.getTime();
  if (args.event === "CANCELLED") return args.status === "CANCELLED" && now < start;
  if (args.event === "PROPOSED") return args.status === "PROPOSED" && now < start;
  if (args.status !== "CONFIRMED") return false;
  if (args.event === "CONFIRMED") return now < start;
  if (args.event === "REMINDER") return now >= start - 60 * 60_000 && now < start;
  const end = tourEnd(args.startsAt, args.durationMinutes).getTime();
  return args.event === "FOLLOW_UP" && now >= end + 2 * 60 * 60_000 && now < end + 7 * 86_400_000;
}
