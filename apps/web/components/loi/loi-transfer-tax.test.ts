import { describe, expect, it } from "vitest";
import { calculateLoiLaCityTransferTaxes, calculateLoiPreview, calculateLoiSummary, loiComputedSummaryV4Schema, loiComputedSummaryV5Schema, loiEditableTermsV1Schema, type LoiTermsV1 } from "@liber/validators";
import { cashTerms } from "./loi-test-fixtures.test-helper";
import { loiFeeBreakdown } from "./loi-fee-breakdown";
import { loiSummaryRows, loiTermSections, semanticTermDiffs } from "./loi-presentation";
import { applyLoiTemplate, createLoiTemplate } from "./loi-template-values";
function terms(price=100_000_000): LoiTermsV1 {
 return {...structuredClone(cashTerms),purchasePriceCents:price,providers:{escrow:{choice:"LIBER_PREFERRED",feePayer:"EACH_OWN"},title:{choice:"LIBER_PREFERRED",feePayer:"SELLER"}},costsAndCredits:{...structuredClone(cashTerms.costsAndCredits),transferTaxSchedule:"LA_CITY_2026_2027",closingCostEstimates:{buyerEscrowCents:null,sellerEscrowCents:null,buyerTitleInsuranceCents:0,sellerTitleInsuranceCents:0,buyerOtherClosingCostsCents:0,sellerOtherClosingCostsCents:0,sellerAgentCommissionAmount:"0",note:"",itemizedCosts:{transferTaxes:{amountCents:999},governmentRetrofit:{amountCents:0}}}}};
}
describe("LA City transfer-tax schedule",()=>{
 it.each([[100_000_000,110_000,450_000,0,0],[100_000_001,110_055,450_225,0,0],[540_000_000,594_000,2_430_000,0,0],[540_000_001,594_055,2_430_225,21_600_000,400],[1_089_999_999,1_199_000,4_905_000,43_600_000,400],[1_090_000_000,1_199_000,4_905_000,59_950_000,550],[10_000,0,0,0,0],[10_001,55,225,0,0]])("calculates full-price taxes and exact boundary %i",(price,county,city,ula,rate)=>{
  expect(calculateLoiLaCityTransferTaxes(price)).toEqual({laCountyTransferTaxCents:county,laCityTransferTaxCents:city,measureUlaCents:ula,measureUlaRateBps:rate});
 });
 it.each([0,-1,1.5,10_000_000_001])("rejects invalid price %s",price=>{expect(calculateLoiLaCityTransferTaxes(price)).toBeNull();expect(calculateLoiPreview(terms(price))).toBeNull();});
 it("adds base taxes and per-side escrow once, ignoring a retained quote in rate mode",()=>{
  const value=terms();expect(calculateLoiSummary(value)).toMatchObject({calculationVersion:7,buyerEscrowCents:205_000,sellerEscrowCents:205_000,buyerTransferTaxCents:0,sellerTransferTaxCents:560_000,sellerItemizedCostsCents:560_000,buyerClosingCostsCents:205_000,sellerClosingCostsCents:765_000,buyerCashDueAtClosingCents:97_205_000,sellerCashBeforePayoffsCents:99_235_000,closingCostEstimateComplete:true});
  const fees=loiFeeBreakdown(value,calculateLoiSummary(value));expect(fees.find(row=>row.label==="City and county transfer taxes")).toMatchObject({buyerCents:0,sellerCents:560_000});
  expect(fees.some(row=>row.label==="Stored estimate adjustment")).toBe(false);
  expect(loiTermSections(value,"BUYER").flatMap(section=>section.rows).some(row=>row.fieldId.includes("itemizedCosts.transferTaxes"))).toBe(false);
 });
 it.each(["BUYER","SELLER","SPLIT_EQUALLY"] as const)("keeps ULA on seller while base tax payer is %s",payer=>{
  const value=terms(600_000_000);value.costsAndCredits.customaryClosingCosts=false;value.costsAndCredits.closingCostPayers={transferTaxes:payer,governmentRetrofitItems:"SELLER"};
  const buyer=payer==="BUYER"?3_360_000:payer==="SPLIT_EQUALLY"?1_680_000:0;
  const seller=3_360_000-buyer+24_000_000;const summary=calculateLoiSummary(value);
  expect(summary).toMatchObject({measureUlaCents:24_000_000,buyerTransferTaxCents:buyer,sellerTransferTaxCents:seller,buyerClosingCostsCents:buyer+1_080_000,sellerClosingCostsCents:seller+1_080_000});
  const rows=loiFeeBreakdown(value,summary);expect(rows.find(row=>row.label==="Measure ULA (seller · City of LA only)")).toMatchObject({buyerCents:0,sellerCents:24_000_000});
  expect(rows.reduce((sum,row)=>sum+(row.buyerCents??0)+(row.sellerCents??0),0)).toBe(summary.buyerClosingCostsCents+summary.sellerClosingCostsCents);
 });
 it.each(["BUYER","SELLER","SPLIT_EQUALLY"] as const)("charges a quoted ULA to the seller only while base tax payer is %s",payer=>{
  const value=terms(600_000_000);value.costsAndCredits.transferTaxSchedule="MANUAL";value.costsAndCredits.customaryClosingCosts=false;value.costsAndCredits.closingCostPayers={transferTaxes:payer,governmentRetrofitItems:"SELLER"};
  value.costsAndCredits.closingCostEstimates!.itemizedCosts!.transferTaxes={amountCents:3_360_000};value.costsAndCredits.closingCostEstimates!.sellerMeasureUlaCents=24_000_000;
  const buyer=payer==="BUYER"?3_360_000:payer==="SPLIT_EQUALLY"?1_680_000:0;const summary=calculateLoiSummary(value);
  expect(summary).toMatchObject({transferTaxSchedule:"MANUAL",measureUlaCents:24_000_000,measureUlaRateBps:null,buyerTransferTaxCents:buyer,sellerTransferTaxCents:3_360_000-buyer+24_000_000});
  const rows=loiFeeBreakdown(value,summary);expect(rows.find(row=>row.label==="Measure ULA (seller · City of LA only)")).toMatchObject({buyerCents:0,sellerCents:24_000_000});
  expect(rows.reduce((sum,row)=>sum+(row.buyerCents??0)+(row.sellerCents??0),0)).toBe(summary.buyerClosingCostsCents+summary.sellerClosingCostsCents);
  expect(loiSummaryRows(summary)).toContainEqual(expect.objectContaining({fieldId:"measureUlaCents",formattedValue:"$240,000.00"}));
  expect(loiTermSections(value,"SELLER").flatMap(section=>section.rows)).toContainEqual(expect.objectContaining({fieldId:"costsAndCredits.closingCostEstimates.sellerMeasureUlaCents"}));
 });
 it("ignores a stored ULA quote while LA City rates are selected",()=>{
  const value=terms(600_000_000);value.costsAndCredits.closingCostEstimates!.sellerMeasureUlaCents=1;
  expect(calculateLoiSummary(value)).toMatchObject({measureUlaCents:24_000_000,measureUlaRateBps:400});
  expect(loiTermSections(value,"SELLER").flatMap(section=>section.rows).some(row=>row.fieldId.endsWith("sellerMeasureUlaCents"))).toBe(false);
  expect(loiSummaryRows(calculateLoiSummary(value))).toContainEqual(expect.objectContaining({fieldId:"measureUlaRateBps",formattedValue:"4.0% of the full price"}));
  expect(loiSummaryRows(calculateLoiSummary(terms(540_000_000)))).toContainEqual(expect.objectContaining({fieldId:"measureUlaRateBps",formattedValue:"None — price at or below $5,400,000"}));
 });
 it("requires quoted mode for exemptions and keeps non-LA locations manual by default",()=>{
  const value=terms(600_000_000);delete value.costsAndCredits.transferTaxSchedule;
  value.costsAndCredits.closingCostEstimates!.itemizedCosts!.transferTaxes={amountCents:0};
  expect(calculateLoiSummary(value)).toMatchObject({transferTaxSchedule:"MANUAL",measureUlaCents:null,laCountyTransferTaxCents:null,laCityTransferTaxCents:null,sellerTransferTaxCents:0});
  value.costsAndCredits.closingCostEstimates!.itemizedCosts!.transferTaxes={amountCents:null};expect(calculateLoiSummary(value)).toMatchObject({sellerTransferTaxCents:null,closingCostEstimateComplete:false});
  expect(loiEditableTermsV1Schema.safeParse({...value,costsAndCredits:{...value.costsAndCredits,transferTaxSchedule:"WRONG_CITY"}}).success).toBe(false);
 });
 it("rejects an exempt payer with the taxable LA schedule and accepts quoted exemptions",()=>{
   const value=terms();value.costsAndCredits.customaryClosingCosts=false;value.costsAndCredits.closingCostPayers={transferTaxes:"NOT_APPLICABLE",governmentRetrofitItems:"SELLER"};
   const parsed=loiEditableTermsV1Schema.safeParse(value);expect(parsed.success ? [] : parsed.error.issues.map(issue=>issue.path.join("."))).toContain("costsAndCredits.transferTaxSchedule");
   value.costsAndCredits.transferTaxSchedule="MANUAL";expect(loiEditableTermsV1Schema.safeParse(value).success).toBe(true);
 });
 it("shows location/rate changes in review and recalculates when price crosses the ULA threshold",()=>{
  const before=terms(540_000_000),after=terms(540_000_001);before.costsAndCredits.transferTaxSchedule="MANUAL";
  expect(semanticTermDiffs(before,after,"BUYER")).toContainEqual(expect.objectContaining({fieldId:"costsAndCredits.transferTaxSchedule"}));
  expect(loiSummaryRows(calculateLoiSummary(after))).toContainEqual(expect.objectContaining({fieldId:"measureUlaCents",formattedValue:"$216,000.00"}));
 });
 it("keeps frozen V4/V5 summaries and fees authoritative in history",()=>{
  const value=terms(),current=calculateLoiSummary(value);
  const v6Keys=new Set(["titlePolicyEstimateCents", "miscClosingCostEstimateCents", "buyerTitleInsuranceCents", "sellerTitleInsuranceCents", "buyerOtherClosingCostsCents", "sellerOtherClosingCostsCents", "buyerClosingCostEstimateComplete", "sellerClosingCostEstimateComplete"]);
  const keys=new Set([...v6Keys,"transferTaxSchedule","laCountyTransferTaxCents","laCityTransferTaxCents","measureUlaCents","measureUlaRateBps","buyerTransferTaxCents","sellerTransferTaxCents"]);
  const old={...Object.fromEntries(Object.entries(current).filter(([key])=>!keys.has(key))),calculationVersion:4};
  expect(loiComputedSummaryV4Schema.parse(old)).toEqual(old);
  const stored={...Object.fromEntries(Object.entries(current).filter(([key])=>!v6Keys.has(key))),calculationVersion:5,laCountyTransferTaxCents:123,sellerTransferTaxCents:456};expect(loiComputedSummaryV5Schema.parse(stored)).toEqual(stored);
  const changed=terms(600_000_000);expect(loiFeeBreakdown(changed,loiComputedSummaryV5Schema.parse(stored)).find(row=>row.label==="City and county transfer taxes")?.sellerCents).toBe(456);
 });
 it("does not transfer an LA jurisdiction choice through a reusable template",()=>{
  const source=terms();const template=createLoiTemplate({id:"11111111-1111-4111-8111-111111111111",name:"Fixture",terms:source,now:"2026-10-07T12:00:00.000Z"});
  expect(template.terms.costsAndCredits.transferTaxSchedule).toBeUndefined();
  const other=terms();other.costsAndCredits.transferTaxSchedule="MANUAL";expect(applyLoiTemplate(other,template).costsAndCredits.transferTaxSchedule).toBe("MANUAL");
  const oldTemplate={...template,terms:{...template.terms,costsAndCredits:{...template.terms.costsAndCredits,transferTaxSchedule:"LA_CITY_2026_2027" as const}}};expect(applyLoiTemplate(other,oldTemplate).costsAndCredits.transferTaxSchedule).toBe("MANUAL");
  const quoted=terms();quoted.costsAndCredits.transferTaxSchedule="MANUAL";quoted.costsAndCredits.closingCostEstimates!.sellerMeasureUlaCents=24_000_000;
  const quotedTemplate=createLoiTemplate({id:"22222222-2222-4222-8222-222222222222",name:"Quoted",terms:quoted,now:"2026-10-07T12:00:00.000Z"});
  expect(quotedTemplate.terms.costsAndCredits.closingCostEstimates?.sellerMeasureUlaCents).toBeUndefined();
  other.costsAndCredits.closingCostEstimates!.sellerMeasureUlaCents=5_000;expect(applyLoiTemplate(other,quotedTemplate).costsAndCredits.closingCostEstimates?.sellerMeasureUlaCents).toBe(5_000);
 });
});
