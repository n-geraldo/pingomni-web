// After the build: writes each page's HTML into its file (so search engines and link previews see the content
// without running scripts), then generates sitemap.xml and robots.txt from the pages' canonical addresses.
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const ssr = join(root, 'dist-ssr');
const site = (loadEnv('production', root, 'VITE_').VITE_SITE_URL ?? 'https://pingomni.com').replace(/\/$/, '');
const { render, structuredData, llmsTxt, llmsFull } = await import(join(ssr, 'entry-server.js'));

const htmlFiles = (dir) =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === 'assets' ? [] : htmlFiles(path);
        return name.endsWith('.html') ? [path] : [];
    });

const urls = [];
for (const file of htmlFiles(dist)) {
    let html = readFileSync(file, 'utf8');
    const mount = html.match(/<div id="root" data-page="([^"]+)" data-root="([^"]+)"><\/div>/);
    if (mount) {
        const [tag, page, base] = mount;
        html = html.replace(tag, tag.replace('></div>', `>${render(page, base)}</div>`));
        // FAQs and prices as structured data, from the same data the page shows (src/lib/geo.ts).
        const data = structuredData(page, site);
        if (data) html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n</head>`);
        writeFileSync(file, html);
        console.log(`prerendered ${relative(dist, file)}`);
    }
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    if (canonical && !/name="robots" content="noindex"/.test(html)) urls.push(canonical);
}

const today = new Date().toISOString().slice(0, 10);
urls.sort((a, b) => a.length - b.length || a.localeCompare(b));
writeFileSync(
    join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`)
        .join('\n')}\n</urlset>\n`,
);
// Everyone may read the site; AI assistants' crawlers are named too, so it is plain they are welcome.
const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot'];
writeFileSync(
    join(dist, 'robots.txt'),
    `User-agent: *\nAllow: /\nDisallow: /api/\n\n${AI_CRAWLERS.map((a) => `User-agent: ${a}`).join('\n')}\nAllow: /\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`,
);
// The site in brief for AI assistants (llmstxt.org), and everything in one file.
writeFileSync(join(dist, 'llms.txt'), llmsTxt(site));
writeFileSync(join(dist, 'llms-full.txt'), llmsFull(site));
console.log('llms.txt, llms-full.txt and robots.txt written');
console.log(`sitemap.xml: ${urls.length} pages`);

rmSync(ssr, { recursive: true, force: true });
