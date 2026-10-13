export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "UploadError";
  }
}
