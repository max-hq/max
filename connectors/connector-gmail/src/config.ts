/**
 * Gmail connector config — produced by onboarding, consumed by initialise.
 *
 * maxThreads: total threads to sync (default: 2000, covers ~6 months for typical inboxes)
 * labelFilter: Gmail label IDs to sync (default: ["INBOX", "SENT"])
 * includeSpamTrash: whether to include SPAM and TRASH labels (default: false)
 */
export interface GmailConfig {
  readonly emailAddress: string;
  readonly maxThreads: number;
  readonly labelFilter: string[];
  readonly includeSpamTrash: boolean;
}
