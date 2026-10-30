"use client";

import { calculateLoiLaCityTransferTaxes, calculateLoiEscrowFees, calculateLoiScheduledClosingCosts, loiSummaryFromVersion, LOI_MAX_ESCROW_DAYS, LOI_RESPONSE_WINDOW_HOURS, LOI_STANDARD_DEPOSIT_BPS, type LoiComputedSummary, type LoiLivePreview, type LoiTermsV1 } from "@liber/validators";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { COMMON_LOI_PROPERTY_ITEMS, LOI_ITEMIZED_COST_FIELDS, loiItemizedCostPayer, normalizeLoiItemizedCostPayers, formatLoiYears, parseLoiPropertyItems, parseLoiYears, updateLoiEscrowProvider, updateLoiCustomaryAllocation, loiTitleFeePayer, updateLoiTitleFeePayer, LOI_CLOSING_COST_EXCLUSIONS } from "./loi-editor-values";
import { CommissionAmountField } from "./commission-amount-field";
import { formatLoiMoneyInput, parseLoiMoneyInput } from "./loi-money-input";

export type LoiTermsUpdater = (fieldPath: string, next: (terms: LoiTermsV1) => LoiTermsV1) => void;

const usd = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });
const wholeUsd = new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" });

export function LoiEditor({
  disabled = false,
  fieldErrors: submittedFieldErrors,
  counterBaseTerms,
  mode = "INITIAL",
  preview,
  terms,
  update,
  viewerRole = "BUYER",
}: {
  disabled?: boolean;
  fieldErrors: Record<string, string>;
  counterBaseTerms?: LoiTermsV1;
  mode?: "COUNTER" | "INITIAL";
  preview: LoiLivePreview | null;
  terms: LoiTermsV1;
  update: LoiTermsUpdater;
  viewerRole?: "BUYER" | "SELLER";
}) {
  // Financial conflicts appear at their field as soon as they are typed; save-time errors take precedence.
  const fieldErrors: Record<string, string> = { ...Object.fromEntries((preview?.issues ?? []).map((issue) => [issue.path, issue.message])), ...submittedFieldErrors };
  const summary = preview?.summary ?? null;
  const counter = mode === "COUNTER";
  const basePossession = counterBaseTerms?.possession ?? terms.possession;
  const financed = terms.funding.type === "FINANCED" ? terms.funding : null;
  const sellerFinanced = terms.funding.type === "SELLER_FINANCING" ? terms.funding : null;
  const sellerCreditIncluded = terms.costsAndCredits.sellerCreditIncluded ?? (terms.costsAndCredits.sellerCreditCents > 0 || Boolean(terms.costsAndCredits.sellerCreditNote));
  const updateCostAllocation: LoiTermsUpdater = (path, next) => update(path, (value) => normalizeLoiItemizedCostPayers(value, next(value)));

  useEffect(() => {
    if (viewerRole !== "BUYER") return;
    const sellerDisclosure = counterBaseTerms?.disclosures;
    const deathOnProperty = sellerDisclosure?.deathOnProperty ?? "UNKNOWN";
    const deathOnPropertyProvidedBy = sellerDisclosure?.deathOnPropertyProvidedBy;
    if (terms.disclosures.deathOnProperty === deathOnProperty && terms.disclosures.deathOnPropertyProvidedBy === deathOnPropertyProvidedBy) return;
    update("disclosures.deathOnProperty", (value) => ({ ...value, disclosures: { ...value.disclosures, deathOnProperty, deathOnPropertyProvidedBy } }));
  }, [counterBaseTerms?.disclosures, terms.disclosures.deathOnProperty, terms.disclosures.deathOnPropertyProvidedBy, update, viewerRole]);

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
      <fieldset className="loi-lock stack" disabled={disabled}>
      <legend className="visually-hidden">LOI draft terms</legend>
      <p className="small loi-editor-intro">Complete your terms, then review before sending. The {LOI_RESPONSE_WINDOW_HOURS}-hour response window starts when you submit.</p>
      <section className="card stack" aria-labelledby="loi-section-parties">
        <SectionTitle id="loi-section-parties" number="1">Parties</SectionTitle>
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
        <SectionTitle id="loi-section-funding" number="2">Purchase price and funding</SectionTitle>
        <MoneyField
          cents={terms.purchasePriceCents === 0 ? null : terms.purchasePriceCents}
          hint={terms.purchasePriceCents === 0 ? "You can save this draft without an offer price. Enter your proposed offer price before reviewing and submitting this LOI." : undefined}
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
            ["OTHER_FINANCED", "Other financed loan"],
            ["SELLER_FINANCING", "Seller financing"],
          ]}
          value={financed?.loanType === "OTHER" ? "OTHER_FINANCED" : terms.funding.type}
        />

        {financed ? (
          <div className="stack">
            <div className="grid two">
              <MoneyField
                cents={financed.downPaymentCents}
                error={fieldErrors["funding.downPaymentCents"]}
                hint={summary && financed.downPaymentCents <= terms.purchasePriceCents ? `${formatDownPaymentPercent(financed.downPaymentCents, terms.purchasePriceCents)} down · Loan amount ${usd.format(summary.loanAmountCents / 100)}` : undefined}
                id="loi-down-payment"
                label="Down payment"
                onChange={(downPaymentCents) => update("funding.downPaymentCents", (value) => value.funding.type === "FINANCED" ? { ...value, funding: { ...value.funding, downPaymentCents } } : value)}
              />
              <SelectField
                error={fieldErrors["funding.loanType"]}
                id="loi-loan-type"
                label="Loan type"
                onChange={(loanType) => update("funding.loanType", (value) => loanType === "SELLER_FINANCING" ? { ...value, funding: fundingFor("SELLER_FINANCING", value.purchasePriceCents) } : value.funding.type === "FINANCED" ? { ...value, funding: { ...value.funding, loanType: loanType as "CONVENTIONAL" | "FHA" | "REHAB" | "OTHER" } } : value)}
                options={[["CONVENTIONAL", "Conventional"], ["FHA", "FHA"], ["REHAB", "Rehab"], ["SELLER_FINANCING", "Seller financing"], ["OTHER", "Other"]]}
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
                onChange={(principalCents) => update("funding.principalCents", (value) => value.funding.type === "SELLER_FINANCING" ? {
                  ...value,
                  funding: { ...value.funding, cashDownPaymentCents: Math.max(value.purchasePriceCents - principalCents, 0), principalCents },
                } : value)}
              />
              <PercentageField
                basisPoints={sellerFinanced.annualInterestBps}
                error={fieldErrors["funding.annualInterestBps"]}
                id="loi-sf-rate"
                label="Annual interest rate"
                maxBasisPoints={5_000}
                onChange={(annualInterestBps) => update("funding.annualInterestBps", (value) => value.funding.type === "SELLER_FINANCING" ? { ...value, funding: { ...value.funding, annualInterestBps } } : value)}
              />
              <YearsField
                error={fieldErrors["funding.termMonths"]}
                id="loi-sf-term"
                label="Term (years)"
                onChange={(termMonths) => update("funding.termMonths", (value) => value.funding.type === "SELLER_FINANCING" && termMonths !== null ? { ...value, funding: { ...value.funding, termMonths } } : value)}
                value={sellerFinanced.termMonths}
              />
              {!sellerFinanced.interestOnly ? <YearsField
                error={fieldErrors["funding.amortizationMonths"]}
                id="loi-sf-amortization"
                label="Amortization (years)"
                nullable
                required={!counter}
                onChange={(amortizationMonths) => update("funding.amortizationMonths", (value) => value.funding.type === "SELLER_FINANCING" ? { ...value, funding: { ...value.funding, amortizationMonths } } : value)}
                value={sellerFinanced.amortizationMonths}
              /> : null}
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
            <SelectField
              error={fieldErrors["funding.interestOnly"]}
              id="loi-sf-interest-only"
              label="Amortization treatment"
              options={[["AMORTIZING", "Fully amortized"], ["INTEREST_ONLY", "Interest only"]]}
              value={sellerFinanced.interestOnly ? "INTEREST_ONLY" : "AMORTIZING"}
              onChange={(treatment) => update("funding.interestOnly", (value) => value.funding.type === "SELLER_FINANCING" ? {
                ...value,
                funding: { ...value.funding, amortizationMonths: treatment === "INTEREST_ONLY" ? null : value.funding.amortizationMonths ?? value.funding.termMonths, interestOnly: treatment === "INTEREST_ONLY" },
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
        {financed ? <p className="small">Financed terms need a current pre-approval badge or an uploaded pre-approval letter, plus lender information, before submission. {viewerRole === "BUYER" ? <Link href="/buyer/profile#buyer-verification-card" rel="noopener noreferrer" target="_blank">Upload or review your pre-approval (opens a new tab)</Link> : "The buyer can upload their letter from their profile."}</p> : null}
      </section>

      <section className="card stack" aria-labelledby="loi-section-deposit">
        <SectionTitle id="loi-section-deposit" number="3">Earnest-money deposit</SectionTitle>
        <p className="small">Set at 3% of the offer price and calculated automatically.</p>
        <p aria-atomic="true" aria-live="polite" id="loi-deposit-percent">
          <strong>{summary ? usd.format(summary.earnestMoneyCents / 100) : "3% of offer price"}</strong>
          <span className="small"> {terms.purchasePriceCents > 0 ? `${LOI_STANDARD_DEPOSIT_BPS / 100}% of ${wholeUsd.format(terms.purchasePriceCents / 100)}` : "Enter an offer price to calculate the deposit."}</span>
        </p>
      </section>

      <section className="card stack" aria-labelledby="loi-section-timing">
        <SectionTitle id="loi-section-timing" number="4">Timing and contingencies</SectionTitle>
        <div className="grid two">
          <NumberField error={fieldErrors["timing.closingDays"]} id="loi-closing" label="Escrow / closing days" max={LOI_MAX_ESCROW_DAYS} min={1} onChange={(closingDays) => update("timing.closingDays", (value) => ({ ...value, timing: { ...value.timing, closingDays: Math.min(Math.max(closingDays, 1), LOI_MAX_ESCROW_DAYS) } }))} value={terms.timing.closingDays} />
          <NumberField error={fieldErrors["timing.inspectionContingencyDays"]} id="loi-inspection" label="Physical inspection days" min={0} onChange={(inspectionContingencyDays) => update("timing.inspectionContingencyDays", (value) => ({ ...value, timing: { ...value.timing, inspectionContingencyDays } }))} value={terms.timing.inspectionContingencyDays} />
          <NumberField error={fieldErrors["timing.sellerDisclosureReviewDays"]} id="loi-disclosure" label="Disclosure review days" min={0} onChange={(sellerDisclosureReviewDays) => update("timing.sellerDisclosureReviewDays", (value) => ({ ...value, timing: { ...value.timing, sellerDisclosureReviewDays } }))} value={terms.timing.sellerDisclosureReviewDays} />
          <NumberField error={fieldErrors["timing.titleReviewDays"]} id="loi-title-review" label="Title review days" min={0} onChange={(titleReviewDays) => update("timing.titleReviewDays", (value) => ({ ...value, timing: { ...value.timing, titleReviewDays } }))} value={terms.timing.titleReviewDays} />
          <SelectField id="loi-appraisal-included" label="Appraisal contingency?" onChange={(answer) => update("timing.appraisalContingencyDays", (value) => ({ ...value, timing: { ...value.timing, appraisalContingencyDays: answer === "YES" ? value.timing.appraisalContingencyDays ?? 17 : null } }))} options={[["YES", "Yes"], ["NO", "No"]]} value={terms.timing.appraisalContingencyDays === null ? "NO" : "YES"} />
          {terms.timing.appraisalContingencyDays !== null ? <NumberField error={fieldErrors["timing.appraisalContingencyDays"]} id="loi-appraisal" label="Appraisal contingency days" max={365} min={0} onChange={(appraisalContingencyDays) => update("timing.appraisalContingencyDays", (value) => ({ ...value, timing: { ...value.timing, appraisalContingencyDays } }))} value={terms.timing.appraisalContingencyDays} /> : null}
          <NullableNumberField error={fieldErrors["timing.loanContingencyDays"]} id="loi-loan-contingency" label="Loan contingency days" max={365} min={0} onChange={(loanContingencyDays) => update("timing.loanContingencyDays", (value) => ({ ...value, timing: { ...value.timing, loanContingencyDays } }))} value={terms.timing.loanContingencyDays} />
        </div>
      </section>

      <section className="card stack" aria-labelledby="loi-section-possession">
        <SectionTitle id="loi-section-possession" number="5">Possession</SectionTitle>
        <SelectField
          error={fieldErrors["possession.type"]}
          id="loi-possession"
          label="Possession"
          onChange={(type) => update("possession.type", (value) => ({ ...value, possession: counter && (type === "TENANT_REMAINS" || type === "OTHER") ? basePossession : possessionFor(type) }))}
          options={([
            ["AT_CLOSING", "At closing"], ["DAYS_AFTER_CLOSING", "Days after closing"], ["SELLER_RENT_BACK", "Seller rent-back"], ["TENANT_REMAINS", "Tenant remains"], ["OTHER", "Other"],
          ] as Array<[string, string]>).filter(([type]) => !counter || type === basePossession.type || (type !== "TENANT_REMAINS" && type !== "OTHER"))}
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
        {terms.possession.type === "SELLER_RENT_BACK" ? <p className="small">Your lender may limit the rent-back period. Confirm the permitted duration with your lender before submitting these terms.</p> : null}
        {terms.possession.type === "SELLER_RENT_BACK" ? <p className="small">Through escrow treats the entered amount as the total rent-back payment at closing, reducing seller cash and crediting buyer cash. Monthly shows the monthly payment separately from closing cash; it is not multiplied by the number of days.</p> : null}
        <fieldset className="loi-lock stack" disabled={counter}>
        {terms.possession.type === "TENANT_REMAINS" ? (
          <div className="stack">
            <CheckboxField checked={terms.possession.estoppelRequired} error={fieldErrors["possession.estoppelRequired"]} id="loi-estoppel" label="Require estoppel certificate" onChange={(estoppelRequired) => update("possession.estoppelRequired", (value) => value.possession.type === "TENANT_REMAINS" ? { ...value, possession: { ...value.possession, estoppelRequired } } : value)} />
            <TextField error={fieldErrors["possession.note"]} id="loi-tenant-note" label="Tenant possession details" maxLength={1000} onChange={(note) => update("possession.note", (value) => value.possession.type === "TENANT_REMAINS" ? { ...value, possession: { ...value.possession, note } } : value)} required value={terms.possession.note} />
          </div>
        ) : null}
        {terms.possession.type === "OTHER" ? <TextField error={fieldErrors["possession.note"]} id="loi-possession-note" label="Other possession terms" maxLength={1000} onChange={(note) => update("possession.note", (value) => ({ ...value, possession: { note, type: "OTHER" } }))} required value={terms.possession.note} /> : null}

        </fieldset>
      </section>

      <section className="card stack" aria-labelledby="loi-section-agent">
        <SectionTitle id="loi-section-agent" number="6">Buyer agent</SectionTitle>
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
            <CommissionAmountField
              error={fieldErrors["representation.commissionAmount"]}
              id="loi-agent-commission"
              label="Commission amount"
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
        <SectionTitle id="loi-section-costs" number="7">Escrow, title, warranty, and costs</SectionTitle>
        <p className="small">Recommended allocation: each party pays their own escrow fees, and the seller pays for title insurance. Choose different payers using the separate selectors below.</p>
        <div className="grid two">
          <ProviderField errors={fieldErrors} kind="escrow" label="Proposed escrow provider" onChange={(escrow) => update("providers.escrow", (value) => updateLoiEscrowProvider(value, escrow as LoiTermsV1["providers"]["escrow"]))} value={terms.providers.escrow} />
          <div className="stack tight">
            <fieldset className="loi-lock" disabled={counter}>
              <ProviderField errors={fieldErrors} kind="title" label="Proposed title provider" onChange={(title) => update("providers.title", (value) => ({ ...value, providers: { ...value.providers, title: { ...title as LoiTermsV1["providers"]["title"], feePayer: value.providers.title.feePayer } } }))} value={terms.providers.title} />
            </fieldset>
            <SelectField error={fieldErrors["providers.title.feePayer"]} id="loi-title-fee-payer" label="Who pays title insurance" onChange={(payer) => update("providers.title.feePayer", (value) => updateLoiTitleFeePayer(value, payer === "BUYER" || payer === "SELLER" ? payer : "EACH_OWN"))} options={[["SELLER", "Seller"], ["BUYER", "Buyer"], ["EACH_OWN", "Each party pays their own"]]} value={loiTitleFeePayer(terms)} />
          </div>
        </div>
        <SelectField error={fieldErrors["costsAndCredits.sellerCreditIncluded"]} id="loi-credit-included" label="Seller credit to buyer?" onChange={(answer) => update("costsAndCredits", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, sellerCreditIncluded: answer === "YES", sellerCreditCents: answer === "YES" ? value.costsAndCredits.sellerCreditCents : 0, sellerCreditNote: answer === "YES" ? value.costsAndCredits.sellerCreditNote : "" } }))} options={[["NO", "No"], ["YES", "Yes"]]} value={sellerCreditIncluded ? "YES" : "NO"} />
        {sellerCreditIncluded ? <>
          <MoneyField cents={terms.costsAndCredits.sellerCreditCents} error={fieldErrors["costsAndCredits.sellerCreditCents"]} id="loi-credit" label="Seller credit amount" minCents={1} onChange={(sellerCreditCents) => update("costsAndCredits.sellerCreditCents", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, sellerCreditCents } }))} />
          <TextField error={fieldErrors["costsAndCredits.sellerCreditNote"]} id="loi-credit-note" label="Reason for seller credit (optional)" maxLength={500} onChange={(sellerCreditNote) => update("costsAndCredits.sellerCreditNote", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, sellerCreditNote } }))} value={terms.costsAndCredits.sellerCreditNote} />
        </> : <FieldError error={fieldErrors["costsAndCredits.sellerCreditCents"]} id="loi-credit-included" />}
        <CheckboxField
          checked={terms.costsAndCredits.customaryClosingCosts}
          error={fieldErrors["costsAndCredits.customaryClosingCosts"]}
          id="loi-customary-costs"
          label="Recommend customary closing-cost allocation"
          onChange={(customaryClosingCosts) => updateCostAllocation("costsAndCredits.customaryClosingCosts", (value) => updateLoiCustomaryAllocation(value, customaryClosingCosts))}
        />
        <p className="small">Recommended: seller pays city and county transfer taxes and government-required retrofit items. Uncheck to choose a different payer.</p>
        <fieldset className="loi-lock stack" disabled={terms.costsAndCredits.customaryClosingCosts}>
          <ClosingCostPayerField error={fieldErrors["costsAndCredits.closingCostPayers.transferTaxes"]} id="loi-transfer-tax-payer" label="Who pays city and county transfer taxes?" onChange={(transferTaxes) => updateCostAllocation("costsAndCredits.closingCostPayers.transferTaxes", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, closingCostPayers: { governmentRetrofitItems: value.costsAndCredits.closingCostPayers?.governmentRetrofitItems ?? null, transferTaxes } } }))} value={terms.costsAndCredits.customaryClosingCosts ? "SELLER" : terms.costsAndCredits.closingCostPayers?.transferTaxes ?? null} />
          <ClosingCostPayerField error={fieldErrors["costsAndCredits.closingCostPayers.governmentRetrofitItems"]} id="loi-retrofit-payer" label="Who pays government-required retrofit items, smoke detectors, and CO detectors?" onChange={(governmentRetrofitItems) => updateCostAllocation("costsAndCredits.closingCostPayers.governmentRetrofitItems", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, closingCostPayers: { transferTaxes: value.costsAndCredits.closingCostPayers?.transferTaxes ?? null, governmentRetrofitItems } } }))} value={terms.costsAndCredits.customaryClosingCosts ? "SELLER" : terms.costsAndCredits.closingCostPayers?.governmentRetrofitItems ?? null} />
        </fieldset>
        {!terms.costsAndCredits.customaryClosingCosts ? <div className="stack">
          <p className="small">Choose each payer above. Review any previously saved allocation note alongside these selections.</p>
          <TextField error={fieldErrors["costsAndCredits.alternateClosingCostAllocation"]} id="loi-alternate-costs" label="Additional allocation details (optional)" maxLength={1000} onChange={(alternateClosingCostAllocation) => update("costsAndCredits.alternateClosingCostAllocation", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, alternateClosingCostAllocation } }))} value={terms.costsAndCredits.alternateClosingCostAllocation} />
        </div> : null}
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
              <MoneyField cents={terms.costsAndCredits.homeWarranty.maximumCents} error={fieldErrors["costsAndCredits.homeWarranty.maximumCents"]} id="loi-warranty-max" label="Warranty budget maximum" minCents={1} onChange={(maximumCents) => update("costsAndCredits.homeWarranty.maximumCents", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, homeWarranty: { ...value.costsAndCredits.homeWarranty, maximumCents } } }))} />
              <SelectField
                error={fieldErrors["costsAndCredits.homeWarranty.payer"]}
                id="loi-warranty-payer"
                label="Who pays home warranty?"
                onChange={(payer) => update("costsAndCredits.homeWarranty.payer", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, homeWarranty: { ...value.costsAndCredits.homeWarranty, payer: payer as "BUYER" | "SELLER" | "EACH_OWN" | "OTHER", payerNote: payer === "OTHER" ? value.costsAndCredits.homeWarranty.payerNote : "", buyerShareCents: payer === "BUYER" || payer === "SELLER" ? undefined : value.costsAndCredits.homeWarranty.buyerShareCents, sellerShareCents: payer === "BUYER" || payer === "SELLER" ? undefined : value.costsAndCredits.homeWarranty.sellerShareCents } } }))}
                options={[...(terms.costsAndCredits.homeWarranty.payer === "EACH_OWN" ? [["", "Choose who pays"] as [string, string]] : []), ["BUYER", "Buyer"], ["SELLER", "Seller"], ["OTHER", "Other"]]}
                value={terms.costsAndCredits.homeWarranty.payer === "EACH_OWN" ? "" : terms.costsAndCredits.homeWarranty.payer}
              />
            </div>
            <p className="small">The calculator uses this budget maximum as the warranty estimate for the selected payer. Actual charges may be lower. For Other, enter each party&apos;s proposed share; no equal split is assumed.</p>
            {terms.costsAndCredits.homeWarranty.payer === "EACH_OWN" ? <p className="small">Choose Buyer, Seller, or Other to update the saved warranty allocation.</p> : null}
            {terms.costsAndCredits.homeWarranty.payer === "OTHER" ? <div className="grid two">
              <EstimateMoneyField cents={terms.costsAndCredits.homeWarranty.buyerShareCents ?? null} error={fieldErrors["costsAndCredits.homeWarranty.buyerShareCents"]} id="loi-warranty-buyer-share" label="Buyer warranty share" onChange={(buyerShareCents) => update("costsAndCredits.homeWarranty.buyerShareCents", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, homeWarranty: { ...value.costsAndCredits.homeWarranty, buyerShareCents } } }))} />
              <EstimateMoneyField cents={terms.costsAndCredits.homeWarranty.sellerShareCents ?? null} error={fieldErrors["costsAndCredits.homeWarranty.sellerShareCents"]} id="loi-warranty-seller-share" label="Seller warranty share" onChange={(sellerShareCents) => update("costsAndCredits.homeWarranty.sellerShareCents", (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, homeWarranty: { ...value.costsAndCredits.homeWarranty, sellerShareCents } } }))} />
            </div> : null}
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
        <SectionTitle id="loi-section-personal-property" number="8">HOA and personal property</SectionTitle>
        <div className="grid three">
          <SelectField
            error={fieldErrors["hoa.documentFeePayer"]}
            id="hoa-document-fee-payer"
            label="HOA document fee"
            onChange={(documentFeePayer) => { if (documentFeePayer) updateCostAllocation("hoa.documentFeePayer", (value) => ({ ...value, hoa: { ...value.hoa, documentFeePayer: documentFeePayer as LoiTermsV1["hoa"]["documentFeePayer"] } })); }}
            options={hoaDocumentFeeOptions(terms.hoa.documentFeePayer)}
            value={terms.hoa.documentFeePayer === "EACH_OWN" ? "" : terms.hoa.documentFeePayer}
          />
          <PayerField error={fieldErrors["hoa.certificateFeePayer"]} id="hoa-certificate-fee-payer" label="HOA certificate fee" onChange={(certificateFeePayer) => updateCostAllocation("hoa.certificateFeePayer", (value) => ({ ...value, hoa: { ...value.hoa, certificateFeePayer } }))} value={terms.hoa.certificateFeePayer} />
          <PayerField error={fieldErrors["hoa.transferFeePayer"]} id="hoa-transfer-fee-payer" label="HOA transfer fee" onChange={(transferFeePayer) => updateCostAllocation("hoa.transferFeePayer", (value) => ({ ...value, hoa: { ...value.hoa, transferFeePayer } }))} value={terms.hoa.transferFeePayer} />
        </div>
        <CheckboxField checked={terms.personalProperty.included} error={fieldErrors["personalProperty.included"]} id="loi-personal-property" label="Sale to include personal property?" onChange={(included) => update("personalProperty.included", (value) => ({ ...value, personalProperty: { ...value.personalProperty, included, includedItems: included ? value.personalProperty.includedItems : [], payer: included ? value.personalProperty.payer : "SELLER" } }))} />
        <p className="small">Attached furniture belongs with the property. TVs are excluded by default unless listed.</p>
        {terms.personalProperty.included ? (
          <div className="grid two">
            <PropertyItemsField error={fieldErrors["personalProperty.includedItems"]} id="loi-items" onChange={(includedItems) => update("personalProperty.includedItems", (value) => ({ ...value, personalProperty: { ...value.personalProperty, includedItems } }))} value={terms.personalProperty.includedItems} />
            <SelectField error={fieldErrors["personalProperty.payer"]} id="loi-personal-property-payer" label="Who pays for included items" onChange={(payer) => updateCostAllocation("personalProperty.payer", (value) => ({ ...value, personalProperty: { ...value.personalProperty, payer: payer === "BUYER" ? "BUYER" : "SELLER" } }))} options={[["SELLER", "Seller"], ["BUYER", "Buyer"]]} value={terms.personalProperty.payer} />
          </div>
        ) : null}
        <TextField error={fieldErrors["personalProperty.excludedItems"]} id="loi-excluded-items" label="Excluded personal-property items" maxLength={2000} onChange={(excludedItems) => update("personalProperty.excludedItems", (value) => ({ ...value, personalProperty: { ...value.personalProperty, excludedItems } }))} value={terms.personalProperty.excludedItems} />
      </section>

      <ClosingCostEstimates fields={fieldErrors} summary={summary} terms={terms} update={update} viewerRole={viewerRole} />

      <section className="card stack" aria-labelledby="loi-section-disclosures">
        <SectionTitle id="loi-section-disclosures" number="9">Disclosures</SectionTitle>
        {viewerRole === "SELLER" ? <SelectField
          error={fieldErrors["disclosures.deathOnProperty"]}
          id="loi-disclosure-death"
          label="Seller disclosure: death on the property"
          onChange={(deathOnProperty) => update("disclosures.deathOnProperty", (value) => ({
            ...value,
            disclosures: {
              ...value.disclosures,
              deathOnProperty: deathOnProperty === "YES" || deathOnProperty === "NO" ? deathOnProperty : "UNKNOWN",
              deathOnPropertyProvidedBy: "SELLER",
            },
          }))}
          options={[["UNKNOWN", "Unknown / not specified"], ["NO", "No"], ["YES", "Yes"]]}
          value={terms.disclosures.deathOnProperty}
        /> : <p className="small"><strong>Death on the property:</strong> {terms.disclosures.deathOnProperty === "UNKNOWN" ? "Awaiting seller disclosure." : `${terms.disclosures.deathOnProperty === "YES" ? "Yes" : "No"} — ${terms.disclosures.deathOnPropertyProvidedBy === "SELLER" ? "provided by seller" : "historical answer; source not recorded"}.`} Only the seller can add or change this answer.</p>}
        <TextAreaField error={fieldErrors["disclosures.condition"]} id="loi-disclosure-condition" label="Property condition" maxLength={2000} onChange={(condition) => update("disclosures.condition", (value) => ({ ...value, disclosures: { ...value.disclosures, condition } }))} rows={4} value={terms.disclosures.condition} />
        <TextAreaField error={fieldErrors["disclosures.conditionsOfSale"]} id="loi-disclosure-sale" label="Conditions of sale" maxLength={2000} onChange={(conditionsOfSale) => update("disclosures.conditionsOfSale", (value) => ({ ...value, disclosures: { ...value.disclosures, conditionsOfSale } }))} rows={4} value={terms.disclosures.conditionsOfSale} />
      </section>

      <section className="card stack" aria-labelledby="loi-section-additional">
        <SectionTitle id="loi-section-additional" number="10">Additional terms</SectionTitle>
        <fieldset className="loi-lock stack" disabled={counter}>
        <TextAreaField error={fieldErrors["additionalTerms.proposedTerms"]} id="loi-additional" label="Additional proposed terms" maxLength={4000} onChange={(proposedTerms) => update("additionalTerms.proposedTerms", (value) => ({ ...value, additionalTerms: { ...value.additionalTerms, proposedTerms } }))} rows={6} value={terms.additionalTerms.proposedTerms} />
        <TextAreaField error={fieldErrors["additionalTerms.exclusions"]} id="loi-exclusions" label="Explicit exclusions" maxLength={4000} onChange={(exclusions) => update("additionalTerms.exclusions", (value) => ({ ...value, additionalTerms: { ...value.additionalTerms, exclusions } }))} rows={4} value={terms.additionalTerms.exclusions} />
        </fieldset>
      </section>
      </fieldset>
    </form>
  );
}

// The visible badge is decorative; the heading text keeps its "1. Parties" reading order.
function SectionTitle({ children, id, number, numberLabel = `${number}. ` }: { children: ReactNode; id: string; number: string; numberLabel?: string }) {
  return (
    <h2 className="loi-section-title" id={id}>
      <span aria-hidden="true" className="loi-section-number">{number}</span>
      {numberLabel ? <span className="visually-hidden">{numberLabel}</span> : null}
      {children}
    </h2>
  );
}

function fundingFor(type: string, price: number): LoiTermsV1["funding"] {
  if (type === "OTHER_FINANCED") return { downPaymentCents: 0, lender: emptyContact(), loanType: "OTHER", note: "", type: "FINANCED" };
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
  const feePayer = kind === "escrow" && "feePayer" in value ? value.feePayer ?? "EACH_OWN" : "EACH_OWN";
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
            ? { choice: "CUSTOM", company: value.company, feePayer: next === "BUYER" || next === "SELLER" ? next : "EACH_OWN" }
            : { choice: "LIBER_PREFERRED", feePayer: next === "BUYER" || next === "SELLER" ? next : "EACH_OWN" })}
          options={[["EACH_OWN", "Each party pays their own"], ["SELLER", "Seller"], ["BUYER", "Buyer"]]}
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
  if (current === "EACH_OWN") options.unshift(["", "Choose who pays"]);
  return options;
}

function formatDownPaymentPercent(downPaymentCents: number, purchasePriceCents: number) {
  return `${Number((downPaymentCents / purchasePriceCents * 100).toFixed(1))}%`;
}

type HoaPayer = LoiTermsV1["hoa"]["documentFeePayer"];
type ClosingCostPayer = NonNullable<LoiTermsV1["costsAndCredits"]["closingCostPayers"]>["transferTaxes"];
function ClosingCostPayerField({ error, id, label, onChange, value }: { error?: string; id: string; label: string; onChange: (value: ClosingCostPayer) => void; value: ClosingCostPayer }) {
  return <SelectField error={error} id={id} label={label} onChange={(next) => onChange(next ? next as ClosingCostPayer : null)} options={[["", "Choose who pays"], ["BUYER", "Buyer"], ["SELLER", "Seller"], ["SPLIT_EQUALLY", "Split equally"], ["NOT_APPLICABLE", "Not applicable"]]} value={value ?? ""} />;
}

type ClosingEstimates = NonNullable<LoiTermsV1["costsAndCredits"]["closingCostEstimates"]>;
function emptyClosingEstimates(): ClosingEstimates {
  return { buyerEscrowCents: null, sellerEscrowCents: null, buyerTitleInsuranceCents: null, sellerTitleInsuranceCents: null, buyerOtherClosingCostsCents: null, sellerOtherClosingCostsCents: null, sellerAgentCommissionAmount: "", note: "" };
}

// One short line per cost, showing only the viewer's side. Blank amounts use the
// scheduled estimate shown as the placeholder; other blank fees stay unknown.
function ClosingCostEstimates({ fields, summary, terms, update, viewerRole }: { fields: Record<string, string>; summary: LoiComputedSummary | null; terms: LoiTermsV1; update: LoiTermsUpdater; viewerRole: "BUYER" | "SELLER" }) {
  const estimates = terms.costsAndCredits.closingCostEstimates ?? emptyClosingEstimates();
  const change = <K extends keyof ClosingEstimates>(key: K, next: ClosingEstimates[K]) => update(`costsAndCredits.closingCostEstimates.${key}`, (value) => ({ ...value, costsAndCredits: { ...value.costsAndCredits, closingCostEstimates: { ...(value.costsAndCredits.closingCostEstimates ?? emptyClosingEstimates()), ...(key === "buyerOtherClosingCostsCents" || key === "sellerOtherClosingCostsCents" ? { otherCostsExcludeItemized: false } : {}), [key]: next } } }));
  const buyer = viewerRole === "BUYER";
  const escrowPayer = terms.providers.escrow.feePayer;
  const titlePayer = loiTitleFeePayer(terms);
  const escrow = calculateLoiEscrowFees(terms.purchasePriceCents, escrowPayer);
  const scheduled = calculateLoiScheduledClosingCosts(terms.purchasePriceCents, titlePayer);
  const taxPreview = calculateLoiLaCityTransferTaxes(terms.purchasePriceCents);
  const laCityRates = terms.costsAndCredits.transferTaxSchedule === "LA_CITY_2026_2027";
  const estimate = (cents: number | null | undefined, rate = "") => cents === null || cents === undefined ? "Not estimated" : `Est. ${usd.format(cents / 100)}${rate}`;
  const confirmOtherCosts = (estimates.buyerOtherClosingCostsCents ?? 0) + (estimates.sellerOtherClosingCostsCents ?? 0) > 0 && summary !== null && loiSummaryFromVersion(summary, 3)
    && (summary.buyerHomeWarrantyCents ?? 0) + (summary.sellerHomeWarrantyCents ?? 0) + summary.buyerItemizedCostsCents + summary.sellerItemizedCostsCents + summary.rentBackAtClosingCents + summary.monthlyRentBackCents > 0;
  const showEscrow = escrowPayer === "EACH_OWN" || escrowPayer === viewerRole;
  const showTitle = titlePayer === "EACH_OWN" || titlePayer === viewerRole;
  const escrowLabel = escrowPayer === "EACH_OWN" ? "Your escrow fee" : "Escrow fee (both sides)";
  const titleLabel = titlePayer === "EACH_OWN" ? "Your share of the title policy" : "Title policy";
  return <section className="card stack" aria-labelledby="loi-section-estimates">
    <SectionTitle id="loi-section-estimates" number="$" numberLabel="">Closing-cost estimates</SectionTitle>
    <p className="small">Leave a cost blank to use our estimate, or enter your quote. Enter 0 for no charge.</p>
    <div className="loi-estimate-list">
      {showEscrow ? buyer
        ? <EstimateMoneyField cents={estimates.buyerEscrowCents} error={fields["costsAndCredits.closingCostEstimates.buyerEscrowCents"]} id="loi-estimate-buyer-escrow" label={escrowLabel} onChange={(value) => change("buyerEscrowCents", value)} placeholder={estimate(escrow.buyerCents)} />
        : <EstimateMoneyField cents={estimates.sellerEscrowCents} error={fields["costsAndCredits.closingCostEstimates.sellerEscrowCents"]} id="loi-estimate-seller-escrow" label={escrowLabel} onChange={(value) => change("sellerEscrowCents", value)} placeholder={estimate(escrow.sellerCents)} /> : null}
      {showTitle ? buyer
        ? <EstimateMoneyField cents={estimates.buyerTitleInsuranceCents} error={fields["costsAndCredits.closingCostEstimates.buyerTitleInsuranceCents"]} id="loi-estimate-buyer-title" label={titleLabel} onChange={(value) => change("buyerTitleInsuranceCents", value)} placeholder={estimate(scheduled?.buyerTitleCents, " · 0.25%")} />
        : <EstimateMoneyField cents={estimates.sellerTitleInsuranceCents} error={fields["costsAndCredits.closingCostEstimates.sellerTitleInsuranceCents"]} id="loi-estimate-seller-title" label={titleLabel} onChange={(value) => change("sellerTitleInsuranceCents", value)} placeholder={estimate(scheduled?.sellerTitleCents, " · 0.25%")} /> : null}
      {buyer
        ? <EstimateMoneyField cents={estimates.buyerOtherClosingCostsCents} error={fields["costsAndCredits.closingCostEstimates.buyerOtherClosingCostsCents"]} id="loi-estimate-buyer-other" label="Misc. closing costs" onChange={(value) => change("buyerOtherClosingCostsCents", value)} placeholder={estimate(scheduled?.buyerOtherCents, " · 0.2%")} />
        : <EstimateMoneyField cents={estimates.sellerOtherClosingCostsCents} error={fields["costsAndCredits.closingCostEstimates.sellerOtherClosingCostsCents"]} id="loi-estimate-seller-other" label="Misc. closing costs" onChange={(value) => change("sellerOtherClosingCostsCents", value)} placeholder={estimate(scheduled?.sellerOtherCents, " · 0.2%")} />}
      <SelectField error={fields["costsAndCredits.transferTaxSchedule"]} id="loi-transfer-tax-schedule" label="How should we estimate transfer tax?" value={terms.costsAndCredits.transferTaxSchedule ?? "MANUAL"} options={[["MANUAL", "I'll enter a quote"], ["LA_CITY_2026_2027", "City of Los Angeles rates"]]} onChange={(selected) => update("costsAndCredits.transferTaxSchedule", (current) => ({...current, costsAndCredits:{...current.costsAndCredits,transferTaxSchedule:selected as NonNullable<LoiTermsV1["costsAndCredits"]["transferTaxSchedule"]>}}))} />
      {laCityRates ? <p className="field-hint" aria-live="polite">{taxPreview ? `County ${usd.format(taxPreview.laCountyTransferTaxCents / 100)} · City ${usd.format(taxPreview.laCityTransferTaxCents / 100)}${buyer ? "" : ` · Measure ULA ${usd.format(taxPreview.measureUlaCents / 100)}`}. Only for sales inside City of Los Angeles limits.` : "Enter an offer price to calculate transfer tax."}</p> : null}
      {!laCityRates && !buyer ? <EstimateMoneyField cents={estimates.sellerMeasureUlaCents ?? null} error={fields["costsAndCredits.closingCostEstimates.sellerMeasureUlaCents"]} id="loi-estimate-seller-ula" label="Measure ULA (City of Los Angeles only)" onChange={(value) => change("sellerMeasureUlaCents", value)} /> : null}
      {LOI_ITEMIZED_COST_FIELDS.map((field) => {
        if (field.key === "transferTaxes" && laCityRates) return null;
        const payer = loiItemizedCostPayer(terms, field.key);
        if (!payer || payer === "NOT_APPLICABLE" || ((payer === "BUYER" || payer === "SELLER") && payer !== viewerRole)) return null;
        const estimateFor = estimates.itemizedCosts?.[field.key];
        const setEstimate = (part: "amountCents" | "buyerCents" | "sellerCents", amount: number | null) => update(`costsAndCredits.closingCostEstimates.itemizedCosts.${field.key}.${part}`, (value) => {
          const current = value.costsAndCredits.closingCostEstimates ?? emptyClosingEstimates();
          return { ...value, costsAndCredits: { ...value.costsAndCredits, closingCostEstimates: { ...current, itemizedCosts: { ...current.itemizedCosts, [field.key]: { ...current.itemizedCosts?.[field.key], [part]: amount } } } } };
        });
        const prefix = `costsAndCredits.closingCostEstimates.itemizedCosts.${field.key}`;
        const hint = field.key === "personalProperty" ? "Enter 0 if included in the price." : undefined;
        if (payer === "EACH_OWN") {
          const part = buyer ? "buyerCents" : "sellerCents";
          return <EstimateMoneyField cents={estimateFor?.[part] ?? null} error={fields[`${prefix}.${part}`]} hint={hint} id={`${field.id}-${buyer ? "buyer" : "seller"}`} key={field.key} label={`${field.label} (your share)`} onChange={(amount) => setEstimate(part, amount)} />;
        }
        return <EstimateMoneyField cents={estimateFor?.amountCents ?? null} error={fields[`${prefix}.amountCents`]} hint={hint} id={field.id} key={field.key} label={payer === "SPLIT_EQUALLY" ? `${field.label} (total, split equally)` : field.label} onChange={(amount) => setEstimate("amountCents", amount)} />;
      })}
    </div>
    {confirmOtherCosts ? <CheckboxField checked={estimates.otherCostsExcludeItemized === true} error={fields["costsAndCredits.closingCostEstimates.otherCostsExcludeItemized"]} id="loi-estimate-other-excludes-itemized" label="My misc. amount does not repeat the costs listed above" onChange={(checked) => change("otherCostsExcludeItemized", checked)} /> : null}
    {buyer ? null : <CommissionAmountField error={fields["costsAndCredits.closingCostEstimates.sellerAgentCommissionAmount"]} id="loi-estimate-seller-commission" label="Your listing agent's commission" onChange={(value) => change("sellerAgentCommissionAmount", value)} value={estimates.sellerAgentCommissionAmount} />}
    <TextAreaField error={fields["costsAndCredits.closingCostEstimates.note"]} id="loi-estimate-note" label="Note about these estimates (optional)" maxLength={1000} onChange={(value) => change("note", value)} rows={2} value={estimates.note} />
    <p className="small loi-estimate-exclusions">{LOI_CLOSING_COST_EXCLUSIONS}</p>
  </section>;
}

// Blank stays unknown, distinct from an explicit $0 estimate.
function EstimateMoneyField({ cents, error, hint, id, label, onChange, placeholder = "Not estimated" }: { cents: number | null; error?: string; hint?: string; id: string; label: string; onChange: (value: number | null) => void; placeholder?: string }) {
  return <MoneyInput blank="unknown" cents={cents} error={error} hint={hint} id={id} label={label} minCents={0} onChange={onChange} placeholder={placeholder} />;
}
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

// Required amounts: clearing a positive-only field keeps the last amount until a new one is typed;
// clearing a field that allows $0 means $0, so the calculator follows immediately.
function MoneyField({ cents, error, hint, id, label, minCents = 0, onChange }: { cents: number | null; error?: string; hint?: string; id: string; label: string; minCents?: number; onChange: (value: number) => void }) {
  return <MoneyInput blank={minCents > 0 ? "required" : "zero"} cents={cents} error={error} hint={hint} id={id} label={label} minCents={minCents} onChange={(value) => onChange(value ?? 0)} />;
}

function MoneyInput({ blank, cents, error, hint, id, label, minCents, onChange, placeholder }: {
  blank: "required" | "unknown" | "zero";
  cents: number | null;
  error?: string;
  hint?: ReactNode;
  id: string;
  label: string;
  minCents: number;
  onChange: (value: number | null) => void;
  placeholder?: string;
}) {
  const [display, setDisplay] = useState(() => formatLoiMoneyInput(cents));
  const [localError, setLocalError] = useState("");
  const focused = useRef(false);
  // Keep the typed text while focused; reformat only when the value changes elsewhere or on blur.
  useEffect(() => {
    if (!focused.current) setDisplay(formatLoiMoneyInput(cents));
  }, [cents]);

  const visibleError = localError || error;
  const describedBy = [hint ? `${id}-hint` : "", visibleError ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="loi-money-input">
        <span aria-hidden="true">$</span>
        <input
          aria-describedby={describedBy}
          aria-invalid={visibleError ? true : undefined}
          autoComplete="off"
          id={id}
          inputMode="decimal"
          onBlur={() => {
            focused.current = false;
            setDisplay(formatLoiMoneyInput(cents));
            setLocalError("");
          }}
          onChange={(event) => {
            const raw = event.target.value;
            setDisplay(raw);
            const parsed = parseLoiMoneyInput(raw);
            const nextError = parsed.error
              ?? (parsed.cents === null ? blank === "required" ? "Enter an amount." : null
                : parsed.cents < minCents ? "Enter an amount greater than $0." : null);
            setLocalError(nextError ?? "");
            if (nextError) return;
            onChange(parsed.cents ?? (blank === "zero" ? 0 : null));
          }}
          onFocus={() => { focused.current = true; }}
          placeholder={placeholder}
          type="text"
          value={display}
        />
      </div>
      {hint ? <span className="field-hint" id={`${id}-hint`}>{hint}</span> : null}
      <FieldError error={visibleError} id={id} />
    </div>
  );
}

function PropertyItemsField({ error, id, onChange, value }: { error?: string; id: string; onChange: (items: string[]) => void; value: string[] }) {
  const [display, setDisplay] = useState(value.join(", "));
  const focused = useRef(false);
  const serialized = value.join(", ");
  useEffect(() => {
    if (!focused.current) setDisplay(serialized);
  }, [serialized]);

  return (
    <div className="field stack tight">
      <label htmlFor={id}>Requested items (comma separated)</label>
      <input
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={error ? true : undefined}
        id={id}
        maxLength={6_098}
        onBlur={() => { focused.current = false; setDisplay(serialized); }}
        onChange={(event) => {
          setDisplay(event.target.value);
          onChange(parseLoiPropertyItems(event.target.value));
        }}
        onFocus={() => { focused.current = true; }}
        required
        type="text"
        value={display}
      />
      <FieldError error={error} id={id} />
      <details>
        <summary className="small">Add common items</summary>
        <div className="actions" role="group" aria-label="Common personal-property items">
          {COMMON_LOI_PROPERTY_ITEMS.map((item) => {
            const included = value.some((current) => current.toLowerCase() === item.toLowerCase());
            return <button aria-pressed={included} className="button secondary sm" disabled={included || value.length >= 50} key={item} onClick={() => {
              const next = [...value, item];
              setDisplay(next.join(", "));
              onChange(next);
            }} type="button">{included ? "✓ " : "+ "}{item}</button>;
          })}
        </div>
      </details>
    </div>
  );
}

function YearsField({ error, id, label, nullable = false, required = false, onChange, value }: { error?: string; id: string; label: string; nullable?: boolean; required?: boolean; onChange: (months: number | null) => void; value: number | null }) {
  const [display, setDisplay] = useState(formatLoiYears(value));
  const [localError, setLocalError] = useState("");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDisplay(formatLoiYears(value));
  }, [value]);
  const visibleError = localError || error;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        aria-describedby={visibleError ? `${id}-error` : `${id}-hint`}
        aria-invalid={visibleError ? true : undefined}
        id={id}
        inputMode="decimal"
        onBlur={() => {
          focused.current = false;
          setDisplay(formatLoiYears(value));
          setLocalError("");
        }}
        onChange={(event) => {
          const raw = event.target.value;
          setDisplay(raw);
          if (nullable && raw.trim() === "") {
            onChange(null);
            setLocalError("");
            return;
          }
          const months = parseLoiYears(raw);
          if (months === null) {
            setLocalError("Enter a duration from one month to 50 years.");
            return;
          }
          setLocalError("");
          onChange(months);
        }}
        onFocus={() => { focused.current = true; }}
        placeholder={required ? "Enter years" : nullable ? "Not included" : undefined}
        required={required}
        type="text"
        value={display}
      />
      <span className="small" id={`${id}-hint`}>Entered in years; rounded to the nearest month{value === null ? "." : ` (${value} months).`}</span>
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
