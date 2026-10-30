import { useMemo, useState, type ReactNode } from 'react';
import { Mark, Wordmark } from '../brand';
import { DEMO_URL, DNSONE_DEMO_URL, MONITOR_URL, REPO_URL } from '../config';
import radiusoneGuide from '../docs/radiusone.md?raw';
import dnsoneGuide from '../docs/dnsone.md?raw';
import monitorGuide from '../docs/monitor.md?raw';
import versions from '../docs/versions.json';
import Icon from '../Icon';
import Guide, { slug, splitGuide } from '../shared/guide';
import { HOWTOS, type GuideId } from './Guides';
import { Contact, useSite } from '../shared/Layout';

// The product guides: the same docs/USER-GUIDE.md each console shows under Documentation (RadiusOne) and
// Help (DNSOne), and PingOmni Monitor's docs/USER-GUIDE.md, copied by scripts/sync-docs.sh and drawn by the same
// guide component, so they read alike.
type Product = 'radiusone' | 'dnsone' | 'monitor';

const GUIDES: Record<
    Product,
    {
        name: string;
        markdown: string;
        version: string;
        job: string;
        lead: string;
        demo: string;
        demoLabel?: string;
        docsBase: string;
        links: { label: string; href: string }[];
        placeholder: string;
        icons: Record<string, string>;
    }
> = {
    radiusone: {
        name: 'RadiusOne',
        markdown: radiusoneGuide,
        version: versions.radiusone,
        job: 'The ISP back office on FreeRADIUS',
        lead: 'Every page of the portal for the operators who run it: clients and plans, NAS devices and CoA, monitoring, billing, messages, alerts and backups.',
        demo: DEMO_URL,
        docsBase: `${REPO_URL}/blob/main/docs/`,
        links: [
            { label: 'Installation guide', href: `${REPO_URL}/blob/main/INSTALL.md` },
            { label: 'Changelog', href: `${REPO_URL}/blob/main/CHANGELOG.md` },
        ],
        placeholder: 'e.g. CoA, backups, Telegram',
        icons: {
            'getting-started': 'book',
            dashboard: 'dashboard',
            clients: 'clients',
            'services-and-ip-pools': 'services',
            'nas-devices': 'server',
            monitoring: 'activity',
            'network-operations': 'signal',
            billing: 'billing',
            'reports-and-logs': 'reports',
            'your-profile': 'user',
            'settings-operators': 'lock',
            'settings-email-and-sms-gateways': 'mail',
            'settings-customer-messages': 'message',
            'settings-admin-alerts-and-daily-report': 'shield',
            'settings-branding': 'image',
            'settings-backups': 'refresh',
            'settings-data-retention': 'logs',
            'server-operations': 'settings',
            troubleshooting: 'search',
        },
    },
    dnsone: {
        name: 'DNSOne',
        markdown: dnsoneGuide,
        version: versions.dnsone,
        job: 'DNS for ISPs: zones, resolver and ad-blocking',
        lead: 'Everything the console does, for operators, administrators, resellers and customers: zones and DNSSEC, the resolver, ad-blocking, attack protection, quotas and the firewall.',
        demo: DNSONE_DEMO_URL,
        docsBase: 'https://github.com/Pingomni/dnsone/blob/main/docs/',
        links: [
            { label: 'Installation runbook', href: 'https://github.com/Pingomni/dnsone/blob/main/docs/RUNBOOK.md' },
            { label: 'Release notes', href: 'https://github.com/Pingomni/dnsone/tree/main/docs/releases' },
        ],
        placeholder: 'e.g. DNSSEC, quota, firewall',
        icons: {
            'what-dnsone-does': 'book',
            'signing-in-and-your-account': 'user',
            'who-can-do-what': 'lock',
            dashboard: 'dashboard',
            'zones-authoritative-dns': 'server',
            'the-resolver-for-your-customers': 'signal',
            'ad-blocking-and-client-groups': 'shield',
            'court-ordered-blocking-pro': 'logs',
            'query-log': 'search',
            'protection-attacks-pro': 'activity',
            'customers-resellers-and-quotas-pro': 'clients',
            settings: 'settings',
            'audit-log': 'reports',
            'automation-api-dynamic-dns-certbot': 'refresh',
            'good-to-know': 'message',
        },
    },
    monitor: {
        name: 'PingOmni Monitor',
        markdown: monitorGuide,
        version: versions.monitor,
        job: 'Uptime, status pages and alerts, hosted',
        lead: 'Every feature with an example: the eleven kinds of check, incidents, alerts and escalation, status pages with their badge and widget, maintenance, reports, the API and AI assistants.',
        demo: MONITOR_URL,
        demoLabel: 'Start free',
        docsBase: 'https://github.com/Pingomni/monitoring/blob/main/docs/',
        links: [],
        placeholder: 'e.g. heartbeat, webhook, widget',
        icons: {
            'what-pingomni-monitor-does': 'book',
            'getting-started': 'arrow',
            'plans-and-limits': 'billing',
            'who-can-do-what': 'lock',
            overview: 'dashboard',
            'monitors-the-settings-every-check-has': 'settings',
            'check-types-with-examples': 'activity',
            'when-a-monitor-is-called-down': 'shield',
            'working-with-many-monitors': 'grid',
            incidents: 'logs',
            alerts: 'message',
            'status-pages': 'globe',
            maintenance: 'tools',
            reports: 'reports',
            team: 'clients',
            settings: 'settings',
            'the-api': 'code',
            'ai-assistants-mcp': 'plug',
            'good-to-know': 'search',
        },
    },
};

const PRODUCTS: Product[] = ['monitor', 'radiusone', 'dnsone'];
const plain = (title: string) => title.replace(/^\d+\.\s*/, '');

// Links to the consoles' own pages ("/clients") mean nothing on this site: the page name is shown instead.
const appLink = (_href: string, children: ReactNode, key: string) => <strong key={key}>{children}</strong>;

/** /docs/: the guides, their chapters, and one search over everything in them. */
export function DocsHub() {
    const { root } = useSite();
    const [q, setQ] = useState('');
    const parsed = useMemo(() => PRODUCTS.map((p) => ({ p, sections: splitGuide(GUIDES[p].markdown).sections })), []);
    const term = q.trim().toLowerCase();
    // Matches by subsection when one mentions the term, so a hit links straight to the right heading.
    const hits = useMemo(() => {
        if (term.length < 2) return [];
        const out: { p: Product; href: string; title: string; where: string }[] = [];
        for (const { p, sections } of parsed) {
            for (const s of sections) {
                let heading = '';
                let lines: string[] = [s.title];
                const flush = () => {
                    if (`${heading}\n${lines.join('\n')}`.toLowerCase().includes(term)) {
                        out.push({ p, href: `${root}docs/${p}/#${heading ? slug(heading) : s.id}`, title: heading || plain(s.title), where: heading ? plain(s.title) : '' });
                    }
                };
                for (const line of s.body) {
                    if (line.startsWith('### ')) {
                        flush();
                        heading = line.slice(4).trim();
                        lines = [];
                    } else lines.push(line);
                }
                flush();
            }
        }
        return out;
    }, [term, parsed, root]);

    return (
        <>
            <section className="stage docs-hero" aria-labelledby="hero-title">
                <div className="container docs-hero-inner">
                    <p className="docs-crumbs">
                        <a href={root}>PingOmni</a>
                        <span aria-hidden="true">/</span>
                        <span>Docs</span>
                    </p>
                    <h1 id="hero-title" className="display">
                        Documentation
                    </h1>
                    <p className="lead">The user guides of PingOmni Monitor, RadiusOne and DNSOne. RadiusOne and DNSOne carry the same guide inside, for the version they run.</p>
                    <label className="docs-hub-search">
                        <Icon name="search" />
                        <span className="sr-only">Search the guides</span>
                        <input type="search" placeholder="Search the guides, e.g. heartbeat, DNSSEC, backups" value={q} onChange={(e) => setQ(e.target.value)} />
                    </label>
                </div>
            </section>

            <section className="section section-bg docs-hub">
                <div className="container">
                    {term.length >= 2 ? (
                        <div className="docs-hits" role="status">
                            <p className="docs-hits-count">{hits.length ? `${hits.length} ${hits.length === 1 ? 'place mentions' : 'places mention'} “${q.trim()}”` : `Nothing in the guides mentions “${q.trim()}”.`}</p>
                            <ul>
                                {hits.slice(0, 40).map((h) => (
                                    <li key={h.href}>
                                        <a href={h.href}>
                                            <Mark brand={h.p} size={22} />
                                            <span>
                                                <strong>{h.title}</strong>
                                                <span>{GUIDES[h.p].name}{h.where ? ` · ${h.where}` : ''}</span>
                                            </span>
                                            <Icon name="arrow" />
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div className="docs-cards">
                            {parsed.map(({ p, sections }) => {
                                const g = GUIDES[p];
                                return (
                                    <article className="docs-card" key={p} aria-labelledby={`${p}-guide`}>
                                        <header className="docs-card-head">
                                            <Mark brand={p} size={40} />
                                            <div>
                                                <h2 id={`${p}-guide`} className="h3">
                                                    <Wordmark brand={p} /> user guide
                                                </h2>
                                                <p>{g.job} · version {g.version}</p>
                                            </div>
                                        </header>
                                        <p className="docs-card-lead">{g.lead}</p>
                                        <ol className="docs-card-chapters">
                                            {sections.map((s) => (
                                                <li key={s.id}>
                                                    <a href={`${root}docs/${p}/#${s.id}`}>
                                                        <Icon name={g.icons[slug(plain(s.title))] ?? 'book'} />
                                                        {plain(s.title)}
                                                    </a>
                                                </li>
                                            ))}
                                        </ol>
                                        <div className="docs-card-actions">
                                            <a className="btn btn-primary" href={`${root}docs/${p}/`}>
                                                Read the guide
                                                <Icon name="arrow" />
                                            </a>
                                            {g.links.map((l) => (
                                                <a className="btn btn-ghost" key={l.href} href={l.href} target="_blank" rel="noopener">
                                                    {l.label}
                                                    <Icon name="external" />
                                                </a>
                                            ))}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                    <div className="docs-howtos" id="guides">
                        <h2 className="h3">How-to guides</h2>
                        <ul>
                            {(Object.keys(HOWTOS) as GuideId[]).map((id) => (
                                <li key={id}>
                                    <a href={`${root}guides/${id}/`}>
                                        <span className="release-more-icon">
                                            <Icon name="book" />
                                        </span>
                                        <span>
                                            <strong>{HOWTOS[id].title}</strong>
                                            <span>{HOWTOS[id].lead}</span>
                                        </span>
                                        <Icon name="arrow" />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>
            <Contact
                start
                title="A question the guides do not answer?"
                text="Email us: we answer within one working day. Or start PingOmni Monitor free and try it as you read."
            />
        </>
    );
}

/** /docs/radiusone/, /docs/dnsone/ and /docs/monitor/: one guide, laid out like the console's own guide page. */
export function DocsGuide({ product }: { product: Product }) {
    const { root } = useSite();
    const g = GUIDES[product];
    return (
        <>
            <section className="stage docs-hero docs-hero-guide" aria-labelledby="hero-title">
                <div className="container docs-hero-inner">
                    <p className="docs-crumbs">
                        <a href={root}>PingOmni</a>
                        <span aria-hidden="true">/</span>
                        <a href={`${root}docs/`}>Docs</a>
                        <span aria-hidden="true">/</span>
                        <span>{g.name}</span>
                    </p>
                    <div className="docs-hero-title">
                        <Mark brand={product} size={44} />
                        <h1 id="hero-title" className="display">
                            {g.name} documentation
                        </h1>
                    </div>
                    <p className="lead">{g.lead}</p>
                    <div className="actions">
                        <a className="btn btn-primary" href={g.demo} target="_blank" rel="noopener">
                            {g.demoLabel ?? 'Try the demo'}
                        </a>
                        <a className="btn btn-ghost" href={`${root}${product}/`}>
                            About {g.name}
                        </a>
                        {g.links.map((l) => (
                            <a className="btn btn-ghost" key={l.href} href={l.href} target="_blank" rel="noopener">
                                {l.label}
                                <Icon name="external" />
                            </a>
                        ))}
                    </div>
                </div>
            </section>
            <section className="docs-page">
                <div className="container">
                    <Guide
                        markdown={g.markdown}
                        title={`${g.name} user guide`}
                        product={g.name}
                        version={g.version}
                        icons={g.icons}
                        docsBase={g.docsBase}
                        appLink={appLink}
                        searchPlaceholder={g.placeholder}
                        topSelector=".site-header"
                    />
                </div>
            </section>
            {product === 'monitor' ? (
                <Contact start title="Try it as you read." text="PingOmni Monitor is free for 10 monitors, with no card. Questions the guide does not answer? Email us: we answer within one working day." />
            ) : (
                <Contact
                    demo
                    demoUrl={g.demo}
                    demoLabel={`Try the ${g.name} demo`}
                    title="Try it as you read."
                    text={`The ${g.name} demo runs the real software on sample data. Questions the guide does not answer? Email us: we answer within one working day.`}
                />
            )}
        </>
    );
}
