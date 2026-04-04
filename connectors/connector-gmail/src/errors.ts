/**
 * Gmail connector error types.
 */

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

export class GmailQuotaError extends Error {
  constructor() {
    super("Gmail API quota exceeded — sync will resume on next run");
    this.name = "GmailQuotaError";
  }
}
