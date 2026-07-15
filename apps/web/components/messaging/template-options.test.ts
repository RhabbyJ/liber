import { describe, expect, it } from "vitest";
import {
  buyerQuickReplyTemplates,
  sellerFollowUpTemplates,
  sellerOpeningTemplates,
} from "../../server/messaging/templates";
import { messagingTemplateLabel } from "./types";

describe("messaging template presentation", () => {
  it("labels every server-owned template without copying its rendered text", () => {
    const templates = [
      ...sellerOpeningTemplates,
      ...sellerFollowUpTemplates,
      ...buyerQuickReplyTemplates,
    ];

    for (const template of templates) {
      expect(messagingTemplateLabel(template.key)).not.toBe("Guided message");
      expect(template.text.length).toBeGreaterThan(0);
      expect(template.version).toBeGreaterThan(0);
    }
  });

  it("keeps seller openings on one form version", () => {
    expect(new Set(sellerOpeningTemplates.map((template) => template.version)).size).toBe(1);
  });
});
