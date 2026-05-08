import type { CredentialHandle } from "@max/connector";
import type { FathomConfig } from "./config.js";
import { ErrClientNotStarted } from "./errors.js";

// ============================================================================
// Response types (derived from observed Fathom MCP responses)
// ============================================================================

export interface FathomMeeting {
  recording_id: number;
  title: string;
  url: string;
  recorded_by: string;
  date: string;
  participants: string[];
  summary?: string;
  action_items?: FathomActionItemRaw[];
}

export interface FathomActionItemRaw {
  description: string;
  assignee: string;
  timestamp_url: string;
}

export interface FathomListResponse {
  meetings: FathomMeeting[];
  next_cursor?: string;
}

export interface FathomClient {
  listMeetings(params: {
    maxPages?: number;
    cursor?: string;
    includeSummary?: boolean;
    includeActionItems?: boolean;
  }): Promise<FathomListResponse>;
  getMeetingTranscript(recordingId: number): Promise<string>;
  getMeetingSummary(recordingId: number): Promise<string>;
}

export interface FathomClientProvider {
  readonly client: FathomClient;
}

// ============================================================================
// HTTP client implementation
// ============================================================================

export class FathomHttpClient implements FathomClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async fetch(path: string, params?: Record<string, string>): Promise<Response> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`Fathom API ${res.status}: ${await res.text()}`);
    }
    return res;
  }

  async listMeetings(params: {
    maxPages?: number;
    cursor?: string;
    includeSummary?: boolean;
    includeActionItems?: boolean;
  }): Promise<FathomListResponse> {
    const allMeetings: FathomMeeting[] = [];
    let cursor = params.cursor;
    const maxPages = params.maxPages ?? 5;

    for (let page = 0; page < maxPages; page++) {
      const queryParams: Record<string, string> = {};
      if (cursor) queryParams.cursor = cursor;
      if (params.includeSummary) queryParams.include_summary = "true";
      if (params.includeActionItems) queryParams.include_action_items = "true";

      const res = await this.fetch("/api/v1/calls", queryParams);
      const data = await res.json() as any;

      const meetings: FathomMeeting[] = (data.calls ?? data.results ?? []).map((call: any) => ({
        recording_id: call.id ?? call.recording_id,
        title: call.title ?? "",
        url: call.url ?? call.fathom_url ?? "",
        recorded_by: call.recorded_by ?? call.recorder_name ?? "",
        date: call.recording_started_at ?? call.created_at ?? "",
        participants: (call.calendar_invitees ?? call.participants ?? []).map(
          (p: any) => typeof p === "string" ? p : (p.email ?? p.name ?? ""),
        ),
        summary: call.summary,
        action_items: call.action_items?.map((ai: any) => ({
          description: ai.description ?? ai.text ?? "",
          assignee: ai.assignee ?? "",
          timestamp_url: ai.timestamp_url ?? ai.url ?? "",
        })),
      }));

      allMeetings.push(...meetings);

      const nextCursor = data.next_cursor ?? data.next;
      if (!nextCursor) break;
      cursor = nextCursor;
    }

    return { meetings: allMeetings };
  }

  async getMeetingTranscript(recordingId: number): Promise<string> {
    const res = await this.fetch(`/api/v1/calls/${recordingId}/transcript`);
    const data = await res.json() as any;
    if (typeof data === "string") return data;
    if (data.transcript) return data.transcript;
    if (Array.isArray(data.segments ?? data.utterances)) {
      return (data.segments ?? data.utterances)
        .map((s: any) => `[${s.timestamp ?? s.start}] ${s.speaker ?? "Unknown"}: ${s.text}`)
        .join("\n");
    }
    return JSON.stringify(data);
  }

  async getMeetingSummary(recordingId: number): Promise<string> {
    const res = await this.fetch(`/api/v1/calls/${recordingId}/summary`);
    const data = await res.json() as any;
    if (typeof data === "string") return data;
    return data.summary ?? data.text ?? JSON.stringify(data);
  }
}

// ============================================================================
// Connection wrapper (lifecycle-aware)
// ============================================================================

export class FathomConnection implements FathomClientProvider {
  private http: FathomHttpClient | null = null;

  constructor(
    private readonly config: FathomConfig,
    private readonly tokenHandle: CredentialHandle<string>,
  ) {}

  async start(): Promise<void> {
    const token = await this.tokenHandle.get();
    this.http = new FathomHttpClient("https://api.fathom.video", token);
  }

  get client(): FathomClient {
    if (!this.http) throw ErrClientNotStarted.create({});
    return this.http;
  }

  async health(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.listMeetings({ maxPages: 1 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}
