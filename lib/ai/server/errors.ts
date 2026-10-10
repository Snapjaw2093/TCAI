// A problem the person should hear about, in plain words, with the HTTP status to send.
export class AiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
