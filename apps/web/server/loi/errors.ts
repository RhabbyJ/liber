export type LoiErrorCode = "AUTHENTICATION_REQUIRED" | "CONFLICT" | "INVALID_INPUT" | "NOT_FOUND" | "RATE_LIMITED" | "UNAVAILABLE";

export class LoiError extends Error {
  constructor(readonly code: LoiErrorCode, message: string, readonly status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "LoiError";
  }
}

export const loiNotFound = () => new LoiError("NOT_FOUND", "Negotiation is unavailable.", 404);
export const loiUnavailable = () => new LoiError("UNAVAILABLE", "Negotiation is unavailable.", 409);
export const loiConflict = (message = "Negotiation changed. Refresh and try again.") => new LoiError("CONFLICT", message, 409);

