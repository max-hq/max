import type { CredentialHandle } from "@max/connector";
import {
  ErrGoogleWorkspaceNotStarted,
  ErrGoogleWorkspaceApiError,
  ErrGoogleWorkspaceJwtSigningFailed,
  ErrGoogleWorkspaceServiceAccountKeyInvalid,
} from "./errors.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ADMIN_DIRECTORY_BASE = "https://admin.googleapis.com/admin/directory/v1";
const SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.member.readonly",
  "https://www.googleapis.com/auth/admin.directory.orgunit.readonly",
].join(" ");

interface ServiceAccountKeyData {
  client_email: string;
  private_key: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export class GoogleWorkspaceClient {
  private keyData: ServiceAccountKeyData | null = null;
  private signingKey: CryptoKey | null = null;
  private cachedToken: CachedToken | null = null;

  constructor(
    private readonly keyHandle: CredentialHandle<string>,
    private readonly adminEmail: string,
    readonly domain: string,
    readonly customerId: string,
  ) {}

  async start(): Promise<void> {
    const raw = await this.keyHandle.get();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw ErrGoogleWorkspaceServiceAccountKeyInvalid.create({
        reason: "not valid JSON",
      });
    }

    if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") {
      throw ErrGoogleWorkspaceServiceAccountKeyInvalid.create({
        reason: "missing client_email or private_key",
      });
    }

    this.keyData = {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    };

    this.signingKey = await importPem(this.keyData.private_key);
  }

  // -- Admin Directory API methods --

  async listUsers(pageToken?: string): Promise<{ users: unknown[]; nextPageToken?: string }> {
    const params = new URLSearchParams({
      customer: this.customerId,
      maxResults: "500",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await this.get(`/users?${params}`);
    return {
      users: (data.users as unknown[]) ?? [],
      nextPageToken: data.nextPageToken as string | undefined,
    };
  }

  async listGroups(pageToken?: string): Promise<{ groups: unknown[]; nextPageToken?: string }> {
    const params = new URLSearchParams({
      customer: this.customerId,
      maxResults: "200",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await this.get(`/groups?${params}`);
    return {
      groups: (data.groups as unknown[]) ?? [],
      nextPageToken: data.nextPageToken as string | undefined,
    };
  }

  async listGroupMembers(
    groupKey: string,
    pageToken?: string,
  ): Promise<{ members: unknown[]; nextPageToken?: string }> {
    const params = new URLSearchParams({ maxResults: "200" });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await this.get(`/groups/${encodeURIComponent(groupKey)}/members?${params}`);
    return {
      members: (data.members as unknown[]) ?? [],
      nextPageToken: data.nextPageToken as string | undefined,
    };
  }

  async listOrgUnits(): Promise<{ organizationUnits: unknown[] }> {
    const params = new URLSearchParams({
      customerId: this.customerId,
      type: "all",
    });

    const data = await this.get(`/customer/${encodeURIComponent(this.customerId)}/orgunits?${params}`);
    return {
      organizationUnits: (data.organizationUnits as unknown[]) ?? [],
    };
  }

  async getUser(userKey: string): Promise<Record<string, unknown>> {
    return this.get(`/users/${encodeURIComponent(userKey)}`);
  }

  async getGroup(groupKey: string): Promise<Record<string, unknown>> {
    return this.get(`/groups/${encodeURIComponent(groupKey)}`);
  }

  async health(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.listUsers();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // -- Internal HTTP --

  private async get(path: string): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken();
    const url = `${ADMIN_DIRECTORY_BASE}${path}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw ErrGoogleWorkspaceApiError.create({
        status: response.status,
        statusText: response.statusText,
      });
    }
    return (await response.json()) as Record<string, unknown>;
  }

  // -- JWT / Token --

  private async getAccessToken(): Promise<string> {
    if (!this.keyData || !this.signingKey) {
      throw ErrGoogleWorkspaceNotStarted.create({});
    }

    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.accessToken;
    }

    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: this.keyData.client_email,
      scope: SCOPES,
      aud: GOOGLE_TOKEN_URL,
      sub: this.adminEmail,
      iat: now,
      exp: now + 3600,
    };

    const jwt = await signJwt(claims, this.signingKey);

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw ErrGoogleWorkspaceApiError.create({
        status: response.status,
        statusText: response.statusText,
      });
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000, // refresh 5 min early
    };
    return this.cachedToken.accessToken;
  }
}

// ============================================================================
// JWT Helpers (Web Crypto API, zero external deps)
// ============================================================================

function base64url(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlEncodeString(str: string): string {
  return base64url(new TextEncoder().encode(str));
}

async function importPem(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/, "")
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const binaryStr = atob(pemBody);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      bytes.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (err) {
    throw ErrGoogleWorkspaceJwtSigningFailed.create({
      reason: `failed to import PEM key: ${err}`,
    });
  }
}

async function signJwt(
  claims: Record<string, unknown>,
  key: CryptoKey,
): Promise<string> {
  const header = base64urlEncodeString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64urlEncodeString(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}
