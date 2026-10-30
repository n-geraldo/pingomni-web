// What AI assistants and search engines read besides the pages (scripts/prerender.mjs writes it at build time):
// structured data per page (FAQs, products with their prices), /llms.txt (the site in brief, with links) and
// /llms-full.txt (every fact, price, FAQ and user guide in one plain-text file). All of it comes from the same data
// the pages show, so it never says something the site does not.
import { CONTACT_EMAIL, DNSONE_REPO_URL, MONITOR_URL, ACCOUNT_URL } from '../config';
import monitorGuide from '../docs/monitor.md?raw';
import radiusoneGuide from '../docs/radiusone.md?raw';
import dnsoneGuide from '../docs/dnsone.md?raw';
import versions from '../docs/versions.json';
import { FAQ as HOME_FAQ } from '../pages/Home';
import { FAQ as MONITOR_FAQ } from '../pages/Monitor';
import { TIERS as RADIUSONE_TIERS } from '../pages/RadiusOne';
import { TIERS as DNSONE_TIERS } from '../pages/DNSOne';
import { PLANS as MONITOR_PLANS } from '../shared/MonitorPlans';
import type { PriceTier } from '../shared/Editions';
import { TOOL_LIST, TOOL_PAGES, type ToolGroup } from './toolList';
import type { PageId } from '../shared/Layout';

type Product = 'monitor' | 'radiusone' | 'dnsone';
type Plan = { name: string; monthly: number; yearly: number; detail: string };

const PRODUCTS: Record<Product, { name: string; path: string; docs: string; pricing: string; summary: string; plans: Plan[] }> = {
    monitor: {
        name: 'PingOmni Monitor',
        path: 'monitor/',
        docs: 'docs/monitor/',
        pricing: 'monitor/#plans',
        summary:
            'Hosted uptime and performance monitoring (SaaS). It checks websites and HTTP APIs (status codes, keywords, JSON fields), ' +
            'SSL certificates, domain registrations, DNS records, hosts by ping, TCP ports, mail servers (SMTP with STARTTLS), ' +
            'WebSockets, databases (MySQL, PostgreSQL, Redis, MongoDB) and scheduled jobs (heartbeats) from outside the network. ' +
            'A failure is confirmed from other networks before anyone is alerted. Alerts go to email, Slack, Microsoft Teams, ' +
            'Google Chat, Discord, Telegram, PagerDuty or a signed webhook, with escalation when nobody acknowledges. Public status ' +
            'pages in 7 languages with email subscribers, a badge, an embeddable widget and a JSON summary; custom domains on Pro ' +
            'and Business. Maintenance windows, monthly SLA reports, team roles, a REST API and an MCP connector for AI assistants.',
        plans: MONITOR_PLANS.map((p) => ({ name: p.name, monthly: p.monthly, yearly: p.yearly, detail: p.limits.join(', ') })),
    },
    radiusone: {
        name: 'RadiusOne',
        path: 'radiusone/',
        docs: 'docs/radiusone/',
        pricing: 'radiusone/#editions',
        summary:
            'Self-hosted ISP back office and web portal for FreeRADIUS, on Ubuntu 24.04 LTS. PPPoE subscribers and service plans, ' +
            'static IPs and IP pools, suspension and expiry, data caps, recurring invoices, payments with PDF receipts, NAS routers ' +
            'with SNMP monitoring, disconnects over RADIUS CoA or the RouterOS API (MikroTik tested end to end), customer messages ' +
            'by email and SMS, admin alerts, reports and encrypted backups. Priced by active subscribers; free up to 150.',
        plans: tiers(RADIUSONE_TIERS),
    },
    dnsone: {
        name: 'DNSOne',
        path: 'dnsone/',
        docs: 'docs/dnsone/',
        pricing: 'dnsone/#editions',
        summary:
            'Self-hosted DNS for ISPs in one web console: authoritative zones on BIND with DNSSEC and zone transfers, a PowerDNS ' +
            'Recursor resolver for subscribers with ad-blocking, client groups and court-ordered blocking, a query log, dnsdist rate ' +
            'limits and attack protection, DNS over TLS and HTTPS, quotas for resellers and customers, a firewall, an API, dynamic ' +
            'DNS and certbot integration. Community edition free on one server; Pro adds replicas.',
        plans: tiers(DNSONE_TIERS),
    },
};

function tiers(list: PriceTier[]): Plan[] {
    return list.map((t) => ({
        name: t.name,
        monthly: t.monthly ?? 0,
        yearly: t.yearly ?? (t.monthly ?? 0) * 10,
        detail: [t.range, ...(t.points ?? [])].join(', '),
    }));
}

const euro = (n: number) => `€${n.toLocaleString('en')}`;
// A blurb inside a sentence: lower-case first letter, unless it starts an abbreviation (MTA-STS, DNS).
const inline = (text: string) => (/^[A-Z][A-Z]/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));

// ---------------------------------------------------------------------------------------------------------------
// Structured data (JSON-LD), added to a page's head next to what its HTML file already declares.

function faqPage(site: string, path: string, faq: { q: string; a: string }[]) {
    return {
        '@type': 'FAQPage',
        '@id': `${site}/${path}#faq`,
        mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    };
}

function offers(site: string, product: Product) {
    const p = PRODUCTS[product];
    return {
        '@type': 'SoftwareApplication',
        '@id': `${site}/${p.path}#software`,
        name: p.name,
        url: `${site}/${p.path}`,
        offers: p.plans.map((plan) => ({
            '@type': 'Offer',
            name: `${p.name} ${plan.name}`,
            description: plan.detail,
            price: String(plan.monthly),
            priceCurrency: 'EUR',
            ...(plan.monthly > 0
                ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: String(plan.monthly), priceCurrency: 'EUR', unitText: 'MONTH', billingDuration: 'P1M' } }
                : {}),
            url: `${site}/${p.pricing}`,
        })),
    };
}

/** The extra JSON-LD for a page, or null when it has none. */
export function structuredData(page: PageId, site: string): object | null {
    const graph: object[] = [];
    if (page === 'home') {
        graph.push(faqPage(site, '', HOME_FAQ));
        graph.push({
            '@type': 'Organization',
            '@id': `${site}/#organization`,
            sameAs: ['https://github.com/Pingomni'],
            knowsAbout: ['Website monitoring', 'Uptime monitoring', 'Status pages', 'FreeRADIUS', 'PPPoE', 'ISP billing', 'DNS', 'DNSSEC', 'BGP'],
        });
    }
    if (page === 'monitor') graph.push(faqPage(site, 'monitor/', MONITOR_FAQ), offers(site, 'monitor'));
    if (page === 'radiusone') graph.push(offers(site, 'radiusone'));
    if (page === 'dnsone') graph.push(offers(site, 'dnsone'));
    return graph.length ? { '@context': 'https://schema.org', '@graph': graph } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// /llms.txt and /llms-full.txt (llmstxt.org).

function pricing(product: Product): string {
    const p = PRODUCTS[product];
    return [
        '| Plan | Per month | Per year | Includes |',
        '|---|---|---|---|',
        ...p.plans.map((plan) => `| ${plan.name} | ${euro(plan.monthly)} | ${euro(plan.yearly)} | ${plan.detail} |`),
    ].join('\n');
}

function toolsList(site: string): string {
    return (Object.keys(TOOL_PAGES) as ToolGroup[])
        .map((g) => {
            const page = TOOL_PAGES[g];
            const tools = TOOL_LIST.filter((t) => t.group === g).map((t) => `${t.name} (${inline(t.blurb)})`);
            return `- [${page.title}](${site}/${page.path}): ${tools.join('; ')}.`;
        })
        .join('\n');
}

const intro = (site: string) => `# PingOmni

> PingOmni makes software for people who keep networks and websites running. PingOmni Monitor is a hosted uptime
> monitoring service with alerts and public status pages, free for 10 monitors. RadiusOne (an ISP back office on
> FreeRADIUS) and DNSOne (DNS for ISPs) are self-hosted on the customer's own Ubuntu servers. ${TOOL_LIST.length} free network,
> DNS, email and BGP tools run on the website without an account.

- Website: ${site}/
- Sign up and billing: PingOmni Account, ${ACCOUNT_URL} (one account for every product; licences and invoices)
- PingOmni Monitor app: ${MONITOR_URL}
- Contact: ${CONTACT_EMAIL} (answers usually within one working day)
- Prices are in euros, VAT added where it applies; a year costs ten months.`;

export function llmsTxt(site: string): string {
    const product = (k: Product) => `- [${PRODUCTS[k].name}](${site}/${PRODUCTS[k].path}): ${PRODUCTS[k].summary}`;
    return `${intro(site)}

## Products

${product('monitor')}
${product('radiusone')}
${product('dnsone')}

## Documentation

- [Documentation hub](${site}/docs/): all user guides, with search.
- [PingOmni Monitor user guide](${site}/docs/monitor/) (version ${versions.monitor}): every feature with an example, including the API and the MCP connector.
- [RadiusOne user guide](${site}/docs/radiusone/) (version ${versions.radiusone}): every page of the portal.
- [DNSOne user guide](${site}/docs/dnsone/) (version ${versions.dnsone}): every feature of the console.
- [MikroTik PPPoE with FreeRADIUS and RadiusOne](${site}/guides/mikrotik-pppoe-freeradius/): a how-to guide.
- [RPZ ad-blocking with PowerDNS and DNSOne](${site}/guides/rpz-ad-blocking-powerdns/): a how-to guide.

## Free tools

${toolsList(site)}

## Pricing

- PingOmni Monitor: ${PRODUCTS.monitor.plans.map((p) => `${p.name} ${euro(p.monthly)}${p.monthly ? '/month' : ''}`).join(', ')}. [Plans](${site}/${PRODUCTS.monitor.pricing})
- RadiusOne: ${PRODUCTS.radiusone.plans.map((p) => `${p.name} ${euro(p.monthly)}${p.monthly ? '/month' : ''}`).join(', ')}. [Plans](${site}/${PRODUCTS.radiusone.pricing})
- DNSOne: ${PRODUCTS.dnsone.plans.map((p) => `${p.name} ${euro(p.monthly)}${p.monthly ? '/month' : ''}`).join(', ')}. [Plans](${site}/${PRODUCTS.dnsone.pricing})

## Optional

- [Everything in one file](${site}/llms-full.txt): the facts, prices, FAQs and the full user guides as plain text.
- [Terms and Conditions](${site}/terms/)
- [Privacy Policy](${site}/privacy/)
- [DNSOne source and runbook](${DNSONE_REPO_URL})
`;
}

// The guides start with their own title and contents list: the title moves down a level, the list goes (the
// headings that follow say the same).
function guide(markdown: string): string {
    let fence = false;
    return markdown
        .replace(/^## Contents\n[\s\S]*?(?=\n---|\n## )/m, '')
        .split('\n')
        .map((line) => {
            if (line.startsWith('```')) fence = !fence;
            return !fence && /^#{1,5} /.test(line) ? `#${line}` : line;
        })
        .join('\n')
        .trim();
}

export function llmsFull(site: string): string {
    const faq = (list: { q: string; a: string }[]) => list.map((f) => `### ${f.q}\n\n${f.a}`).join('\n\n');
    const block = (k: Product) => `## ${PRODUCTS[k].name}

${PRODUCTS[k].summary}

Page: ${site}/${PRODUCTS[k].path} · Prices: ${site}/${PRODUCTS[k].pricing} · User guide: ${site}/${PRODUCTS[k].docs}

### Pricing

${pricing(k)}`;
    return `${intro(site)}

${block('monitor')}

${block('radiusone')}

${block('dnsone')}

## Free tools

${toolsList(site)}

## Questions and answers

${faq(HOME_FAQ)}

## PingOmni Monitor: questions and answers

${faq(MONITOR_FAQ)}

${guide(monitorGuide)}

${guide(radiusoneGuide)}

${guide(dnsoneGuide)}
`;
}
