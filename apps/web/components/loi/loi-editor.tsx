"use client";

import { LOI_MAX_ESCROW_DAYS, LOI_MAX_PRICE_CENTS, LOI_STANDARD_DEPOSIT_BPS, calculateLoiPreview, type LoiTermsV1 } from "@liber/validators";
import { useEffect, useRef, useState } from "react";

export type LoiTermsUpdater = (fieldPath: string, next: (terms: LoiTermsV1) => LoiTermsV1) => void;

export function LoiEditor({
  fieldErrors,
  mode = "INITIAL",
  terms,
  update,
}: {
  fieldErrors: Record<string, string>;
  mode?: "COUNTER" | "INITIAL";
  terms: LoiTermsV1;
  update: LoiTermsUpdater;
}) {
  const counter = mode === "COUNTER";
  const financed = terms.funding.type === "FINANCED" ? terms.funding : null;
  const sellerFinanced = terms.funding.type === "SELLER_FINANCING" ? terms.funding : null;

  useEffect(() => {
    if (terms.deposit.basis === "PERCENT" && terms.deposit.percentageBps === LOI_STANDARD_DEPOSIT_BPS) return;
    update("deposit", (value) => ({ ...value, deposit: { basis: "PERCENT", percentageBps: LOI_STANDARD_DEPOSIT_BPS } }));
  }, [terms.deposit, update]);

  useEffect(() => {
    if (terms.possession.type !== "SELLER_RENT_BACK") return;
    if (terms.possession.frequency === "THROUGH_ESCROW" || terms.possession.frequency === "MONTHLY") return;
    update("possession.frequency", (value) => value.possession.type === "SELLER_RENT_BACK"
      ? { ...value, possession: { ...value.possession, frequency: "THROUGH_ESCROW" } }
      : value);
  }, [terms.possession, update]);

  return (
    <form className="stack" id="loi-editor" onSubmit={(event) => event.preventDefault()}>
      <section className="card stack" aria-labelledby="loi-section-parties">
        <h2 id="loi-section-parties">1. Parties</h2>
        {counter ? <p className="small">Counters keep party details from the current version.</p> : null}
        <fieldset className="loi-lock stack" disabled={counter}>
        <TextField
          error={fieldErrors["parties.buyerLegalName"]}
          id="loi-legal-name"
          label="Buyer legal or entity name"
          maxLength={200}
          onChange={(buyerLegalName) => update("parties.buyerLegalName", (value) => ({ ...value, parties: { ...value.parties, buyerLegalName } }))}
          required
          value={terms.parties.buyerLegalName}
        />
        <p className="small">Final vesting can be changed in escrow.</p>
        <TextField
          error={fieldErrors["parties.vestingNote"]}
          id="loi-vesting"
          label="Vesting or taking-title note"
          maxLength={500}
          onChange={(vestingNote) => update("parties.vestingNote", (value) => ({ ...value, parties: { ...value.parties, vestingNote } }))}
          value={terms.parties.vestingNote}
        />
        <ContactFields
          errors={fieldErrors}
          id="loi-buyer"
          label="Buyer contact"
          onChange={(buyerContact) => update("parties.buyerContact", (value) => ({ ...value, parties: { ...value.parties, buyerContact } }))}
          path="parties.buyerContact"
          value={terms.parties.buyerContact}
        />
        </fieldset>
      </section>

      <section className="card stack" aria-labelledby="loi-section-funding">
        <h2 id="loi-section-funding">2. Purchase price and funding</h2>
        <MoneyField
          cents={terms.purchasePriceCents}
          error={fieldErrors.purchasePriceCents}
          id="loi-price"
          label="Offer price"
          minCents={1}
          onChange={(purchasePriceCents) => update("purchasePriceCents", (value) => {
            const funding = value.funding.type === "SELLER_FINANCING"
              ? {
                  ...value.funding,
                  principalCents: Math.max(purchasePriceCents - value.funding.cashDownPaymentCents, 0),
                }
              : value.funding;
            return { ...value, funding, purchasePriceCents };
          })}
        />
        <fieldset className="loi-lock stack" disabled={counter}>
        <SelectField
          error={fieldErrors["funding.type"]}
          id="loi-funding"
          label="Funding"
          onChange={(type) => update("funding.type", (value) => ({
            ...value,
            funding: fundingFor(type, value.purchasePriceCents),
            timing: type === "CASH" ? { ...value.timing, loanContingencyDays: null } : value.timing,
          }))}
          options={[
            ["CASH", "Cash"],
            ["FINANCED", "Financed"],
            ["SELLER_FINANCING", "Seller financing"],
          ]}
          value={terms.funding.type}
        />

        {financed ? (
          <div className="stack">
            <div className="grid two">
              <MoneyField
                cents={financed.downPaymentCents}
                error={fieldErrors["funding.downPaymentCents"]}
                id="loi-down-payment"
                label="Down payment"
                onChange={(downPaymentCents) => update("funding.downPaymentCents", (value) => value.funding.type === "FINANCED" ? { ...value, funding: { ...value.funding, downPaymentCents } } : value)}
              />
              <SelectField
                error={fieldErrors["funding.loanType"]}
                id="loi-loan-type"
                label="Loan type"
                onChange={(loanType) => update("funding.loanType", (value) => value.funding.type === "FINANCED" ? { ...value, funding: { ...value.funding, loanType: loanType as "CONVENTIONAL" | "FHA" | "REHAB" | "OTHER" } } : value)}
                options={[["CONVENTIONAL", "Conventional"], ["FHA", "FHA"], ["REHAB", "Rehab"], ["OTHER", "Other"]]}
                value={financed.loanType}
              />
            </div>
            <ContactFields
              errors={fieldErrors}
              id="loi-lender"
              label="Lender contact"
              onChange={(lender) => update("funding.lender", (value) => value.funding.type === "FINANCED" ? { ...value, funding: { ...value.funding, lender } } : value)}
              path="funding.lender"
              value={financed.lender}
            />
            <p className="small">Financed terms need a pre-approval badge or an uploaded pre-approval letter before submit.</p>
            <TextField
              error={fieldErrors["funding.note"]}
              id="loi-loan-note"
              label={financed.loanType === "OTHER" ? "Other loan type (required)" : "Financing note"}
              maxLength={500}
              onChange={(note) => update("funding.note", (value) => value.funding.type === "FINANCED" ? { ...value, funding: { ...value.funding, note } } : value)}
              required={financed.loanType === "OTHER"}
              value={financed.note}
            />
          </div>
        ) : null}

        {sellerFinanced ? (
          <div className="stack">
            <div className="grid two">
              <MoneyField
                cents={sellerFinanced.cashDownPaymentCents}
                error={fieldErrors["funding.cashDownPaymentCents"]}
                id="loi-sf-down"
                label="Cash down payment"
                onChange={(cashDownPaymentCents) => update("funding.cashDownPaymentCents", (value) => value.funding.type === "SELLER_FINANCING" ? {
                  ...value,
                  funding: {
                    ...value.funding,
                    cashDownPaymentCents,
                    principalCents: Math.max(value.purchasePriceCents - cashDownPaymentCents, 0),
                  },
                } : value)}
              />
              <MoneyField
                cents={sellerFinanced.principalCents}
                error={fieldErrors["funding.principalCents"]}
                id="loi-sf-principal"
                label="Seller-financed principal"
                minCents={1}
                onChange={(principalCents) => update("funding.principalCents", (value) => value.funding.type === "SELLER_FINANCING" ? { ...value, funding: { ...value.funding, principalCents } } : value)}
              />
              <PercentageField
                basisPoints={sellerFinanced.annualInterestBps}
                error={fieldErrors["funding.annualInterestBps"]}
                id="loi-sf-rate"
                label="Annual interest rate"
                maxBasisPoints={5_000}
                onChange={(annualInterestBps) => update("funding.annualInterestBps", (value) => value.funding.type === "SELLER_FINANCING" ? { ...value, funding: { ...value.funding, annualInterestBps } } : value)}
              />
              <NumberField
                error={fieldErrors["funding.termMonths"]}
                id="loi-sf-term"
                label="Term (months)"
                max={600}
                min={1}
                onChange={(termMonths) => update("funding.termMonths", (value) => value.funding.type === "SELLER_FINANCING" ? { ...value, funding: { ...value.funding, termMonths } } : value)}
                value={sellerFinanced.termMonths}
              />
              <NullableNumberField
                error={fieldErrors["funding.amortizationMonths"]}
                id="loi-sf-amortization"
                label="Amortization (months)"
                max={600}
                min={1}
                onChange={(amortizationMonths) => update("funding.amortizationMonths", (value) => value.funding.type === "SELLER_FINANCING" ? { ...value, funding: { ...value.funding, amortizationMonths } } : value)}
                value={sellerFinanced.amortizationMonths}
              />
              <NullableNumberField
                error={fieldErrors["funding.balloonMonth"]}
                id="loi-sf-balloon"
                label="Balloon month"
                max={600}
                min={1}
                onChange={(balloonMonth) => update("funding.balloonMonth", (value) => value.funding.type === "SELLER_FINANCING" ? { ...value, funding: { ...value.funding, balloonMonth } } : value)}
                value={sellerFinanced.balloonMonth}
              />
            </div>
            <CheckboxField
              checked={sellerFinanced.interestOnly}
              error={fieldErrors["funding.interestOnly"]}
              id="loi-sf-interest-only"
              label="Interest-only treatment"
              onChange={(interestOnly) => update("funding.interestOnly", (value) => value.funding.type === "SELLER_FINANCING" ? {
                ...value,
                funding: { ...value.funding, amortizationMonths: interestOnly ? null : value.funding.amortizationMonths, interestOnly },
              } : value)}
            />
            <TextField
              error={fieldErrors["funding.note"]}
              id="loi-sf-note"
              label="Seller-financing note"
              maxLength={1000}
              onChange={(note) => update("funding.note", (value) => value.funding.type === "SELLER_FINANCING" ? { ...value, funding: { ...value.funding, note } } : value)}
              value={sellerFinanced.note}
            />
          </div>
        ) : null}
        </fieldset>
      </section>

      <section className="card stack" aria-labelledby="loi-section-deposit">
        <h2 id="loi-section-deposit">3. Earnest-money deposit</h2>
        <p className="small">Set at 3% of the offer price and calculated automatically.</p>
        <p id="loi-deposit-percent">
          <strong>{formatDepositPreview(terms)}</strong>
          <span className="small"> {LOI_STANDARD_DEPOSIT_BPS / 100}% of {formatDepositPrice(terms.purchasePriceCents)}</span>
        </p>
      </section>

      <section className="card stack" aria-labelledby="loi-section-timing">
        <h2 id="loi-section-timing">4. Timing and contingencies</h2>
        <div className="grid two">
          <NumberField error={fieldErrors["timing.closingDays"]} id="loi-closing" label="Escrow / closing days" max={LOI_MAX_ESCROW_DAYS} min={1} onChange={(closingDays) => update("timing.closingDays", (value) => ({ ...value, timing: { ...value.timing, closingDays: Math.min(Math.max(closingDays, 1), LOI_MAX_ESCROW_DAYS) } }))} value={terms.timing.closingDays} />
          <NumberField error={fieldErrors["timing.inspectionContingencyDays"]} id="loi-inspection" label="Physical inspection days" min={0} onChange={(inspectionContingencyDays) => update("timing.inspectionContingencyDays", (value) => ({ ...value, timing: { ...value.timing, inspectionContingencyDays } }))} value={terms.timing.inspectionContingencyDays} />
          <NumberField error={fieldErrors["timing.sellerDisclosureReviewDays"]} id="loi-disclosure" label="Disclosure review days" min={0} onChange={(sellerDisclosureReviewDays) => update("timing.sellerDisclosureReviewDays", (value) => ({ ...value, timing: { ...value.timing, sellerDisclosureReviewDays } }))} value={terms.timing.sellerDisclosureReviewDays} />
          <NumberField error={fieldErrors["timing.titleReviewDays"]} id="loi-title-review" label="Title review days" min={0} onChange={(titleReviewDays) => update("timing.titleReviewDays", (value) => ({ ...value, timing: { ...value.timing, titleReviewDays } }))} value={terms.timing.titleReviewDays} />
          <NullableNumberField error={fieldErrors["timing.appraisalContingencyDays"]} id="loi-appraisal" label="Appraisal contingency days" max={365} min={0} onChange={(appraisalContingencyDays) => update("timing.appraisalContingencyDays", (value) => ({ ...value, timing: { ...value.timing, appraisalContingencyDays } }))} value={terms.timing.appraisalContingencyDays} />
          <NullableNumberField error={fieldErrors["timing.loanContingencyDays"]} id="loi-loan-contingency" label="Loan contingency days" max={365} min={0} onChange={(loanContingencyDays) => update("timing.loanContingencyDays", (value) => ({ ...value, timing: { ...value.timing, loanContingencyDays } }))} value={terms.timing.loanContingencyDays} />
        </div>
      </section>

      <section className="card stack" aria-labelledby="loi-section-possession">
        <h2 id="loi-section-possession">5. Possession and representation</h2>
        <SelectField
          error={fieldErrors["possession.type"]}
          id="loi-possession"
          label="Possession"
          onChange={(type) => update("possession.type", (value) => ({ ...value, possession: possessionFor(type) }))}
          options={[["AT_CLOSING", "At closing"], ["DAYS_AFTER_CLOSING", "Days after closing"], ["SELLER_RENT_BACK", "Seller rent-back"], ["TENANT_REMAINS", "Tenant remains"], ["OTHER", "Other"]]}
          value={terms.possession.type}
        />
        {terms.possession.type === "DAYS_AFTER_CLOSING" ? <NumberField error={fieldErrors["possession.daysAfterClosing"]} id="loi-possession-days" label="Days after closing" min={1} onChange={(daysAfterClosing) => update("possession.daysAfterClosing", (value) => ({ ...value, possession: { daysAfterClosing, type: "DAYS_AFTER_CLOSING" } }))} value={terms.possession.daysAfterClosing} /> : null}
        {terms.possession.type === "SELLER_RENT_BACK" ? (
          <div className="grid three">
            <NumberField error={fieldErrors["possession.days"]} id="loi-rentback-days" label="Rent-back days" min={1} onChange={(days) => update("possession.days", (value) => value.possession.type === "SELLER_RENT_BACK" ? { ...value, possession: { ...value.possession, days } } : value)} value={terms.possession.days} />
            <MoneyField cents={terms.possession.amountCents} error={fieldErrors["possession.amountCents"]} id="loi-rentback-amount" label="Rent-back amount" onChange={(amountCents) => update("possession.amountCents", (value) => value.possession.type === "SELLER_RENT_BACK" ? { ...value, possession: { ...value.possession, amountCents } } : value)} />
            <SelectField error={fieldErrors["possession.frequency"]} id="loi-rentback-frequency" label="Payment frequency" onChange={(frequency) => update("possession.frequency", (value) => value.possession.type === "SELLER_RENT_BACK" ? { ...value, possession: { ...value.possession, frequency: frequency as "THROUGH_ESCROW" | "MONTHLY" | "DAILY" | "WEEKLY" } } : value)} options={rentbackFrequencyOptions(terms.possession.frequency)} value={terms.possession.frequency} />
          </div>
        ) : null}
        {terms.possession.type === "TENANT_REMAINS" ? (
          <div className="stack">
            <CheckboxField checked={terms.possession.estoppelRequired} error={fieldErrors["possession.estoppelRequired"]} id="loi-estoppel" label="Require estoppel certificate" onChange={(estoppelRequired) => update("possession.estoppelRequired", (value) => value.possession.type === "TENANT_REMAINS" ? { ...value, possession: { ...value.possession, estoppelRequired } } : value)} />
            <TextField error={fieldErrors["possession.note"]} id="loi-tenant-note" label="Tenant possession details" maxLength={1000} onChange={(note) => update("possession.note", (value) => value.possession.type === "TENANT_REMAINS" ? { ...value, possession: { ...value.possession, note } } : value)} required value={terms.possession.note} />
          </div>
        ) : null}
        {terms.possession.type === "OTHER" ? <TextField error={fieldErrors["possession.note"]} id="loi-possession-note" label="Other possession terms" maxLength={1000} onChange={(note) => update("possession.note", (value) => ({ ...value, possession: { note, type: "OTHER" } }))} required value={terms.possession.note} /> : null}

        <fieldset className="loi-lock stack" disabled={counter}>
          <CheckboxField
            checked={terms.representation.buyerRepresented}
            error={fieldErrors["representation.buyerRepresented"]}
            id="loi-buyer-represented"
            label="Will you be using an agent?"
            onChange={(buyerRepresented) => update("representation.buyerRepresented", (value) => ({
              ...value,
              representation: {
                agent: buyerRepresented ? value.representation.agent : emptyAgent(),
                buyerRepresented,
                commissionAmount: buyerRepresented ? value.representation.commissionAmount : "",
                commissionPayer: buyerRepresented ? value.representation.commissionPayer : null,
              },
            }))}
          />
          {terms.representation.buyerRepresented ? (
            <>
              <ContactFields
                errors={fieldErrors}
                id="loi-agent"
                label="Buyer agent"
                onChange={(agent) => update("representation.agent", (value) => ({
                  ...value,
                  representation: {
                    ...value.representation,
                    agent: { ...agent, license: value.representation.agent.license },
                  },
                }))}
                path="representation.agent"
                value={terms.representation.agent}
              />
              <TextField
                error={fieldErrors["representation.agent.license"]}
                id="loi-agent-license"
                label="Agent license #"
                maxLength={40}
                onChange={(license) => update("representation.agent.license", (value) => ({ ...value, representation: { ...value.representation, agent: { ...value.representation.agent, license } } }))}
                value={terms.representation.agent.license}
              />
            </>
          ) : null}
        </fieldset>
        {terms.representation.buyerRepresented ? (
          <div className="grid two">
            <TextField
              error={fieldErrors["representation.commissionAmount"]}
              id="loi-agent-commission"
              label="Commission amount ($ or % of sales price)"
              maxLength={80}
              onChange={(commissionAmount) => update("representation.commissionAmount", (value) => ({ ...value, representation: { ...value.representation, commissionAmount } }))}
              required
              value={terms.representation.commissionAmount}
            />
            <SelectField
              error={fieldErrors["representation.commissionPayer"]}
              id="loi-agent-commission-payer"
              label="Who pays agent commission"
              onChange={(commissionPayer) => update("representation.commissionPayer", (value) => ({
                ...value,
                representation: {
                  ...value.representation,
                  commissionPayer: commissionPayer === "BUYER" || commissionPayer === "SELLER" ? commissionPayer : null,
                },
              }))}
              options={[["", "Select who pays"], ["SELLER", "Seller"], ["BUYER", "Buyer"]]}
              value={terms.representation.commissionPayer ?? ""}
            />
          </div>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby="loi-section-costs">
        <h2 id="loi-section-costs">6. Escrow, title, warranty, and costs</h2>
        <div className="grid two">
          <ProviderField errors={fieldErrors} kind="escrow" label="Proposed escrow provider" onChange={(escrow) => update("providers.escrow", (value) => ({ ...value, providers: { ...value.providers, escrow: escrow as LoiTermsV1["providers"]["escrow"] } }))} value={terms.providers.escrow} />
          <fieldset className="loi-lock" disabled={counter}>
            <ProviderField errors={fieldErrors} kind="title" label="Proposed title provider" onChange={(title) => update("providers.title", (value) => ({ ...value, providers: { ...value.providers, title: title as LoiTermsV1["providers"]["title"] } }))} value={terms.providers.title} />
          </fieldset>
        </div>
        <MoneyField cents={terms.costsAndCredits.sellerCreditCents} error={fieldErrors["costsAndCredits.sellerCreditCents"]} id="loi-credit" label="Seller credit" onChange={(sellerCreditCents) => update("costsAndCredits.sellerCreditCents", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, sellerCreditCents } }))} />
        <TextField error={fieldErrors["costsAndCredits.sellerCreditNote"]} id="loi-credit-note" label="Seller credit note" maxLength={500} onChange={(sellerCreditNote) => update("costsAndCredits.sellerCreditNote", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, sellerCreditNote } }))} value={terms.costsAndCredits.sellerCreditNote} />
        <CheckboxField
          checked={terms.costsAndCredits.customaryClosingCosts}
          error={fieldErrors["costsAndCredits.customaryClosingCosts"]}
          id="loi-customary-costs"
          label="Recommend customary closing-cost allocation"
          onChange={(customaryClosingCosts) => update("costsAndCredits.customaryClosingCosts", (value) => ({
            ...value,
            costsAndCredits: {
              ...value.costsAndCredits,
              alternateClosingCostAllocation: customaryClosingCosts ? "" : value.costsAndCredits.alternateClosingCostAllocation,
              customaryClosingCosts,
            },
          }))}
        />
        <p className="small">Recommended. Uncheck only if you need a different city/county tax or retrofit allocation.</p>
        {!terms.costsAndCredits.customaryClosingCosts ? <TextField error={fieldErrors["costsAndCredits.alternateClosingCostAllocation"]} id="loi-alternate-costs" label="Alternate closing-cost allocation" maxLength={1000} onChange={(alternateClosingCostAllocation) => update("costsAndCredits.alternateClosingCostAllocation", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, alternateClosingCostAllocation } }))} required value={terms.costsAndCredits.alternateClosingCostAllocation} /> : null}
        <fieldset className="loi-lock" disabled={counter}>
        <CheckboxField
          checked={terms.costsAndCredits.homeWarranty.included}
          error={fieldErrors["costsAndCredits.homeWarranty.included"]}
          id="loi-warranty-included"
          label="Include a proposed home warranty"
          onChange={(included) => update("costsAndCredits.homeWarranty.included", (value) => ({
            ...value,
            costsAndCredits: {
              ...value.costsAndCredits,
              homeWarranty: included
                ? { ...value.costsAndCredits.homeWarranty, included: true }
                : { company: "", included: false, maximumCents: 0, payer: "SELLER", payerNote: "", specialInclusions: "" },
            },
          }))}
        />
        </fieldset>
        {terms.costsAndCredits.homeWarranty.included ? (
          <div className="stack">
            <div className="grid three">
              <fieldset className="loi-lock" disabled={counter}>
                <TextField error={fieldErrors["costsAndCredits.homeWarranty.company"]} id="loi-warranty-company" label="Warranty company" maxLength={160} onChange={(company) => update("costsAndCredits.homeWarranty.company", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, homeWarranty: { ...value.costsAndCredits.homeWarranty, company } } }))} required value={terms.costsAndCredits.homeWarranty.company} />
              </fieldset>
              <MoneyField cents={terms.costsAndCredits.homeWarranty.maximumCents} error={fieldErrors["costsAndCredits.homeWarranty.maximumCents"]} id="loi-warranty-max" label="Warranty maximum" minCents={1} onChange={(maximumCents) => update("costsAndCredits.homeWarranty.maximumCents", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, homeWarranty: { ...value.costsAndCredits.homeWarranty, maximumCents } } }))} />
              <SelectField
                error={fieldErrors["costsAndCredits.homeWarranty.payer"]}
                id="loi-warranty-payer"
                label="Who pays home warranty?"
                onChange={(payer) => update("costsAndCredits.homeWarranty.payer", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, homeWarranty: { ...value.costsAndCredits.homeWarranty, payer: payer as "BUYER" | "SELLER" | "EACH_OWN" | "OTHER", payerNote: payer === "OTHER" ? value.costsAndCredits.homeWarranty.payerNote : "" } } }))}
                options={[["BUYER", "Buyer"], ["SELLER", "Seller"], ["EACH_OWN", "Each pays own"], ["OTHER", "Other"]]}
                value={terms.costsAndCredits.homeWarranty.payer}
              />
            </div>
            <fieldset className="loi-lock" disabled={counter}>
            <TextField
              error={fieldErrors["costsAndCredits.homeWarranty.specialInclusions"]}
              id="loi-warranty-inclusions"
              label="Special inclusions (pool, spa, extra AC, etc.)"
              maxLength={1000}
              onChange={(specialInclusions) => update("costsAndCredits.homeWarranty.specialInclusions", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, homeWarranty: { ...value.costsAndCredits.homeWarranty, specialInclusions } } }))}
              value={terms.costsAndCredits.homeWarranty.specialInclusions}
            />
            </fieldset>
            {terms.costsAndCredits.homeWarranty.payer === "OTHER" ? <TextField error={fieldErrors["costsAndCredits.homeWarranty.payerNote"]} id="loi-warranty-payer-note" label="Warranty cost-allocation note" maxLength={500} onChange={(payerNote) => update("costsAndCredits.homeWarranty.payerNote", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, homeWarranty: { ...value.costsAndCredits.homeWarranty, payerNote } } }))} required value={terms.costsAndCredits.homeWarranty.payerNote} /> : null}
          </div>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby="loi-section-personal-property">
        <h2 id="loi-section-personal-property">7. HOA and personal property</h2>
        <fieldset className="loi-lock" disabled={counter}>
        <div className="grid three">
          <SelectField
            error={fieldErrors["hoa.documentFeePayer"]}
            id="hoa-document-fee-payer"
            label="HOA document fee"
            onChange={(documentFeePayer) => update("hoa.documentFeePayer", (value) => ({ ...value, hoa: { ...value.hoa, documentFeePayer: documentFeePayer as LoiTermsV1["hoa"]["documentFeePayer"] } }))}
            options={hoaDocumentFeeOptions(terms.hoa.documentFeePayer)}
            value={terms.hoa.documentFeePayer}
          />
          <PayerField error={fieldErrors["hoa.certificateFeePayer"]} id="hoa-certificate-fee-payer" label="HOA certificate fee" onChange={(certificateFeePayer) => update("hoa.certificateFeePayer", (value) => ({ ...value, hoa: { ...value.hoa, certificateFeePayer } }))} value={terms.hoa.certificateFeePayer} />
          <PayerField error={fieldErrors["hoa.transferFeePayer"]} id="hoa-transfer-fee-payer" label="HOA transfer fee" onChange={(transferFeePayer) => update("hoa.transferFeePayer", (value) => ({ ...value, hoa: { ...value.hoa, transferFeePayer } }))} value={terms.hoa.transferFeePayer} />
        </div>
        </fieldset>
        <CheckboxField checked={terms.personalProperty.included} error={fieldErrors["personalProperty.included"]} id="loi-personal-property" label="Sale to include personal property?" onChange={(included) => update("personalProperty.included", (value) => ({ ...value, personalProperty: { ...value.personalProperty, included, includedItems: included ? value.personalProperty.includedItems : [], payer: included ? value.personalProperty.payer : "SELLER" } }))} />
        <p className="small">Attached furniture belongs with the property. TVs are excluded by default unless listed.</p>
        {terms.personalProperty.included ? (
          <div className="grid two">
            <TextField error={fieldErrors["personalProperty.includedItems"]} id="loi-items" label="Requested items (comma separated)" maxLength={6_098} onChange={(input) => update("personalProperty.includedItems", (value) => ({ ...value, personalProperty: { ...value.personalProperty, includedItems: input.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 50) } }))} required value={terms.personalProperty.includedItems.join(", ")} />
            <SelectField error={fieldErrors["personalProperty.payer"]} id="loi-personal-property-payer" label="Who pays for included items" onChange={(payer) => update("personalProperty.payer", (value) => ({ ...value, personalProperty: { ...value.personalProperty, payer: payer === "BUYER" ? "BUYER" : "SELLER" } }))} options={[["SELLER", "Seller"], ["BUYER", "Buyer"]]} value={terms.personalProperty.payer} />
          </div>
        ) : null}
        <TextField error={fieldErrors["personalProperty.excludedItems"]} id="loi-excluded-items" label="Excluded personal-property items" maxLength={2000} onChange={(excludedItems) => update("personalProperty.excludedItems", (value) => ({ ...value, personalProperty: { ...value.personalProperty, excludedItems } }))} value={terms.personalProperty.excludedItems} />
      </section>

      <section className="card stack" aria-labelledby="loi-section-disclosures">
        <h2 id="loi-section-disclosures">8. Disclosures</h2>
        <SelectField
          error={fieldErrors["disclosures.deathOnProperty"]}
          id="loi-disclosure-death"
          label="Death on the property"
          onChange={(deathOnProperty) => update("disclosures.deathOnProperty", (value) => ({
            ...value,
            disclosures: {
              ...value.disclosures,
              deathOnProperty: deathOnProperty === "YES" || deathOnProperty === "NO" ? deathOnProperty : "UNKNOWN",
            },
          }))}
          options={[["UNKNOWN", "Not specified"], ["NO", "No"], ["YES", "Yes"]]}
          value={terms.disclosures.deathOnProperty}
        />
        <TextAreaField error={fieldErrors["disclosures.condition"]} id="loi-disclosure-condition" label="Property condition" maxLength={2000} onChange={(condition) => update("disclosures.condition", (value) => ({ ...value, disclosures: { ...value.disclosures, condition } }))} rows={4} value={terms.disclosures.condition} />
        <TextAreaField error={fieldErrors["disclosures.conditionsOfSale"]} id="loi-disclosure-sale" label="Conditions of sale" maxLength={2000} onChange={(conditionsOfSale) => update("disclosures.conditionsOfSale", (value) => ({ ...value, disclosures: { ...value.disclosures, conditionsOfSale } }))} rows={4} value={terms.disclosures.conditionsOfSale} />
      </section>

      <section className="card stack" aria-labelledby="loi-section-additional">
        <h2 id="loi-section-additional">9. Additional terms</h2>
        <fieldset className="loi-lock stack" disabled={counter}>
        <TextAreaField error={fieldErrors["additionalTerms.proposedTerms"]} id="loi-additional" label="Additional proposed terms" maxLength={4000} onChange={(proposedTerms) => update("additionalTerms.proposedTerms", (value) => ({ ...value, additionalTerms: { ...value.additionalTerms, proposedTerms } }))} rows={6} value={terms.additionalTerms.proposedTerms} />
        <TextAreaField error={fieldErrors["additionalTerms.exclusions"]} id="loi-exclusions" label="Explicit exclusions" maxLength={4000} onChange={(exclusions) => update("additionalTerms.exclusions", (value) => ({ ...value, additionalTerms: { ...value.additionalTerms, exclusions } }))} rows={4} value={terms.additionalTerms.exclusions} />
        </fieldset>
      </section>
    </form>
  );
}

function fundingFor(type: string, price: number): LoiTermsV1["funding"] {
  if (type === "FINANCED") return { downPaymentCents: 0, lender: emptyContact(), loanType: "CONVENTIONAL", note: "", type: "FINANCED" };
  if (type === "SELLER_FINANCING") return { amortizationMonths: 360, annualInterestBps: 600, balloonMonth: null, cashDownPaymentCents: 0, interestOnly: false, note: "", principalCents: price, termMonths: 360, type: "SELLER_FINANCING" };
  return { type: "CASH" };
}

function possessionFor(type: string): LoiTermsV1["possession"] {
  if (type === "DAYS_AFTER_CLOSING") return { daysAfterClosing: 1, type: "DAYS_AFTER_CLOSING" };
  if (type === "SELLER_RENT_BACK") return { amountCents: 0, days: 1, frequency: "THROUGH_ESCROW", type: "SELLER_RENT_BACK" };
  if (type === "TENANT_REMAINS") return { estoppelRequired: false, note: "", type: "TENANT_REMAINS" };
  if (type === "OTHER") return { note: "", type: "OTHER" };
  return { type: "AT_CLOSING" };
}

function emptyContact() {
  return { company: "", email: "", name: "", phone: "" };
}

function emptyAgent() {
  return { ...emptyContact(), license: "" };
}

type Contact = ReturnType<typeof emptyContact>;
type AgentContact = ReturnType<typeof emptyAgent>;

function ContactFields({ errors, id, label, onChange, path, value }: { errors: Record<string, string>; id: string; label: string; onChange: (value: Contact) => void; path: string; value: Contact | AgentContact }) {
  return (
    <fieldset className="loi-fieldset stack tight">
      <legend>{label}</legend>
      <div className="grid two">
        <TextField error={errors[`${path}.name`]} id={`${id}-name`} label="Contact name" maxLength={160} onChange={(name) => onChange({ company: value.company, email: value.email, name, phone: value.phone })} value={value.name} />
        <TextField error={errors[`${path}.company`]} id={`${id}-company`} label="Company" maxLength={160} onChange={(company) => onChange({ company, email: value.email, name: value.name, phone: value.phone })} value={value.company} />
        <TextField error={errors[`${path}.email`]} id={`${id}-email`} label="Email" maxLength={254} onChange={(email) => onChange({ company: value.company, email, name: value.name, phone: value.phone })} type="email" value={value.email} />
        <TextField error={errors[`${path}.phone`]} id={`${id}-phone`} label="Phone" maxLength={40} onChange={(phone) => onChange({ company: value.company, email: value.email, name: value.name, phone })} type="tel" value={value.phone} />
      </div>
    </fieldset>
  );
}

function ProviderField({ errors, kind, label, onChange, value }: { errors: Record<string, string>; kind: "escrow" | "title"; label: string; onChange: (value: LoiTermsV1["providers"]["escrow"] | LoiTermsV1["providers"]["title"]) => void; value: LoiTermsV1["providers"]["escrow"] | LoiTermsV1["providers"]["title"] }) {
  const id = `proposed-${kind}-provider-choice`;
  const path = `providers.${kind}`;
  const feePayer = kind === "escrow" && "feePayer" in value ? value.feePayer : "SELLER";
  return (
    <div className="stack tight">
      <SelectField
        error={errors[`${path}.choice`]}
        id={id}
        label={label}
        onChange={(choice) => onChange(kind === "escrow"
          ? choice === "CUSTOM" ? { choice: "CUSTOM", company: emptyContact(), feePayer } : { choice: "LIBER_PREFERRED", feePayer }
          : choice === "CUSTOM" ? { choice: "CUSTOM", company: emptyContact() } : { choice: "LIBER_PREFERRED" })}
        options={[["LIBER_PREFERRED", "Liber-preferred option"], ["CUSTOM", "Custom company"]]}
        value={value.choice}
      />
      {kind === "escrow" ? (
        <SelectField
          error={errors["providers.escrow.feePayer"]}
          id="loi-escrow-fee-payer"
          label="Who pays escrow"
          onChange={(next) => onChange(value.choice === "CUSTOM"
            ? { choice: "CUSTOM", company: value.company, feePayer: next === "BUYER" ? "BUYER" : "SELLER" }
            : { choice: "LIBER_PREFERRED", feePayer: next === "BUYER" ? "BUYER" : "SELLER" })}
          options={[["SELLER", "Seller"], ["BUYER", "Buyer"]]}
          value={feePayer}
        />
      ) : null}
      {value.choice === "CUSTOM" ? <ContactFields errors={errors} id={id} label={`${kind === "escrow" ? "Escrow" : "Title"} company contact`} onChange={(company) => onChange(kind === "escrow" ? { choice: "CUSTOM", company, feePayer } : { choice: "CUSTOM", company })} path={`${path}.company`} value={value.company} /> : null}
    </div>
  );
}

function rentbackFrequencyOptions(current: "THROUGH_ESCROW" | "MONTHLY" | "DAILY" | "WEEKLY") {
  const options: Array<[string, string]> = [
    ["THROUGH_ESCROW", "Paid through escrow"],
    ["MONTHLY", "Paid monthly"],
  ];
  if (current === "DAILY" || current === "WEEKLY") {
    options.unshift([current, current === "DAILY" ? "Daily" : "Weekly"]);
  }
  return options;
}

function hoaDocumentFeeOptions(current: LoiTermsV1["hoa"]["documentFeePayer"]) {
  const options: Array<[string, string]> = [
    ["NOT_APPLICABLE", "Not applicable"],
    ["BUYER", "Buyer"],
    ["SELLER", "Seller"],
  ];
  if (current === "EACH_OWN") options.push(["EACH_OWN", "Each pays own"]);
  return options;
}

function formatDepositPreview(terms: LoiTermsV1) {
  const preview = calculateLoiPreview({ ...terms, deposit: { basis: "PERCENT", percentageBps: LOI_STANDARD_DEPOSIT_BPS } });
  if (!preview) return "3% of offer price";
  return new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2, style: "currency" }).format(preview.earnestMoneyCents / 100);
}

function formatDepositPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" }).format(cents / 100);
}

type HoaPayer = LoiTermsV1["hoa"]["documentFeePayer"];
function PayerField({ error, id, label, onChange, value }: { error?: string; id: string; label: string; onChange: (value: HoaPayer) => void; value: HoaPayer }) {
  return <SelectField error={error} id={id} label={label} onChange={(next) => onChange(next as HoaPayer)} options={[["NOT_APPLICABLE", "Not applicable"], ["BUYER", "Buyer"], ["SELLER", "Seller"], ["EACH_OWN", "Each pays own"]]} value={value} />;
}

function FieldError({ error, id }: { error?: string; id: string }) {
  return error ? <p className="field-hint invalid loi-field-error" id={`${id}-error`}>{error}</p> : null;
}

function TextField({ error, id, label, maxLength, onChange, required = false, type = "text", value }: { error?: string; id: string; label: string; maxLength: number; onChange: (value: string) => void; required?: boolean; type?: "email" | "tel" | "text"; value: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? true : undefined} id={id} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} required={required} type={type} value={value} />
      <FieldError error={error} id={id} />
    </div>
  );
}

function TextAreaField({ error, id, label, maxLength, onChange, rows, value }: { error?: string; id: string; label: string; maxLength: number; onChange: (value: string) => void; rows: number; value: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? true : undefined} id={id} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} rows={rows} value={value} />
      <FieldError error={error} id={id} />
    </div>
  );
}

function SelectField({ error, id, label, onChange, options, value }: { error?: string; id: string; label: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]>; value: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? true : undefined} id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
      <FieldError error={error} id={id} />
    </div>
  );
}

function CheckboxField({ checked, error, id, label, onChange }: { checked: boolean; error?: string; id: string; label: string; onChange: (checked: boolean) => void }) {
  return (
    <div>
      <label className="checkbox-row" htmlFor={id}>
        <input aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? true : undefined} checked={checked} id={id} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <span>{label}</span>
      </label>
      <FieldError error={error} id={id} />
    </div>
  );
}

function MoneyField({ cents, error, id, label, minCents = 0, onChange }: { cents: number; error?: string; id: string; label: string; minCents?: number; onChange: (value: number) => void }) {
  const [display, setDisplay] = useState(formatMoneyInput(cents));
  const [localError, setLocalError] = useState("");
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDisplay(formatMoneyInput(cents));
  }, [cents]);

  const visibleError = localError || error;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        aria-describedby={visibleError ? `${id}-error` : undefined}
        aria-invalid={visibleError ? true : undefined}
        id={id}
        inputMode="decimal"
        onBlur={() => {
          focused.current = false;
          const parsed = parseMoneyInput(display, minCents);
          if (parsed === null) {
            setDisplay(formatMoneyInput(cents));
            setLocalError("");
            return;
          }
          onChange(parsed);
          setDisplay(formatMoneyInput(parsed));
          setLocalError("");
        }}
        onChange={(event) => {
          const raw = event.target.value;
          setDisplay(raw);
          const parsed = parseMoneyInput(raw, minCents);
          if (parsed === null) {
            setLocalError("Enter a valid dollar amount with no more than two decimal places.");
            return;
          }
          setLocalError("");
          onChange(parsed);
        }}
        onFocus={() => { focused.current = true; }}
        type="text"
        value={display}
      />
      <FieldError error={visibleError} id={id} />
    </div>
  );
}

function NumberField({ error, id, label, max = 365, min, onChange, value }: { error?: string; id: string; label: string; max?: number; min: number; onChange: (value: number) => void; value: number }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? true : undefined} id={id} max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} type="number" value={value} />
      <FieldError error={error} id={id} />
    </div>
  );
}

function NullableNumberField({ error, id, label, max, min, onChange, value }: { error?: string; id: string; label: string; max: number; min: number; onChange: (value: number | null) => void; value: number | null }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? true : undefined} id={id} max={max} min={min} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} placeholder="Not included" type="number" value={value ?? ""} />
      <FieldError error={error} id={id} />
    </div>
  );
}

function PercentageField({ basisPoints, error, id, label, maxBasisPoints, onChange }: { basisPoints: number; error?: string; id: string; label: string; maxBasisPoints: number; onChange: (basisPoints: number) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label} (%)</label>
      <input aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? true : undefined} id={id} max={maxBasisPoints / 100} min={0} onChange={(event) => onChange(Math.round(Number(event.target.value) * 100))} step="0.01" type="number" value={basisPoints / 100} />
      <FieldError error={error} id={id} />
    </div>
  );
}

function formatMoneyInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function parseMoneyInput(value: string, minCents: number) {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents >= minCents && cents <= LOI_MAX_PRICE_CENTS ? cents : null;
}
