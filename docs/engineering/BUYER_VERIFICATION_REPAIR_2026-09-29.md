# Buyer verification repair — 2026-09-29

The buyer upload UI previously finalized a document immediately on file selection
without a persistent submission list. The badge form allowed a blank evidence
selection and surfaced expected evidence errors through the generic error page.
Read-only production inspection found both recent buyer uploads finalized and
their documents pending review, with no approved buyer evidence available.

## Changes

- Buyer uploads have an explicit Submit for review control, finalization-aware
  confirmation, and retry that reuses the same upload session after a lost response.
  Choosing the file again recovers from an expired session.
- The buyer sees their latest 50 submitted documents, review status, and rejection
  feedback. This owner-only query returns metadata without private file URLs/paths.
- Admin badge cards identify the account and only offer compatible approved
  documents. Missing evidence links to Documents. Expected failures and successful
  grant/revoke actions return inline feedback and refresh affected views.
- Regranting verified funds/identity clears an old expiry when none is specified.
  Derived cash-buyer signals have no independent revoke action.

## Verification

- Full `npm test`: 537 web tests and 52 validator tests passed, with 16
  credential-dependent web tests skipped; all root static/Node checks passed.
- Eight additional admin buyer-query authorization/privacy regressions passed.
- `npm run typecheck`, `npm run lint`, and a Next production build passed.
- Browser checks used the real components in a temporary local fixture with
  simulated upload responses and badge writes. Selection made zero requests;
  submission displayed pending review; retry repeated finalization without a
  second Storage upload; choosing the same file again recovered after expiry;
  incompatible evidence disabled grant; a simulated grant showed inline success.
  The fixture route was removed before the release build.
- No real financial evidence was approved or badge granted as part of testing.
  Development emitted an existing navigation hydration warning; this is not a
  claim of a warning-free browser session.

No schema migration or environment changes are required. V1 product and admin /
verification section documentation were updated. The release is based on the
existing production runtime, separate from unreleased meeting/tour work.

## Production release

Code commit `58bb263` was built and promoted as deployment
`dpl_HCu2BNTmmC2gpbRoo9L5RTevYwqm` to `https://liber-one.vercel.app`.
Both `smoke:routes` and `smoke:security` passed on that canonical URL. An initial
candidate-URL smoke request encountered Vercel SSO protection rather than the app.
The authenticated production admin UI showed matching approved evidence, disabled
grant for a different unsupported evidence type, and the new Documents guidance.
No real badge grant/revoke was performed. The buyer upload flow was exercised in
the local browser fixture rather than replacing the user's current seller session.

The focused changes were merged into the original working directory while
preserving its existing document-access gates and unrelated edits; typecheck,
59 focused tests, and scoped lint passed there. No production data was changed
by the repair or its verification. Production npm installation still reports
19 existing dependency audit findings; dependency versions were unchanged.
