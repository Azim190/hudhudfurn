/**
 * Minimal typed Meilisearch REST client (https://www.meilisearch.com/docs/reference/api).
 * The official JS client is ESM-only, which the CommonJS Nest/Jest toolchain cannot load.
 */
export interface MeiliTask {
  taskUid: number;
}

export interface MeiliSearchQuery {
  indexUid: string;
  q?: string;
  filter?: Array<string | string[]>;
  sort?: string[];
  facets?: string[];
  hitsPerPage?: number;
  page?: number;
  limit?: number;
  attributesToRetrieve?: string[];
  matchingStrategy?: 'all' | 'last' | 'frequency';
}

export interface MeiliSearchResult<T> {
  hits: T[];
  totalHits?: number;
  estimatedTotalHits?: number;
  facetDistribution?: Record<string, Record<string, number>>;
  facetStats?: Record<string, { min: number; max: number }>;
}

export class MeiliError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'MeiliError';
  }
}

export class MeiliClient {
  constructor(
    private readonly host: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.host.replace(/\/$/, '')}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const err = (json ?? {}) as { message?: string; code?: string };
      throw new MeiliError(res.status, err.code, err.message ?? res.statusText);
    }
    return json as T;
  }

  /** Poll a task until it succeeds; surfaces the task error if it fails. */
  async wait(task: MeiliTask, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (let delay = 25; ; delay = Math.min(delay * 2, 500)) {
      const t = await this.request<{ status: string; error?: { message: string; code: string } }>('GET', `/tasks/${task.taskUid}`);
      if (t.status === 'succeeded') return;
      if (t.status === 'failed' || t.status === 'canceled') {
        throw new MeiliError(400, t.error?.code, t.error?.message ?? `Task ${task.taskUid} ${t.status}`);
      }
      if (Date.now() > deadline) throw new MeiliError(504, 'task_timeout', `Task ${task.taskUid} timed out`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  async createIndex(uid: string, primaryKey: string): Promise<void> {
    try {
      await this.wait(await this.request<MeiliTask>('POST', '/indexes', { uid, primaryKey }));
    } catch (err) {
      if (!(err instanceof MeiliError && err.code === 'index_already_exists')) throw err;
    }
  }

  async updateSettings(uid: string, settings: Record<string, unknown>): Promise<void> {
    await this.wait(await this.request<MeiliTask>('PATCH', `/indexes/${uid}/settings`, settings));
  }

  async addDocuments(uid: string, docs: unknown[]): Promise<void> {
    await this.wait(await this.request<MeiliTask>('POST', `/indexes/${uid}/documents`, docs));
  }

  async deleteDocuments(uid: string, ids: string[]): Promise<void> {
    await this.wait(await this.request<MeiliTask>('POST', `/indexes/${uid}/documents/delete-batch`, ids));
  }

  async deleteAllDocuments(uid: string): Promise<void> {
    await this.wait(await this.request<MeiliTask>('DELETE', `/indexes/${uid}/documents`));
  }

  async search<T>(query: MeiliSearchQuery): Promise<MeiliSearchResult<T>> {
    const { indexUid, ...body } = query;
    return this.request('POST', `/indexes/${indexUid}/search`, body);
  }

  async multiSearch<T>(queries: MeiliSearchQuery[]): Promise<Array<MeiliSearchResult<T>>> {
    const res = await this.request<{ results: Array<MeiliSearchResult<T>> }>('POST', '/multi-search', { queries });
    return res.results;
  }

  async isHealthy(): Promise<boolean> {
    try {
      return (await this.request<{ status: string }>('GET', '/health')).status === 'available';
    } catch {
      return false;
    }
  }
}
