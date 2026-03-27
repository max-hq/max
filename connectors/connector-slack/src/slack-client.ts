/**
 * Slack Web API client — thin typed wrapper over fetch.
 *
 * Uses the Slack Web API (https://api.slack.com/web) with a Bot Token.
 * All methods handle pagination via cursor automatically.
 *
 * Rate limiting: Slack Tier 2 methods allow ~20 req/min, Tier 3 ~50 req/min.
 * The operations layer enforces concurrency limits; this client is stateless.
 */

export interface SlackTeam {
  id: string;
  name: string;
  domain: string;
  icon: { image_132?: string };
}

export interface SlackApiUser {
  id: string;
  name: string;
  real_name?: string;
  is_bot: boolean;
  is_admin?: boolean;
  tz?: string;
  profile: {
    display_name?: string;
    email?: string;
    image_72?: string;
  };
}

export interface SlackApiChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_archived: boolean;
  num_members?: number;
  topic?: { value: string };
  purpose?: { value: string };
}

export interface SlackApiMessage {
  ts: string;
  thread_ts?: string;
  user?: string;
  bot_id?: string;
  text: string;
  reply_count?: number;
  reactions?: Array<{ name: string; count: number }>;
}

export class SlackClient {
  private readonly _baseUrl = "https://slack.com/api";

  constructor(private readonly _token: string) {}

  async getTeam(): Promise<SlackTeam> {
    const data = await this._call("team.info");
    return data.team;
  }

  async listUsers(): Promise<SlackApiUser[]> {
    return this._paginate<SlackApiUser>("users.list", "members", {
      limit: 200,
    });
  }

  async listChannels(
    types: string = "public_channel,private_channel"
  ): Promise<SlackApiChannel[]> {
    return this._paginate<SlackApiChannel>("conversations.list", "channels", {
      types,
      limit: 200,
      exclude_archived: false,
    });
  }

  async listMessages(
    channelId: string,
    limit: number = 1000
  ): Promise<SlackApiMessage[]> {
    const messages = await this._paginate<SlackApiMessage>(
      "conversations.history",
      "messages",
      { channel: channelId, limit: 200 },
      Math.ceil(limit / 200)
    );
    return messages.slice(0, limit);
  }

  async listReplies(
    channelId: string,
    threadTs: string
  ): Promise<SlackApiMessage[]> {
    // Skip the first message — it's the parent, already synced
    const all = await this._paginate<SlackApiMessage>(
      "conversations.replies",
      "messages",
      { channel: channelId, ts: threadTs, limit: 200 }
    );
    return all.slice(1);
  }

  private async _call(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const url = new URL(`${this._baseUrl}/${method}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this._token}` },
    });

    if (!res.ok) {
      throw new Error(`Slack API ${method} failed: HTTP ${res.status}`);
    }

    const json = await res.json();
    if (!json.ok) {
      throw new Error(`Slack API ${method} error: ${json.error}`);
    }

    return json;
  }

  private async _paginate<T>(
    method: string,
    key: string,
    params: Record<string, unknown>,
    maxPages: number = 50
  ): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | undefined;
    let pages = 0;

    do {
      const data = await this._call(method, { ...params, cursor });
      results.push(...(data[key] as T[]));
      cursor = data.response_metadata?.next_cursor;
      pages++;
    } while (cursor && pages < maxPages);

    return results;
  }
}

export interface SlackClientProvider {
  readonly client: SlackClient;
}
