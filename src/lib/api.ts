// Calls to the tools API on our server (/api/?tool=<name>), with friendly errors for every way a call can fail.

export type Result = Record<string, any>;

/** kind tells the page how to show the error: wrong input, too many tests, or the test itself failing. */
export class ToolError extends Error {
    constructor(
        message: string,
        public kind: 'invalid' | 'limited' | 'failed' | 'timeout' = 'failed',
        /** Seconds until another try can work, when the server says. */
        public retryAfter?: number,
    ) {
        super(message);
    }
}

export async function api(tool: string, params: Record<string, string>, timeoutMs = 70000): Promise<Result> {
    const query = new URLSearchParams({ tool, ...params });
    const abort = new AbortController();
    const timer = window.setTimeout(() => abort.abort(), timeoutMs);
    let res: Response;
    try {
        res = await fetch(`/api/?${query}`, { headers: { Accept: 'application/json' }, signal: abort.signal });
    } catch {
        throw abort.signal.aborted
            ? new ToolError(`No answer from our server after ${Math.round(timeoutMs / 1000)} seconds. The test may have hung; try again.`, 'timeout')
            : new ToolError('Could not reach our server. Check your connection and try again.');
    } finally {
        window.clearTimeout(timer);
    }
    const data = await res.json().catch(() => null);
    const retry = Number(res.headers.get('Retry-After')) || data?.retryAfter || undefined;
    if (res.status === 429 || res.status === 503) {
        // nginx's own limit answers with an HTML page; the API answers with JSON.
        throw new ToolError(data?.error ?? 'Too many requests from your address. Wait a minute and try again.', 'limited', retry ?? 60);
    }
    if (res.status === 504 || res.status === 502) {
        if (!data?.error) throw new ToolError('The test took too long and was stopped. Try again.', 'timeout');
    }
    if (!data || !data.ok) {
        const kind = res.status === 400 || res.status === 422 ? 'invalid' : 'failed';
        throw new ToolError(data?.error ?? `Our server answered ${res.status}. Try again in a moment.`, kind, retry);
    }
    return { via: 'server', ...data };
}
