/**
 * Slack connector config — produced by onboarding, consumed by initialise.
 *
 * workspaceId: the Slack team/workspace ID (e.g. "T01ABC123")
 * channelTypes: which channel types to sync (default: public + private)
 * maxMessagesPerChannel: cap on historical messages per channel (default: 1000)
 */
export interface SlackConfig {
  readonly workspaceId: string;
  readonly channelTypes: "public_channel" | "private_channel" | "all";
  readonly maxMessagesPerChannel: number;
}
