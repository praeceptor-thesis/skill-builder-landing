/**
 * Thin client for the skill-builder registry (Cloudflare Worker) API.
 *
 * The Worker wraps every response in an envelope: `{ ok: true, data }` on
 * success or `{ ok: false, error: { code, message, detail? } }` on failure.
 * This client unwraps `data` and throws a `RegistryError` carrying the code so
 * tools can produce actionable messages.
 *
 * Uses the Node 18+ global `fetch`; no third-party HTTP dependency.
 */

import { REQUEST_TIMEOUT_MS } from "./constants.js";
import type {
  GetSkillResponse,
  ListSkillsResponse,
  RegistrySearchParams,
  RegistryTaxonomy,
  SuggestResponse,
} from "./types.js";

export class RegistryError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

/** Normalize a registry value to its `/api` base, tolerating a bare site URL. */
export function apiBase(registry: string): string {
  const trimmed = registry.replace(/\/+$/, "");
  return /\/api$/.test(trimmed) ? trimmed : `${trimmed}/api`;
}

export class RegistryClient {
  private readonly baseUrl: string;
  private readonly token: string | null;

  constructor(baseUrl: string, token?: string | null) {
    this.baseUrl = apiBase(baseUrl);
    this.token = token ?? null;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string>) },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new RegistryError(
          `Request to ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`,
          "TIMEOUT",
          0,
        );
      }
      throw new RegistryError(
        `Could not reach the registry at ${this.baseUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "NETWORK_ERROR",
        0,
      );
    } finally {
      clearTimeout(timer);
    }

    // The Worker always returns JSON. A non-JSON body means something in front
    // of it (e.g. Cloudflare Bot Fight Mode 403ing a request) intercepted us.
    const text = await response.text();
    let body: { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } };
    try {
      body = JSON.parse(text);
    } catch {
      throw new RegistryError(
        `Registry returned a non-JSON response (HTTP ${response.status}). ` +
          `This usually means a proxy or WAF blocked the request rather than the API itself.`,
        "NON_JSON_RESPONSE",
        response.status,
      );
    }

    if (!body.ok) {
      throw new RegistryError(
        body.error?.message || `Request failed (HTTP ${response.status})`,
        body.error?.code || "UNKNOWN",
        response.status,
      );
    }

    return body.data as T;
  }

  async listSkills(params: RegistrySearchParams = {}): Promise<ListSkillsResponse> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => search.append(key, String(v)));
      } else if (typeof value === "boolean") {
        if (value) search.set(key, "1");
      } else {
        search.set(key, String(value));
      }
    }
    const qs = search.toString();
    return this.request<ListSkillsResponse>(`/skills${qs ? `?${qs}` : ""}`);
  }

  /**
   * Fetch a single skill's full record by id. NOTE: the Worker increments the
   * skill's download counter on this endpoint, so it is the right call for an
   * install but NOT for read-only previews — use `findSkill` for those.
   */
  async getSkill(id: string): Promise<GetSkillResponse> {
    return this.request<GetSkillResponse>(`/skills/${encodeURIComponent(id)}`);
  }

  async getTaxonomy(): Promise<RegistryTaxonomy> {
    return this.request<RegistryTaxonomy>("/taxonomy");
  }

  async suggest(query: string, limit?: number): Promise<SuggestResponse> {
    const search = new URLSearchParams({ q: query });
    if (limit) search.set("limit", String(limit));
    return this.request<SuggestResponse>(`/skills/suggest?${search.toString()}`);
  }
}
