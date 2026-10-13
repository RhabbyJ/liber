import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatLoiDateTime, loiSummaryRows, loiTermSections, normalizePropertyIdentity, type LoiPresentationRow } from "../../components/loi/loi-presentation";
import type { LoiNegotiation, LoiRevision } from "../../components/loi/loi-types";
import { loiUnavailable } from "./errors";

const WIDTH = 612;
const HEIGHT = 792;
const MARGIN = 48;
const INK = rgb(0.12, 0.2, 0.2);
const MUTED = rgb(0.36, 0.42, 0.42);
const GREEN = rgb(0.09, 0.35, 0.29);
const RULE = rgb(0.84, 0.89, 0.87);
let fontBytes: Promise<Buffer> | null = null;

export function alignedLoiRevision(negotiation: LoiNegotiation): LoiRevision {
  const revision = negotiation.revisions.find((item) => item.sequence === negotiation.currentSequence);
  if (negotiation.status !== "TERMS_ALIGNED" || !revision) throw loiUnavailable();
  return revision;
}

// The route supplies an already-authorized snapshot. Drafts never enter the export.
export async function createAlignedLoiPdf(negotiation: LoiNegotiation) {
  const revision = alignedLoiRevision(negotiation);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  // Read the bundled font once per server instance; retry after a failed read.
  fontBytes ??= readFile(path.join(process.cwd(), "public/fonts/DejaVuSans.ttf")).catch((error: unknown) => { fontBytes = null; throw error; });
  const font = await document.embedFont(await fontBytes);
  document.setTitle(`Liber - Aligned LOI - Revision ${revision.sequence}`);
  document.setAuthor("Liber");
  document.setSubject("Non-binding terms aligned for contract preparation");
  document.setCreationDate(new Date(revision.submittedAt));
  const identity = normalizePropertyIdentity(negotiation.propertySnapshot);
  let page: PDFPage;
  let y = 0;

  const newPage = () => {
    page = document.addPage([WIDTH, HEIGHT]);
    page.drawText("LIBER", { x: MARGIN, y: HEIGHT - 45, size: 13, font, color: GREEN });
    page.drawText(`Aligned LOI | Revision ${revision.sequence}`, { x: 326, y: HEIGHT - 44, size: 9, font, color: MUTED });
    page.drawLine({ start: { x: MARGIN, y: HEIGHT - 57 }, end: { x: WIDTH - MARGIN, y: HEIGHT - 57 }, thickness: 0.7, color: RULE });
    y = HEIGHT - 83;
  };
  const ensureSpace = (height: number) => { if (y - height < 66) newPage(); };
  const paragraph = (text: string, size = 10, color = INK, indent = 0, width = WIDTH - MARGIN * 2 - indent) => {
    for (const line of wrapPdfText(text, font, size, width)) {
      ensureSpace(size * 1.5);
      page.drawText(line, { x: MARGIN + indent, y, size, font, color });
      y -= size * 1.5;
    }
  };
  const heading = (text: string) => {
    ensureSpace(67);
    y -= 13;
    paragraph(text, 12, GREEN);
    y -= 7;
  };
  const row = ({ label, formattedValue }: Pick<LoiPresentationRow, "label" | "formattedValue">) => {
    const labelLines = wrapPdfText(label, font, 9, 170);
    const valueLines = wrapPdfText(formattedValue, font, 10, 324);
    const lines = Math.max(labelLines.length, valueLines.length);
    // Split long notes across pages; never truncate immutable submitted text.
    for (let index = 0; index < lines; index++) {
      ensureSpace(15);
      if (labelLines[index]) page.drawText(labelLines[index], { x: MARGIN, y, size: 9, font, color: MUTED });
      if (valueLines[index]) page.drawText(valueLines[index], { x: MARGIN + 190, y, size: 10, font, color: INK });
      y -= 15;
    }
    y -= 7;
  };

  newPage();
  paragraph("Terms aligned", 24, GREEN);
  y -= 8;
  paragraph("For contract preparation", 13, MUTED);
  y -= 17;
  paragraph(identity.title, 14);
  if (identity.location) paragraph(identity.location, 10, MUTED);
  y -= 15;
  paragraph("This is a non-binding record of the exact LOI revision both parties aligned on. It is not a signed purchase agreement, legal acceptance, escrow instruction, or payment request.", 10, MUTED);
  y -= 13;
  row({ label: "Revision submitted", formattedValue: `${formatLoiDateTime(revision.submittedAt)} by ${revision.submittedByRole.toLowerCase()}` });
  row({ label: "Negotiation reference", formattedValue: negotiation.id });
  row({ label: "Revision reference", formattedValue: revision.id });
  row({ label: "Calculation version", formattedValue: String(revision.computedSummary.calculationVersion) });
  heading("Financial summary");
  paragraph("Calculations and entered fees are estimates, not a closing statement. Unspecified costs are not confirmed as zero. Provider quotes, lender fees, taxes, prorations, and any seller loan payoff must be verified separately.", 9, MUTED);
  y -= 10;
  for (const value of loiSummaryRows(revision.computedSummary)) row(value);
  for (const section of loiTermSections(revision.terms, "SELLER")) {
    heading(section.title);
    for (const value of section.rows) row(value);
  }
  document.getPages().forEach((sheet, index, pages) => {
    sheet.drawLine({ start: { x: MARGIN, y: 47 }, end: { x: WIDTH - MARGIN, y: 47 }, thickness: 0.7, color: RULE });
    sheet.drawText("Private | Non-binding | For contract preparation", { x: MARGIN, y: 31, size: 8, font, color: MUTED });
    sheet.drawText(`${index + 1} / ${pages.length}`, { x: WIDTH - MARGIN - 28, y: 31, size: 8, font, color: MUTED });
  });
  return document.save();
}

export function wrapPdfText(text: string, font: Pick<PDFFont, "widthOfTextAtSize">, size: number, maxWidth: number) {
  const result: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { line = candidate; continue; }
      if (line) result.push(line);
      line = "";
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > maxWidth) { result.push(line); line = ""; }
        line += character;
      }
    }
    result.push(line);
  }
  return result;
}
