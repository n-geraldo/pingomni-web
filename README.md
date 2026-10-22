# PingOmni website

The company site for PingOmni, the home of RadiusOne and the "One" product family (TicketOne and DNSOne are coming). It's a static Vite + React build, plus a small PHP API for the network tools page. It uses the RadiusOne portal's design tokens, system font and logo language.

## Develop and build

```bash
npm ci
npm run dev          # http://localhost:5173
npm run build        # type-check, then build into dist/
```

Upload `dist/` to any web server. Asset paths are relative, so it works from a domain root or a sub-folder.

## Settings

Set these at build time (for example in `.env.production`):

| Variable | Default | Used for |
|---|---|---|
| `VITE_DEMO_URL` | `http://10.4.100.101:8090/` | "Try the demo" buttons (the static RadiusOne demo) |
| `VITE_CONTACT_EMAIL` | `hello@pingomni.com` | Contact and "Tell me when it's ready" links |

## Network tools

Two pages, both in the navbar's Tools menu. `/tools/network/`: ping, traceroute, MTR, port check, reverse lookup, proxy checker, bandwidth meter, network calculator and mask calculator. `/tools/email/`: DNS lookup, MX, NS, SPF, DMARC, DKIM, SMTP, WHOIS and blacklist checks. Each tool has its own address (`/tools/email/#mx`), and old `/tools/#...` links forward to the right page. The tool names live in `src/lib/toolList.ts`.

The calculators run in the browser. Everything else calls `api/index.php` (`/api/?tool=<name>`). The API needs PHP 8.3 with curl and openssl, plus `ping` and `mtr` on the server. WHOIS uses the public RDAP service (rdap.org).

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

## Screenshots

`public/shots/` holds real RadiusOne screens captured from the static demo (sample data), in light and dark. Each file names its source in its JPEG comment. Recapture them after a RadiusOne update changes the screens.

## Files

- `index.html`, `radiusone/`, `ticketone/`, `dnsone/`, `tools/network/`, `tools/email/`: one HTML file per page, so every address works on any static host.
- `src/pages/`: the home, RadiusOne and coming-soon pages; `src/shared/Layout.tsx`: header, footer, contact band and theme switch.
- `src/site.css`: tokens (same names and values as the portal's `resources/css/app.css`) and styles.
- `src/brand.tsx`: the family marks (one tile, gradient and teal "ping" dot; one letter per product) and wordmarks.
- `src/pages/Tools.tsx` and `src/lib/ipcalc.ts`: the tools page and the subnet maths.
- `api/index.php`: the tools API. `deploy/`: nginx and PHP-FPM configs.
- `src/config.ts`: demo URL and contact email.
