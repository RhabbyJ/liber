"use client";

import { useId, useState } from "react";
import type { LoiComputedSummary, LoiTermsV1 } from "@liber/validators";
import { loiFeeBreakdown } from "./loi-fee-breakdown";
import { formatLoiMoney } from "./loi-presentation";
import { parseSellerLoanPayoff, sellerNetProceeds } from "./loi-seller-proceeds-values";

export function LoiSellerProceeds({ terms, summary, payoff: controlledPayoff, onPayoffChange, showDetails = true }: { terms: LoiTermsV1; summary: LoiComputedSummary | null; payoff?: string; onPayoffChange?: (value: string) => void; showDetails?: boolean }) {
  const [localPayoff, setLocalPayoff] = useState("");
  const payoff = controlledPayoff ?? localPayoff;
  const setPayoff = onPayoffChange ?? setLocalPayoff;
  const inputId = useId();
  const parsed = parseSellerLoanPayoff(payoff);
  const net = sellerNetProceeds(summary, parsed.cents);
  return <section className="card stack tight loi-proceeds-card" aria-label="Seller net proceeds calculator">
    <h3>Seller net proceeds</h3>
    <div className="field">
      <label htmlFor={inputId}>Seller loan payoff</label>
      <input id={inputId} inputMode="decimal" type="text" maxLength={32} placeholder="What you owe" value={payoff} onChange={(event) => setPayoff(event.target.value)} aria-invalid={parsed.error ? true : undefined} aria-describedby={`${inputId}-hint${parsed.error ? ` ${inputId}-error` : ""}`} />
      <p id={`${inputId}-hint`} className="field-hint">{showDetails ? "Enter the total to pay off your existing loans, including payoff fees. Enter 0 if there is no loan. Do not repeat these charges in Other closing costs. " : "Enter 0 if there is no loan. "}This private estimate is not sent to the buyer and resets on refresh.</p>
      {parsed.error ? <p id={`${inputId}-error`} className="field-hint invalid">{parsed.error}</p> : null}
    </div>
    {showDetails ? <ProceedsDetails terms={terms} summary={summary} payoffCents={parsed.cents} /> : <p className="field-hint">{!summary ? "Complete valid financial fields to see your proceeds." : summary.calculationVersion === 1 ? "Closing costs and seller proceeds were not calculated in this historical version." : summary.closingCostEstimateComplete ? "Based on entered estimates. Fee breakdown below." : "Estimate incomplete. Unknown fees are excluded; breakdown below."}</p>}
    <dl className="loi-summary-list" aria-live="polite" aria-atomic="true">
      <div><dt><strong>Net proceeds</strong></dt><dd style={{ flexShrink: 0, whiteSpace: "nowrap" }}><strong>{net === null ? parsed.error ? "Check payoff" : !summary || summary.calculationVersion === 1 ? "Not calculated" : "Enter payoff" : formatLoiMoney(net)}</strong></dd></div>
    </dl>
  </section>;
}

export function LoiSellerProceedsBreakdown({ terms, summary, payoff }: { terms: LoiTermsV1; summary: LoiComputedSummary | null; payoff: string }) {
  const parsed = parseSellerLoanPayoff(payoff);
  const net = sellerNetProceeds(summary, parsed.cents);
  return <section className="card stack loi-proceeds-breakdown" aria-label="Seller proceeds breakdown">
    <h3>Seller proceeds breakdown</h3>
    <p className="small">The private loan payoff includes all existing loans and payoff fees. Do not repeat those charges in Other closing costs.</p>
    <ProceedsDetails terms={terms} summary={summary} payoffCents={parsed.cents} />
    <dl className="loi-summary-list" aria-live="polite" aria-atomic="true">
      <div><dt><strong>Net proceeds</strong></dt><dd><strong>{net === null ? parsed.error ? "Check payoff" : !summary || summary.calculationVersion === 1 ? "Not calculated" : "Enter payoff above" : formatLoiMoney(net)}</strong></dd></div>
    </dl>
  </section>;
}

function ProceedsDetails({ terms, summary, payoffCents }: { terms: LoiTermsV1; summary: LoiComputedSummary | null; payoffCents: number | null }) {
  return !summary ? <p className="small">Complete valid financial fields to see your proceeds.</p> : summary.calculationVersion === 1 ? <p className="small">Closing costs and seller proceeds were not calculated in this historical version.</p> : <>
      <p className="small">Your share of every fee is listed below. Buyer-paid fees show $0.00 here. Unknown fees are excluded until estimated.</p>
      <dl className="loi-summary-list">
        <ProceedsRow label="Purchase price" cents={terms.purchasePriceCents} />
        {terms.funding.type === "SELLER_FINANCING" ? <ProceedsRow label="Seller-financed principal" cents={summary.loanAmountCents} subtract /> : null}
        {loiFeeBreakdown(terms, summary).map((row) => <ProceedsRow key={row.label} label={row.label} cents={row.sellerCents} subtract />)}
        <ProceedsRow label="Seller credit to buyer" cents={terms.costsAndCredits.sellerCreditCents} subtract />
        <ProceedsRow label="Seller loan payoff" cents={payoffCents} subtract />
      </dl>
      <p className="small">{summary.closingCostEstimateComplete ? "Based on entered estimates; actual charges may differ." : "Estimate incomplete: unknown fees are excluded."} {(summary.calculationVersion === 3 || (summary.calculationVersion === 4 || summary.calculationVersion === 5)) && summary.monthlyRentBackCents ? "Monthly rent-back is separate from closing proceeds. " : ""}Prorations and charges not entered are excluded.</p>
    </>;
}

function ProceedsRow({ label, cents, subtract = false }: { label: string; cents: number | null; subtract?: boolean }) {
  return <div><dt>{label}</dt><dd style={{ flexShrink: 0, whiteSpace: "nowrap" }}>{cents === null ? "Not estimated" : `${subtract && cents !== 0 ? cents < 0 ? "+ " : "− " : ""}${formatLoiMoney(subtract ? Math.abs(cents) : cents)}`}</dd></div>;
}
