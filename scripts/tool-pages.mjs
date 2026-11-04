// Writes tools/<slug>/index.html for every tool in src/tools/pages.json, so each tool has its own address, title and
// description. Run by "npm run build"; the files are kept in git like the other pages.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pages = JSON.parse(readFileSync(`${root}src/tools/pages.json`, 'utf8'));
const list = readFileSync(`${root}src/lib/toolList.ts`, 'utf8');
const GROUP_NAMES = { network: 'Network tools', email: 'DNS and email tools', bgp: 'BGP and ASN tools' };

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

for (const t of Object.values(pages)) {
    const group = list.match(new RegExp(`id: '${t.id}', group: '(\\w+)'`))?.[1];
    if (!group) throw new Error(`No group for ${t.id} in toolList.ts`);
    const site = '%VITE_SITE_URL%';
    const url = `${site}/tools/${t.slug}/`;
    const image = `${site}/og/tools-${group}.png?v=2`;
    const data = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebApplication',
                name: t.h1,
                description: t.description,
                url,
                applicationCategory: 'UtilitiesApplication',
                operatingSystem: 'Any',
                browserRequirements: 'Requires JavaScript',
                isAccessibleForFree: true,
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
                publisher: { '@id': `${site}/#organization` },
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'PingOmni', item: `${site}/` },
                    { '@type': 'ListItem', position: 2, name: GROUP_NAMES[group], item: `${site}/tools/${group}/` },
                    { '@type': 'ListItem', position: 3, name: t.h1, item: url },
                ],
            },
        ],
    };
    const html = `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${attr(t.title)}</title>
        <meta name="description" content="${attr(t.description)}" />
        <link rel="canonical" href="${url}" />
        <meta name="theme-color" content="#ffffff" />
        <link rel="icon" href="../../favicon.ico" sizes="48x48" />
        <link rel="icon" href="../../favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="../../apple-touch-icon.png" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="PingOmni" />
        <meta property="og:title" content="${attr(t.title)}" />
        <meta property="og:description" content="${attr(t.description)}" />
        <meta property="og:url" content="${url}" />
        <meta property="og:image" content="${image}" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="${attr(t.title)}" />
        <meta name="twitter:description" content="${attr(t.description)}" />
        <meta name="twitter:image" content="${image}" />
        <script type="application/ld+json">${JSON.stringify(data)}</script>
        <script>
            // Apply the saved theme before first paint, so the page never flashes the wrong one.
            try {
                var t = localStorage.getItem('pingomni-theme');
                if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
            } catch (e) {}
        </script>
    </head>
    <body>
        <div id="root" data-page="tool-${t.id}" data-root="../../"></div>
        <script type="module" src="/src/main.tsx"></script>
    </body>
</html>
`;
    mkdirSync(`${root}tools/${t.slug}`, { recursive: true });
    writeFileSync(`${root}tools/${t.slug}/index.html`, html);
}
console.log(`${Object.keys(pages).length} tool pages written`);
