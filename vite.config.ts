import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

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
                radiusone: page('radiusone/index.html'),
                ticketone: page('ticketone/index.html'),
                dnsone: page('dnsone/index.html'),
                tools: page('tools/index.html'),
                notFound: page('404.html'),
                toolsNetwork: page('tools/network/index.html'),
                toolsEmail: page('tools/email/index.html'),
                toolsBgp: page('tools/bgp/index.html'),
            },
        },
    },
});
