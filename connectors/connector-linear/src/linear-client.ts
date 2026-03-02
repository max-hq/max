/**
 * LinearClient — Connector-owned wrapper around raw GraphQL + @linear/sdk.
 *
 * Data fetching uses raw GraphQL queries for efficiency (exact field selection,
 * inline relation resolution, no N+1). The SDK is kept for health checks only.
 *
 * Lifecycle: start() must be called before accessing graphql() or client.
 */

import { LinearClient as LinearSdkClient } from "@linear/sdk";
import type { CredentialHandle } from "@max/connector";
import { ErrLinearNotStarted, ErrLinearApiError, ErrLinearGraphqlError } from "./errors.js";

const LINEAR_API = "https://api.linear.app/graphql";

export class LinearClient {
  private sdk: LinearSdkClient | null = null;
  private token: string | null = null;

  constructor(
    private readonly tokenHandle: CredentialHandle<string>,
  ) {}

  /** Resolve credentials, cache token, and construct the SDK client. */
  async start(): Promise<void> {
    this.token = await this.tokenHandle.get();
    this.sdk = new LinearSdkClient({ apiKey: this.token });
  }

  /** The underlying Linear SDK client. Throws if start() hasn't been called. */
  get client(): LinearSdkClient {
    if (!this.sdk) {
      throw ErrLinearNotStarted.create({});
    }
    return this.sdk;
  }

  /**
   * Execute a raw GraphQL query against the Linear API.
   *
   * Preferred over the SDK for data fetching — allows exact field selection
   * and inline relation resolution (e.g. `state { name }`, `assignee { id }`)
   * in a single HTTP request.
   */
  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!this.token) {
      throw ErrLinearNotStarted.create({});
    }

    const response = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": this.token,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw ErrLinearApiError.create({
        status: response.status,
        statusText: response.statusText,
      });
    }

    const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };

    if (json.errors?.length) {
      throw ErrLinearGraphqlError.create({
        graphqlMessage: json.errors[0].message,
      });
    }

    return json.data as T;
  }

  /** Lightweight health check against the API. */
  async health(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.viewer;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}
