export type LoiRole = "BUYER" | "SELLER";

const TERMINAL = new Set(["TERMS_ALIGNED", "DECLINED", "WITHDRAWN", "EXPIRED", "READ_ONLY"]);

export function isTerminalLoiStatus(status: string) {
  return TERMINAL.has(status);
}

export function canDraftLoi(status: string, sequence: number, role: LoiRole) {
  if (isTerminalLoiStatus(status)) return false;
  if (sequence === 0) return role === "BUYER" && status === "AWAITING_BUYER_SUBMISSION";
  return (role === "SELLER" && status === "AWAITING_SELLER_RESPONSE")
    || (role === "BUYER" && status === "AWAITING_BUYER_RESPONSE");
}

export function loiAllowedActions(status: string, sequence: number, authorRole: LoiRole | null, viewerRole: LoiRole, expired: boolean) {
  if (expired || isTerminalLoiStatus(status)) return [];
  if (sequence === 0) return viewerRole === "BUYER" ? ["EDIT", "SUBMIT", "WITHDRAW"] : [];
  if (authorRole === viewerRole) return ["WITHDRAW"];
  return ["AGREE", "COUNTER", "DECLINE"];
}
