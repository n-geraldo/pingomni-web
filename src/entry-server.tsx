import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';
import type { PageId } from './shared/Layout';

export { llmsFull, llmsTxt, structuredData } from './lib/geo';

// Build-time rendering (scripts/prerender.mjs): the HTML search engines and link previews see before any script runs.
export function render(page: PageId, root: string): string {
    return renderToString(
        <StrictMode>
            <App page={page} root={root} />
        </StrictMode>,
    );
}
