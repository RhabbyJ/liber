import type { LoiComputedSummary, LoiTermsV1 } from "@liber/validators";

export type LoiAction = "AGREE" | "COUNTER" | "DECLINE" | "EDIT" | "SUBMIT" | "WITHDRAW";
export type LoiRole = "BUYER" | "SELLER";

export type LoiRevision = {
  computedSummary: LoiComputedSummary;
  id: string;
  kind: "COUNTER" | "INITIAL";
  responseDeadline: string;
  sequence: number;
  submittedAt: string;
  submittedByRole: LoiRole;
  terms: LoiTermsV1;
};

export type LoiRevisionPageInfo = {
  hasOlder: boolean;
  oldestSequence: number | null;
};

export type LoiNegotiation = {
  allowedActions: string[];
  conversationId: string;
  currentSequence: number;
  draft: { draftVersion: number; id: string; terms: LoiTermsV1; updatedAt: string } | null;
  effectivelyExpired: boolean;
  id: string;
  propertySnapshot: unknown;
  revisionPageInfo: LoiRevisionPageInfo;
  revisions: LoiRevision[];
  starterTerms: LoiTermsV1 | null;
  status: string | null;
  viewerRole: LoiRole;
};

export type LoiRevisionPage = {
  pageInfo: LoiRevisionPageInfo;
  revisions: LoiRevision[];
};
