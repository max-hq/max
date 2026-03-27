/**
 * Gmail API client — typed wrapper over the Gmail REST API v1.
 *
 * Uses OAuth 2.0 Bearer tokens. Handles pagination automatically.
 *
 * Rate limits: Gmail API allows 250 quota units/user/second.
 *   - threads.list: 5 units/call
 *   - threads.get:  10 units/call (includes full message bodies)
 *   - labels.list:  1 unit/call
 *   - profile:      1 unit/call
 *
 * The operations layer enforces concurrency to stay within quota.
 */

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1";

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
}

export interface GmailApiLabel {
  id: string;
  name: string;
  type: "system" | "user";
  messagesTotal?: number;
  messagesUnread?: number;
}

export interface GmailApiThread {
  id: string;
  snippet: string;
  historyId: string;
  messages?: GmailApiMessage[];
}

export interface GmailApiMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  payload?: GmailMessagePayload;
  internalDate?: string;  // Unix ms as string
}

export interface GmailMessagePayload {
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size: number };
  parts?: GmailMessagePayload[];
  mimeType?: string;
}

export class GmailClient {
  constructor(private _getToken: () => string) {}

  async getProfile(): Promise<GmailProfile> {
    return this._call<GmailProfile>("users/me/profile");
  }

  async listLabels(): Promise<GmailApiLabel[]> {
    const data = await this._call<{ labels: GmailApiLabel[] }>("users/me/labels");
    return data.labels;
  }

  async getLabelDetails(labelId: string): Promise<GmailApiLabel> {
    return this._call<GmailApiLabel>(`users/me/labels/${labelId}`);
  }

  async listThreads(opts: {
    labelIds?: string[];
    maxResults?: number;
    includeSpamTrash?: boolean;
  }): Promise<GmailApiThread[]> {
    const limit = opts.maxResults ?? 2000;
    const pageSize = Math.min(500, limit);

    return this._paginate<GmailApiThread>(
      "users/me/threads",
      "threads",
      {
        labelIds: opts.labelIds?.join(","),
        maxResults: pageSize,
        includeSpamTrash: opts.includeSpamTrash ? "true" : undefined,
      },
      Math.ceil(limit / pageSize)
    );
  }

  async getThread(threadId: string): Promise<GmailApiThread> {
    return this._call<GmailApiThread>(`users/me/threads/${threadId}`, {
      format: "full",
    });
  }

  private async _call<T>(
    path: string,
    params: Record<string, string | undefined> = {}
  ): Promise<T> {
    const url = new URL(`${GMAIL_BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this._getToken()}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gmail API ${path} failed (${res.status}): ${body}`);
    }

    return res.json() as Promise<T>;
  }

  private async _paginate<T>(
    path: string,
    key: string,
    params: Record<string, string | undefined>,
    maxPages: number
  ): Promise<T[]> {
    const results: T[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
      const data = await this._call<Record<string, unknown>>(path, {
        ...params,
        pageToken,
      });
      const page = (data[key] ?? []) as T[];
      results.push(...page);
      pageToken = data.nextPageToken as string | undefined;
      pages++;
    } while (pageToken && pages < maxPages);

    return results;
  }
}

// ============================================================================
// Header extraction helpers
// ============================================================================

export function extractHeader(
  payload: GmailMessagePayload | undefined,
  name: string
): string {
  return (
    payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase()
    )?.value ?? ""
  );
}

export function extractTextBody(payload: GmailMessagePayload | undefined): string {
  if (!payload) return "";

  // Prefer text/plain parts
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // Recurse into multipart
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractTextBody(part);
      if (text) return text;
    }
  }

  return "";
}

export interface GmailClientProvider {
  readonly client: GmailClient;
}
