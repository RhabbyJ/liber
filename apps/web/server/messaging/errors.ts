export type MessagingErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "CONFLICT"
  | "RATE_LIMITED";

export class MessagingError extends Error {
  readonly code: MessagingErrorCode;
  readonly status: number;

  constructor(code: MessagingErrorCode, message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "MessagingError";
    this.code = code;
    this.status = status;
  }
}

export function messagingUnavailable() {
  return new MessagingError("UNAVAILABLE", "Conversation is unavailable.", 409);
}

export function messagingNotFound() {
  return new MessagingError("NOT_FOUND", "Conversation is unavailable.", 404);
}

export function messagingInviteUnavailable() {
  return new MessagingError("UNAVAILABLE", "Invitation is unavailable.", 409);
}
