# PingOmni website

The company site for PingOmni, the home of RadiusOne, DNSOne and the "One" product family (TicketOne is coming). It's a static Vite + React build, plus a small PHP API for the network tools page. It uses the RadiusOne portal's token names and logo language, in the brand's teal palette (the DNSOne colours).

## Develop and build

```bash
npm ci
npm run dev          # http://localhost:5173
npm run build        # type-check, build, pre-render every page, write sitemap.xml and robots.txt into dist/
```

Upload `dist/` to the root of a domain (asset paths are absolute). Serve missing addresses with `404.html` and a 404 status, as `deploy/nginx.conf` does.

## Settings

Set these at build time in `.env` (or `.env.production`):

| Variable | Default | Used for |
|---|---|---|
| `VITE_SITE_URL` | `https://pingomni.com` | Canonical links, Open Graph tags, structured data, sitemap.xml and robots.txt |
| `VITE_DEMO_URL` | `https://demo-radiusone.pingomni.com/?r=/login` | "Try the demo" buttons. The RadiusOne demo is its own site (`/opt/radiusone-demo`); `?r=/login` opens it at the sign-in page |
| `VITE_DNSONE_DEMO_URL` | `https://demo-dns.pingomni.com/` | DNSOne "Try the demo" buttons |
| `VITE_CONTACT_EMAIL` | `hello@pingomni.com` | Contact and "Tell me when it's ready" links |

## Network tools

Three pages, all in the navbar's Tools menu. `/tools/network/`: ping, traceroute, MTR, port check, reverse lookup, proxy checker, bandwidth meter and subnet calculator (address and mask, range to mask, splitting, prefix map). `/tools/email/`: DNS lookup, MX, NS, SPF, DMARC, DKIM, SMTP, WHOIS and blacklist checks. `/tools/bgp/`: AS lookup, prefix lookup (origin, RPKI, visibility, upstreams, common AS paths) and a looking glass. Each tool has its own address (`/tools/email/#mx`), and old `/tools/#...` links forward to the right page. The tool names live in `src/lib/toolList.ts`.

The calculators run in the browser. Everything else calls `api/index.php` (`/api/?tool=<name>`). The API needs PHP 8.3 with curl and openssl, plus `ping` and `mtr` on the server. WHOIS uses the public RDAP service (rdap.org). The BGP tools use RIPEstat (stat.ripe.net, RIPE NCC's RIS route collectors, called with `sourceapp=pingomni`), PeeringDB's public API and Team Cymru's AS-name DNS service (`AS<n>.asn.cymru.com`), none of which need a key; answers are cached for 5 minutes in the API's temp directory. Traceroute and MTR from our server show the networks crossed, named through the same Team Cymru service.

- Ping, traceroute, port and SMTP checks only reach public addresses; private, loopback, link-local, CGNAT and reserved ranges are refused.
- Each visitor gets 10 outbound tests and 40 lookups a minute (counted in the system temp folder), and nginx caps the API at 60 requests a minute per IP.
- The blacklist check queries 27 IP lists (plus 5 domain lists for a domain) in parallel with `dig`, at most 6 runs a minute. A listing only counts if the list does not also list a test address, so dead lists that answer "listed" for everything show "No answer". Spamhaus refuses queries through public resolvers such as 1.1.1.1; a local recursive resolver on the server would fix that.
- Ping, traceroute, MTR and DNS lookup can also run from other countries through [Globalping](https://globalping.io), a free, open network of probes (`src/lib/globalping.ts`). The visitor's browser calls its API directly, so each visitor uses their own free allowance (250 tests an hour) and nothing goes through our server.
- "Check all common ports" tests one fixed list of 27 ports in parallel (4-second timeout), never a range the visitor picks, and is limited to 3 runs a minute. The list is in `api/index.php` and `src/pages/Tools.tsx`; keep them in step.
- The API runs in its own PHP-FPM pool, so slow tools never take workers from other sites.

Install the configs in `deploy/`:

```bash
sudo cp deploy/php-fpm-pool.conf /etc/php/8.3/fpm/pool.d/pingomni.conf && sudo systemctl reload php8.3-fpm
sudo cp deploy/nginx.conf /etc/nginx/sites-available/pingomni-web && sudo nginx -t && sudo systemctl reload nginx
```

`npm run dev` sends `/api/` to the server build (`API_ORIGIN`, default `http://10.4.100.101:8091`).

## Search engines

- Every page is pre-rendered at build time (`src/entry-server.tsx`, `scripts/prerender.mjs`), so its text and links are in the HTML before any script runs; the browser then hydrates it.
- Each page's `<head>` has its own title, description, canonical link, Open Graph and Twitter tags (images in `public/og/`) and JSON-LD structured data: Organization and WebSite on the home page, SoftwareApplication for RadiusOne, WebApplication for the tools pages, and breadcrumbs.
- The build writes `sitemap.xml` and `robots.txt` from the pages' canonical links. `/api/` is disallowed.
- Lighthouse (2026-10-22, on the test server): SEO 100 and accessibility 100 on every page, performance 94–99. Best practices is 79 only because the test server is plain HTTP; serve the site over HTTPS (and redirect HTTP to it) for 100.

## Screenshots

`public/shots/` holds real RadiusOne screens captured from the static demo (sample data), in light and dark. Each file names its source in its JPEG comment. Recapture them after a RadiusOne update changes the screens.

## Files

- `index.html`, `radiusone/`, `ticketone/`, `dnsone/`, `tools/network/`, `tools/email/`, `tools/bgp/`: one HTML file per page, so every address works on any static host.
- `src/pages/`: the home, RadiusOne, DNSOne and coming-soon pages; `src/shared/Layout.tsx`: header, footer, contact band and theme switch.
- `src/site.css`: tokens (same names and values as the portal's `resources/css/app.css`) and styles.
- `src/brand.tsx`: the family marks (one tile, gradient and teal "ping" dot; one letter per product) and wordmarks.
- `src/pages/Tools.tsx` and `src/lib/ipcalc.ts`: the tools page and the subnet maths.
- `api/index.php`: the tools API. `deploy/`: nginx and PHP-FPM configs.
- `src/config.ts`: demo URL and contact email.
