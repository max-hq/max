/**
 * Slack connector error types.
 */

export class SlackAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackAuthError";
  }
}

export class SlackRateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`Slack rate limited — retry after ${retryAfter}s`);
    this.name = "SlackRateLimitError";
  }
}
