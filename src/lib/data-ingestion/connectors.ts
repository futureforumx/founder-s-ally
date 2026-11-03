import type { MarketDataProvider, MarketEntityType, SourceRecord } from "./types";

export interface SourcePage<T = Record<string, unknown>> { records: T[]; nextCursor: string | null; }
export interface MarketDataConnector {
  provider: MarketDataProvider;
  fetchPage(entityType: MarketEntityType, cursor?: string | null, signal?: AbortSignal): Promise<SourcePage>;
}

export interface ProviderConfig {
  baseUrl?: string;
  token: string;
  licenseScope: string;
  batchSize?: number;
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  fieldIds?: string[];
  query?: Array<Record<string, unknown>>;
  collectionByEntity?: Partial<Record<MarketEntityType, string>>;
  requestFactory?: (args: { provider: MarketDataProvider; entityType: MarketEntityType; cursor: string | null; limit: number; token: string; baseUrl: string }) => { url: URL; init: RequestInit };
  parseResponse?: (payload: Record<string, unknown>, requestedLimit: number) => SourcePage;
}

export class AuthorizedApiConnector implements MarketDataConnector {
  readonly provider: MarketDataProvider;
  private lastRequestAt = 0;
  private readonly fetchImpl: typeof fetch;
  constructor(provider: MarketDataProvider, private readonly config: ProviderConfig) {
    if (!config.token.trim()) throw new Error(`${provider} API token is not configured`);
    if (!config.licenseScope.trim()) throw new Error(`${provider} license scope is required`);
    this.provider = provider;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async fetchPage(entityType: MarketEntityType, cursor: string | null = null, signal?: AbortSignal): Promise<SourcePage> {
    const limit = Math.max(1, Math.min(this.config.batchSize ?? (this.provider === "tracxn" ? 20 : 50), this.provider === "tracxn" ? 20 : 100));
    const baseUrl = this.config.baseUrl ?? (this.provider === "crunchbase" ? "https://api.crunchbase.com/v4/data/searches" : "");
    if (this.provider === "tracxn" && (!baseUrl || !this.config.requestFactory || !this.config.parseResponse)) {
      throw new Error("Tracxn requires the licensed dataset endpoint and pagination/response contract from its API documentation or order form");
    }
    const collection = this.config.collectionByEntity?.[entityType] ?? ({ company: "organizations", firm: "organizations", person: "people", funding_round: "funding_rounds" } as const)[entityType];
    const defaultUrl = this.provider === "crunchbase" ? new URL(`${baseUrl.replace(/\/$/, "")}/${collection}`) : new URL(baseUrl);
    const request = this.config.requestFactory
      ? this.config.requestFactory({ provider: this.provider, entityType, cursor, limit, token: this.config.token, baseUrl })
      : this.provider === "crunchbase"
        ? {
          url: defaultUrl,
          init: {
          method: "POST",
          headers: { "X-cb-user-key": this.config.token, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ field_ids: this.config.fieldIds ?? ["identifier"], query: this.config.query ?? [], limit, ...(cursor ? { after_id: cursor } : {}) }),
          },
        }
        : (() => { throw new Error("A provider-specific request factory is required"); })();
    const url = request.url;
    const init: RequestInit = { ...request.init };
    if (signal) init.signal = signal;
    await this.rateLimit();
    let response: Response | null = null;
    for (let attempt = 0; attempt <= (this.config.maxRetries ?? 3); attempt += 1) {
      try {
        response = await this.fetchImpl(url, init);
        if (response.ok || (![429, 500, 502, 503, 504].includes(response.status))) break;
      } catch (error) {
        if (signal?.aborted) throw error;
        if (attempt >= (this.config.maxRetries ?? 3)) throw error;
      }
      if (attempt < (this.config.maxRetries ?? 3)) await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 400 * 2 ** attempt)));
    }
    if (!response?.ok) throw new Error(`${this.provider} API request failed (${response?.status ?? "network error"})`);
    const payload = await response.json() as Record<string, unknown>;
    if (this.config.parseResponse) return this.config.parseResponse(payload, limit);
    const entities = Array.isArray(payload.entities) ? payload.entities as Array<Record<string, unknown>> : [];
    const records: Record<string, unknown>[] = entities.map((entity) => {
      const properties = entity.properties && typeof entity.properties === "object" ? entity.properties as Record<string, unknown> : {};
      const flattened: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(properties)) {
        if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) flattened[key] = (value as { value: unknown }).value;
        else flattened[key] = value;
      }
      const identifier = properties.identifier && typeof properties.identifier === "object" ? properties.identifier as Record<string, unknown> : {};
      return { ...flattened, ...entity, name: flattened.name ?? identifier.value ?? flattened.identifier, id: entity.uuid ?? entity.id };
    });
    const nextCursor = records.length >= limit ? String(records.at(-1)?.uuid ?? "") || null : null;
    return { records, nextCursor };
  }

  async *iterate(entityType: MarketEntityType, startCursor: string | null = null, signal?: AbortSignal): AsyncGenerator<SourcePage> {
    if (signal?.aborted) return;
    let cursor = startCursor;
    const seenCursors = new Set<string>();
    do {
      const page = await this.fetchPage(entityType, cursor, signal);
      yield page;
      cursor = page.nextCursor;
      if (signal?.aborted) return;
      if (cursor && seenCursors.has(cursor)) throw new Error(`${this.provider} API returned a repeated pagination cursor`);
      if (cursor) seenCursors.add(cursor);
    } while (cursor && !signal?.aborted);
  }

  toSourceRecord(record: Record<string, unknown>, entityType: MarketEntityType, importJobId: string, retrievedAt = new Date().toISOString()): SourceRecord {
    const sourceId = String(record.uuid ?? record.id ?? record.external_id ?? "").trim();
    if (!sourceId) throw new Error(`${this.provider} record is missing a stable provider ID`);
    const sourceUrl = String(record.source_url ?? record.profile_url ?? record.url ?? "") || null;
    return { provider: this.provider, entityType, sourceId, sourceUrl, retrievedAt, payload: record, payloadHash: "", importJobId, licenseScope: this.config.licenseScope };
  }

  private async rateLimit() {
    const delay = (this.config.minIntervalMs ?? 250) - (Date.now() - this.lastRequestAt);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    this.lastRequestAt = Date.now();
  }
}

export function browserExtractionEnabled(provider: MarketDataProvider, authorization: { writtenPermission: boolean; licenseAllowsAutomation: boolean }): boolean {
  // Crunchbase blocks automated scraping unless expressly authorized; Tracxn directs automation through authorized APIs.
  return provider === "crunchbase" && authorization.writtenPermission && authorization.licenseAllowsAutomation;
}

export function makeSourceRecord(input: Omit<SourceRecord, "payloadHash"> & { payloadHash?: string }): SourceRecord {
  return { ...input, payloadHash: input.payloadHash ?? "" };
}
