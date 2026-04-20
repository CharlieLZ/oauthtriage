const ADMIN_BASE = 'https://admin.googleapis.com';
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_RETRY_DELAYS_MS = [250, 500];

type QueryValue = string | number | boolean | undefined;

type GoogleRequestOptions = {
  method?: 'GET' | 'DELETE';
  query?: Record<string, QueryValue>;
  retries?: number;
  fetchFn?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
};

async function readResponseDetail(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const json = await response.json();
      return JSON.stringify(json);
    } catch {
      return response.statusText;
    }
  }

  try {
    return await response.text();
  } catch {
    return response.statusText;
  }
}

function toUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${ADMIN_BASE}${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

async function executeGoogleRequest(
  path: string,
  accessToken: string,
  options: GoogleRequestOptions = {}
): Promise<Response> {
  const fetchFn = options.fetchFn || fetch;
  const sleep = options.sleep || ((delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const method = options.method || 'GET';
  const retryDelays = DEFAULT_RETRY_DELAYS_MS.slice(0, Math.max(0, options.retries ?? (method === 'GET' ? DEFAULT_RETRY_DELAYS_MS.length : 0)));

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetchFn(toUrl(path, options.query), {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      });

      if (response.ok) return response;

      if (attempt < retryDelays.length && isRetryableStatus(response.status)) {
        await sleep(retryDelays[attempt]);
        continue;
      }

      const detail = await readResponseDetail(response);
      throw new Error(`Google API ${response.status} ${response.statusText}: ${detail}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Google API ')) throw error;
      if (attempt < retryDelays.length) {
        await sleep(retryDelays[attempt]);
        continue;
      }
      throw new Error(`Google request failed after ${attempt + 1} attempt(s): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export async function googleJsonRequest<T>(
  path: string,
  accessToken: string,
  options?: GoogleRequestOptions
): Promise<T> {
  const response = await executeGoogleRequest(path, accessToken, options);
  return (await response.json()) as T;
}

export async function googleVoidRequest(
  path: string,
  accessToken: string,
  options?: GoogleRequestOptions
): Promise<void> {
  await executeGoogleRequest(path, accessToken, options);
}
