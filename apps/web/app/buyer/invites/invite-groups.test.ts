import { describe, expect, it } from "vitest";
import type { InviteStatusLabel, InviteView } from "../../../lib/invite-status";
import { groupBuyerInvites } from "./invite-groups";

const invite = (id: string, status: InviteStatusLabel): InviteView => ({
  buyer: "Synthetic A. #00000000F1A7",
  buyerProfileId: "synthetic-profile",
  id,
  message: "Synthetic message",
  property: "123 Example St",
  propertyId: "synthetic-property",
  sentAt: "2026-10-12T17:00:00.000Z",
  sentAtDate: "2026-10-12",
  status,
  title: "Synthetic invite",
});

describe("buyer invite groups", () => {
  it("puts invites awaiting a reply first and keeps the server order inside each group", () => {
    const groups = groupBuyerInvites([
      invite("closed-new", "Expired"),
      invite("accepted", "Accepted"),
      invite("sent", "Sent"),
      invite("declined", "Declined"),
      invite("viewed", "Viewed"),
      invite("withdrawn", "Withdrawn"),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["awaiting", "accepted", "closed"]);
    expect(groups[0].invites.map((item) => item.id)).toEqual(["sent", "viewed"]);
    expect(groups[2].invites.map((item) => item.id)).toEqual(["closed-new", "declined", "withdrawn"]);
  });

  it("omits empty groups and keeps every invite", () => {
    const invites = [invite("a", "Accepted"), invite("b", "Accepted")];
    const groups = groupBuyerInvites(invites);
    expect(groups).toHaveLength(1);
    expect(groups.flatMap((group) => group.invites)).toHaveLength(invites.length);
  });
});
