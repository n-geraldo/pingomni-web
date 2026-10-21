# PingOmni website

The company site for PingOmni, the home of RadiusOne and the "One" product family (TicketOne and DNSOne are coming). It's a static Vite + React build with no server code. It uses the RadiusOne portal's design tokens, system font and logo language.

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

## Screenshots

`public/shots/` holds real RadiusOne screens captured from the static demo (sample data), in light and dark. Each file names its source in its JPEG comment. Recapture them after a RadiusOne update changes the screens.

## Files

- `index.html`, `radiusone/`, `ticketone/`, `dnsone/`: one HTML file per page, so every address works on any static host.
- `src/pages/`: the home, RadiusOne and coming-soon pages; `src/shared/Layout.tsx`: header, footer, contact band and theme switch.
- `src/site.css`: tokens (same names and values as the portal's `resources/css/app.css`) and styles.
- `src/brand.tsx`: the family marks (one tile, gradient and teal "ping" dot; one letter per product) and wordmarks.
- `src/config.ts`: demo URL and contact email.
