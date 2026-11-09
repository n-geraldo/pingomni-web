import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// One page per tool: their HTML files come from scripts/tool-pages.mjs.
const toolPages: Record<string, { slug: string }> = JSON.parse(readFileSync(page('src/tools/pages.json'), 'utf8'));

export default defineConfig({
    // Absolute asset paths: the site lives at a domain root, and the 404 page is served at any depth.
    base: '/',
    plugins: [react()],
    // In development, the tools API comes from the server build.
    server: { proxy: { '/api/': process.env.API_ORIGIN ?? 'http://10.4.100.101:8091' } },
    build: {
        outDir: 'dist',
        assetsInlineLimit: 0,
        // One HTML file per page, so /radiusone/ and the others work on any static host without rewrites.
        rollupOptions: {
            input: {
                home: page('index.html'),
                monitor: page('monitor/index.html'),
                radiusone: page('radiusone/index.html'),
                dnsone: page('dnsone/index.html'),
                docs: page('docs/index.html'),
                docsRadiusone: page('docs/radiusone/index.html'),
                docsDnsone: page('docs/dnsone/index.html'),
                docsMonitor: page('docs/monitor/index.html'),
                guides: page('guides/index.html'),
                blog: page('blog/index.html'),
                guideFreeradiusBilling: page('guides/freeradius-billing-for-isps/index.html'),
                guideConnectMikrotik: page('guides/connect-mikrotik-to-freeradius/index.html'),
                guideMikrotikPppoe: page('guides/mikrotik-pppoe-freeradius/index.html'),
                guideRpzPowerdns: page('guides/rpz-ad-blocking-powerdns/index.html'),
                tools: page('tools/index.html'),
                terms: page('terms/index.html'),
                privacy: page('privacy/index.html'),
                notFound: page('404.html'),
                toolsNetwork: page('tools/network/index.html'),
                toolsEmail: page('tools/email/index.html'),
                toolsBgp: page('tools/bgp/index.html'),
                ...Object.fromEntries(Object.values(toolPages).map((t) => [`tool-${t.slug}`, page(`tools/${t.slug}/index.html`)])),
            },
        },
    },
});
