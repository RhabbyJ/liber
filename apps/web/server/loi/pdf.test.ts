import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { negotiation, revision } from "../../components/loi/loi-test-fixtures.test-helper";
import { alignedLoiRevision, createAlignedLoiPdf, wrapPdfText } from "./pdf";

describe("aligned LOI PDF", () => {
  it("exports only the exact current aligned revision, never a private draft", async () => {
    const older = revision(1);
    const aligned = revision(2);
    const data = negotiation({ revisions: [aligned, older], currentSequence: 2, status: "TERMS_ALIGNED" });
    expect(alignedLoiRevision(data)).toBe(aligned);
    const bytes = await createAlignedLoiPdf(data);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("Liber - Aligned LOI - Revision 2");
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getPages().every((page) => page.getWidth() === 612 && page.getHeight() === 792)).toBe(true);
  });

  it.each(["AWAITING_BUYER_SUBMISSION", "AWAITING_SELLER_RESPONSE", "READ_ONLY", "EXPIRED", "DECLINED", "WITHDRAWN"])("rejects %s", (status) => {
    expect(() => alignedLoiRevision(negotiation({ status, revisions: [revision(1)] }))).toThrow("unavailable");
  });

  it("fails closed if the aligned revision is absent", () => {
    expect(() => alignedLoiRevision(negotiation({ status: "TERMS_ALIGNED", currentSequence: 2, revisions: [revision(1)] }))).toThrow("unavailable");
  });

  it("wraps long unbroken values and preserves paragraph breaks without dropping characters", () => {
    const font = { widthOfTextAtSize: (text: string) => text.length };
    const wrapped = wrapPdfText("longwordwithoutspaces\nJosé & Zoë", font, 10, 8);
    expect(wrapped.every((line) => line.length <= 8)).toBe(true);
    expect(wrapped.join("").replaceAll(" ", "")).toBe("longwordwithoutspacesJosé&Zoë");
  });

  it("paginates maximum-length notes and embeds accented names", async () => {
    const current = revision(1);
    current.terms = structuredClone(current.terms);
    current.terms.parties.buyerLegalName = "José García & Zoë Müller";
    current.terms.additionalTerms.proposedTerms = "Long detailed property notes. ".repeat(200);
    const pdf = await PDFDocument.load(await createAlignedLoiPdf(negotiation({ status: "TERMS_ALIGNED", revisions: [current] })));
    expect(pdf.getPageCount()).toBeGreaterThan(4);
  });
});
