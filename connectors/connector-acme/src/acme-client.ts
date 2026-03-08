/**
 * AcmeConnection - Connector-owned wrapper around the raw @max/acme HTTP client.
 *
 * Ensures lifecycle is respected: start() must be called before accessing the client.
 *
 * Resolvers access ctx.api.client.* - anything passed as `api` in AcmeAppContext
 * must satisfy AcmeClientProvider (i.e. have a `.client` property implementing AcmeClient).
 */

import { AcmeHttpClient, type AcmeClient } from "@max/acme";
import type { CredentialHandle } from "@max/connector";
import type { AcmeConfig } from "./config.js";
import { ErrClientNotStarted } from "./errors.js";

/**
 * The shape that resolvers need from ctx.api.
 * Both AcmeConnection (production) and test wrappers like { client: testClient } satisfy this.
 */
export interface AcmeClientProvider {
  readonly client: AcmeClient;
}

export class AcmeConnection implements AcmeClientProvider {
  private http: AcmeHttpClient | null = null;

  constructor(
    private readonly config: AcmeConfig,
    private readonly tokenHandle: CredentialHandle<string>,
  ) {}

  /** Resolve credentials and construct the HTTP client. */
  async start(): Promise<void> {
    const token = await this.tokenHandle.get();
    this.http = new AcmeHttpClient({
      baseUrl: this.config.baseUrl,
      apiKey: token,
    });
  }

  /** The underlying HTTP client. Throws if start() hasn't been called. */
  get client(): AcmeClient {
    if (!this.http) {
      throw ErrClientNotStarted.create({});
    }
    return this.http;
  }

  /** Lightweight health check against the API. */
  async health(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.listWorkspaces();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}
