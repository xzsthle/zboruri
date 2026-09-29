const RETRY_STATUSES = new Set([408, 425, 429]);
const BODY_PREVIEW_CHARS = 300;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class HttpError extends Error {
  constructor(status, url, body) {
    const { host, pathname } = new URL(url);
    super(`HTTP ${status} from ${host}${pathname}: ${String(body).slice(0, BODY_PREVIEW_CHARS)}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

function isRetryable(err) {
  if (!(err instanceof HttpError)) return true; // network error or timeout
  return RETRY_STATUSES.has(err.status) || err.status >= 500;
}

/** A small fetch wrapper with default headers, a timeout and exponential-backoff retries. */
export function createHttp({
  fetchImpl = globalThis.fetch,
  headers = {},
  retries = 3,
  backoffMs = 2000,
  timeoutMs = 30_000,
  wait = sleep,
} = {}) {
  async function once(url, init) {
    const res = await fetchImpl(url, {
      ...init,
      headers: { ...headers, ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return res;
    throw new HttpError(res.status, url, await res.text());
  }

  async function request(url, init = {}) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await once(url, init);
      } catch (err) {
        if (attempt >= retries || !isRetryable(err)) throw err;
        await wait(backoffMs * 2 ** attempt);
      }
    }
  }

  return {
    getText: async (url, init) => (await request(url, init)).text(),
    getJson: async (url, init) => (await request(url, init)).json(),
    postJson: async (url, body, init = {}) => {
      const res = await request(url, {
        ...init,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...init.headers },
        body: JSON.stringify(body),
      });
      return res.json();
    },
  };
}
