import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
    // Relative asset paths: the built site works from a domain root or a sub-folder.
    base: './',
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
            },
        },
    },
});
