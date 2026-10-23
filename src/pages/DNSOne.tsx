import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Mark, Wordmark } from '../brand';
import { DNSONE_REPO_URL, mailto } from '../config';
import Icon from '../Icon';
import { copyText } from '../lib/copy';
import { Contact } from '../shared/Layout';

const RUNBOOK_URL = `${DNSONE_REPO_URL}/blob/main/docs/RUNBOOK.md`;

const REQUIREMENTS: { term: string; text: string }[] = [
    { term: 'Operating system', text: 'Ubuntu 24.04 LTS, server or minimal' },
    { term: 'Size', text: 'One server for about 10,000 clients, tuned for up to 50,000' },
    { term: 'DNS software', text: 'BIND 9.18, PowerDNS Recursor 4.9, dnsdist 1.8 and MySQL 8, all from Ubuntu’s packages' },
    { term: 'Addresses', text: 'A public address for DNS on port 53, and a management network for SSH and the console' },
    { term: 'Access', text: 'Root, or a user with sudo rights' },
];

const CLONE = 'git clone https://github.com/n-geraldo/dnsone.git /opt/dnsone';

// The runbook's chapters (docs/RUNBOOK.md), in order. Every chapter ends with its own checks.
const RUNBOOK_STEPS = [
    'Choose the addresses and generate the secrets',
    'Packages, service user and the MySQL schema',
    'BIND, Recursor, dnsdist, systemd and the firewall',
    'The zone generator',
    'The backend API',
    'The ad-blocking pipeline',
    'The web console over HTTPS',
    'Backups, health checks, logs and upgrades',
];

// What `dnsone-status` prints on a healthy server: dnsone-ctl status's probes (backend/dnsone/health.py). Sample values.
const STATUS: [string, string][] = [
    ['MySQL', 'connected'],
    ['BIND (rndc)', 'number of zones: 214'],
    ['BIND (DNS)', 'NOERROR in 1 ms'],
    ['PowerDNS Recursor', 'recursor 4.9.3'],
    ['dnsdist', 'dnsdist 1.8.3'],
    ['Zone publishing', 'all zones published'],
    ['RPZ', 'serial 2026102406, 184212 triggers'],
    ['Disk (zones)', '82% free'],
];

// Situations DNSOne is built for, each tied to what the product really does. No customer names or numbers.
const USE_CASES: { id: string; icon: string; tab: string; title: string; scene: string; how: string[] }[] = [
    {
        id: 'resolver',
        icon: 'clients',
        tab: 'Customer resolver',
        title: 'The resolver every subscriber uses',
        scene: 'Thousands of customers send their DNS to one address, some of them from behind CGNAT. It has to be fast, and it must not become an open resolver.',
        how: [
            'dnsdist answers only your customer networks and drops the rest',
            'Each address gets its own rate limit, with a higher one for NAT and CGNAT addresses',
            'The Recursor resolves from the root, validates DNSSEC and caches up to two million records',
        ],
    },
    {
        id: 'hosted',
        icon: 'globe',
        tab: 'Hosted zones',
        title: 'Customer domains and reverse zones',
        scene: 'Business customers want their domains hosted, and the network needs PTR records for its address blocks.',
        how: [
            'Zones and records are edited in the console, cPanel-style: A, AAAA, CNAME, MX, TXT, NS, SRV, CAA and PTR',
            'Every record is checked before it is saved, with the same rules as named-checkzone',
            'Publishing raises the serial and reloads BIND; a zone that fails the check is never loaded',
        ],
    },
    {
        id: 'blocking',
        icon: 'ban',
        tab: 'Ad-free DNS',
        title: 'Blocking ads and malware for every customer',
        scene: 'The ISP wants to offer cleaner browsing without installing anything on customer devices.',
        how: [
            'Subscribe to public blocklists (hosts files, domain lists or Adblock rules); they refresh every six hours',
            'Block or allow single domains by hand; an allow rule works at once',
            'Look up any domain to see which list or rule blocks it',
        ],
    },
    {
        id: 'migrate',
        icon: 'swap',
        tab: 'Leaving hand-edited BIND',
        title: 'Moving off hand-edited zone files',
        scene: 'Every change means editing a zone file over SSH, remembering the serial, and hoping the reload works.',
        how: [
            'MySQL holds every zone; DNSOne writes the files, so nobody edits them by hand',
            'Each change is checked, renamed into place and reloaded, and rolled back if the reload fails',
            'The audit log shows who changed what, and when',
        ],
    },
];

// Small, static recreations of console screens. Sample data only.
type Tone = 'ok' | 'warn' | 'plain';

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
    return <span className={`mock-pill mock-pill-${tone}`}>{children}</span>;
}

const RECORDS: [string, string, string, string][] = [
    ['@', 'A', '203.0.113.10', '3600'],
    ['www', 'CNAME', 'example.net.', '3600'],
    ['@', 'MX', '10 mail.example.net.', '3600'],
    ['mail', 'A', '203.0.113.25', '3600'],
    ['@', 'TXT', '"v=spf1 mx -all"', '3600'],
];

function RecordsMock() {
    return (
        <div className="mock mock-table" aria-hidden="true">
            <div className="mock-search">
                <Icon name="globe" />
                <span className="mock-zone-name">example.net</span>
                <Pill tone="ok">Published</Pill>
                <span className="mock-faint mock-mono mock-hide-sm">serial 2026102403</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Value</th>
                        <th className="mock-hide-sm">TTL</th>
                    </tr>
                </thead>
                <tbody>
                    {RECORDS.map(([name, type, value, ttl], i) => (
                        <tr key={i}>
                            <td className="mock-mono">{name}</td>
                            <td>
                                <span className="mock-type">{type}</span>
                            </td>
                            <td className="mock-mono mock-cut">{value}</td>
                            <td className="mock-mono mock-faint mock-hide-sm">{ttl}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function PublishMock() {
    const steps = ['Zone file written', 'named-checkzone passed', 'Renamed into place', 'rndc reload'];
    return (
        <div className="mock mock-list" aria-hidden="true">
            {steps.map((s) => (
                <div className="mock-step" key={s}>
                    <span className="mock-check">
                        <Icon name="check" />
                    </span>
                    {s}
                </div>
            ))}
            <div className="mock-note">
                <Icon name="refresh" />
                Rolled back if the reload fails
            </div>
        </div>
    );
}

function BlocklistsMock() {
    const lists: [string, string, Tone, string][] = [
        ['StevenBlack hosts', '79,312', 'ok', 'Updated'],
        ['Malware domains', '61,048', 'ok', 'Updated'],
        ['Tracking (Adblock)', '43,852', 'warn', 'Kept'],
    ];
    return (
        <div className="mock mock-list" aria-hidden="true">
            {lists.map(([name, count, tone, state]) => (
                <div className="mock-line" key={name}>
                    <span className="mock-cut">{name}</span>
                    <span className="mock-amount mock-mono">{count}</span>
                    <Pill tone={tone}>{state}</Pill>
                </div>
            ))}
            <div className="mock-note">
                <Icon name="refresh" />
                Next refresh in 4 h
            </div>
        </div>
    );
}

function LimitsMock() {
    const rows: [string, string, number][] = [
        ['Per address', '200 q/s', 4],
        ['NAT and CGNAT', '5,000 q/s', 100],
        ['Floods', '60 s block', 0],
    ];
    return (
        <div className="mock mock-list" aria-hidden="true">
            {rows.map(([name, value, width]) => (
                <div className="mock-nas" key={name}>
                    <span className="mock-dot" />
                    <span className="mock-nas-name">{name}</span>
                    <span className="mock-mono mock-faint">{value}</span>
                    {width > 0 && (
                        <span className="mock-bar">
                            <span style={{ width: `${width}%` }} />
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

function HealthMock() {
    const rows: [string, string][] = [
        ['BIND', '1 ms'],
        ['Recursor', '4.9.3'],
        ['dnsdist', '1.8.3'],
        ['RPZ', '184,212'],
    ];
    return (
        <div className="mock mock-list" aria-hidden="true">
            {rows.map(([name, detail]) => (
                <div className="mock-line mock-health" key={name}>
                    <span>{name}</span>
                    <span className="mock-mono mock-faint">{detail}</span>
                    <Pill tone="ok">ok</Pill>
                </div>
            ))}
        </div>
    );
}

function SafetyMock() {
    const audit: [string, string, string][] = [
        ['admin', 'record.updated', 'mail.example.net A'],
        ['noc-ana', 'rule.created', 'block ads.example'],
        ['admin', 'zone.published', 'example.net'],
    ];
    return (
        <div className="mock mock-safety" aria-hidden="true">
            <div className="mock-roles">
                {['admin', 'operator', 'viewer'].map((r) => (
                    <span key={r}>{r}</span>
                ))}
            </div>
            <div className="mock mock-list mock-audit">
                {audit.map(([who, action, item]) => (
                    <div className="mock-line" key={action}>
                        <span className="mock-mono">{who}</span>
                        <span className="mock-type">{action}</span>
                        <span className="mock-faint mock-cut">{item}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

const MODULES: { area: string; icon: string; title: string; items: string[]; mock: ReactNode; wide?: boolean; full?: boolean }[] = [
    {
        area: 'zones',
        icon: 'globe',
        title: 'Zones and records',
        items: ['Authoritative zones on BIND, edited cPanel-style', 'A, AAAA, CNAME, MX, TXT, NS, SRV, CAA and PTR', 'Every record checked before it is saved'],
        mock: <RecordsMock />,
        wide: true,
    },
    {
        area: 'publish',
        icon: 'refresh',
        title: 'Safe publishing',
        items: ['Zone files generated from MySQL', 'Checked, then swapped in atomically', 'Rolled back if BIND rejects them'],
        mock: <PublishMock />,
    },
    {
        area: 'blocking',
        icon: 'ban',
        title: 'Ad-blocking',
        items: ['Blocklists turned into an RPZ for the Recursor', 'Block and allow rules, with a domain lookup', 'Reloaded without a restart or lost queries'],
        mock: <BlocklistsMock />,
    },
    {
        area: 'limits',
        icon: 'gauge',
        title: 'Resolver protection',
        items: ['Only your customer networks may recurse', 'Rate limits per address, higher for NAT', 'Floods get a dynamic block'],
        mock: <LimitsMock />,
    },
    {
        area: 'health',
        icon: 'activity',
        title: 'Health and statistics',
        items: ['Queries and blocked queries per hour', 'Live checks of every DNS service', 'An /api/health address for your monitoring'],
        mock: <HealthMock />,
    },
    {
        area: 'safety',
        icon: 'shield',
        title: 'Safety',
        items: ['Admin, operator and viewer roles', 'An audit log of every change', 'Daily verified backups of the database and every config, kept for 14 days'],
        mock: <SafetyMock />,
        full: true,
    },
];

function Modules() {
    return (
        <section className="section section-surface" aria-labelledby="features-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="features-title" className="h2">
                        Every DNS job, in one console.
                    </h2>
                    <p className="lead">Hosted zones, the customer resolver and ad-blocking, run by the same team from the same screen.</p>
                </div>
                <div className="modules">
                    {MODULES.map((m) => (
                        <article className={m.full ? 'module module-full' : m.wide ? 'module module-wide' : 'module'} key={m.area} aria-labelledby={`module-${m.area}`}>
                            <div className="module-stage">{m.mock}</div>
                            <div className="module-text">
                                <h3 className="module-title" id={`module-${m.area}`}>
                                    <Icon name={m.icon} />
                                    {m.title}
                                </h3>
                                <ul>
                                    {m.items.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

function UseCases() {
    const [active, setActive] = useState(USE_CASES[0].id);
    const current = USE_CASES.find((c) => c.id === active) ?? USE_CASES[0];
    const onKey = (e: KeyboardEvent, i: number) => {
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = USE_CASES[(i + step + USE_CASES.length) % USE_CASES.length];
        setActive(next.id);
        document.getElementById(`case-tab-${next.id}`)?.focus();
    };
    return (
        <section className="section section-surface" id="use-cases" aria-labelledby="use-cases-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="use-cases-title" className="h2">
                        Where DNSOne fits.
                    </h2>
                    <p className="lead">Four everyday DNS jobs in an ISP, and what DNSOne does in each.</p>
                </div>
                <div className="cases">
                    <div className="cases-tabs" role="tablist" aria-label="Situations">
                        {USE_CASES.map((c, i) => (
                            <button
                                key={c.id}
                                type="button"
                                role="tab"
                                id={`case-tab-${c.id}`}
                                aria-selected={c.id === active}
                                aria-controls="case-panel"
                                tabIndex={c.id === active ? 0 : -1}
                                className="cases-tab"
                                onClick={() => setActive(c.id)}
                                onKeyDown={(e) => onKey(e, i)}
                            >
                                <span className="cases-tab-icon">
                                    <Icon name={c.icon} />
                                </span>
                                {c.tab}
                            </button>
                        ))}
                    </div>
                    <div className="case" role="tabpanel" id="case-panel" aria-labelledby={`case-tab-${current.id}`} key={current.id}>
                        <div className="case-scene">
                            <h3 className="h3">{current.title}</h3>
                            <p>{current.scene}</p>
                        </div>
                        <ul className="case-how">
                            {current.how.map((line) => (
                                <li key={line}>
                                    <span className="case-check">
                                        <Icon name="check" />
                                    </span>
                                    {line}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    );
}

function CopyCommand() {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        if (await copyText(CLONE)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        }
    };
    return (
        <div className="command">
            <code>
                <span className="command-prompt" aria-hidden="true">
                    $
                </span>{' '}
                {CLONE}
            </code>
            <button type="button" className="icon-btn" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the clone command'}>
                <Icon name={copied ? 'check' : 'copy'} />
            </button>
            <span className="sr-only" role="status">
                {copied ? 'Copied to clipboard' : ''}
            </span>
        </div>
    );
}

// What dnsone-status prints at the end of the runbook: every probe ok.
function Terminal() {
    const width = Math.max(...STATUS.map(([name]) => name.length));
    return (
        <figure className="terminal">
            <div className="terminal-bar" aria-hidden="true">
                <span />
                <span />
                <span />
                <span className="terminal-title">root@dns1: ~</span>
            </div>
            <pre className="terminal-body" aria-label="What dnsone-status prints on a healthy server">
                <span className="t-cmd">
                    <span className="t-faint"># </span>
                    dnsone-status
                </span>
                {STATUS.map(([name, detail]) => (
                    <span key={name}>
                        <span className="t-done-inline">OK </span> {name.padEnd(width)}  <span className="t-faint">{detail}</span>
                    </span>
                ))}
                <span className="t-done">overall: ok</span>
            </pre>
        </figure>
    );
}

const PATH: { kind: string; name: string; note?: string; icon: string }[] = [
    { kind: 'Customer device', name: 'Any DNS query', icon: 'home' },
    { kind: 'Port 53', name: 'dnsdist', note: 'Client ACL and rate limits', icon: 'shield' },
    { kind: 'Resolver', name: 'PowerDNS Recursor', note: 'Cache, DNSSEC and ad-blocking', icon: 'refresh' },
    { kind: 'Authoritative', name: 'BIND', note: 'Your hosted zones', icon: 'server' },
];

// The path a customer's query takes, and where DNSOne sits beside it. One query travels the chain on a loop.
function NetworkPath() {
    return (
        <section className="section section-bg" aria-labelledby="path-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="path-title" className="h2">
                        Where it sits in your network.
                    </h2>
                    <p className="lead">
                        Queries go through standard DNS software you already trust. DNSOne writes its configuration and never answers a query
                        itself, so DNS keeps working while the console is down for maintenance.
                    </p>
                </div>
                <div className="path">
                    <ol className="path-chain" aria-label="A customer's DNS query, from the device to the authoritative zones">
                        {PATH.map((n, i) => (
                            <li className="path-node" key={n.kind} style={{ '--i': i } as CSSProperties}>
                                <span className="path-icon">
                                    <Icon name={n.icon} />
                                </span>
                                <span className="path-kind">{n.kind}</span>
                                <strong>{n.name}</strong>
                                {n.note && <span className="small faint">{n.note}</span>}
                            </li>
                        ))}
                    </ol>
                    <div className="path-branch">
                        <div className="path-node path-node-product">
                            <span className="path-icon path-icon-product">
                                <Mark brand="dnsone" size={28} />
                            </span>
                            <span className="path-kind">Beside the query path</span>
                            <strong>
                                <Wordmark brand="dnsone" />
                            </strong>
                            <span className="small faint">Keeps everything in MySQL, writes the zone files and the RPZ, and reloads BIND and the Recursor.</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

// The hero: the console's zone editor, with the dashboard's query chart floating over its corner. Sample data.
const HOURS = [38, 34, 30, 27, 25, 26, 31, 42, 58, 66, 70, 72, 74, 71, 69, 72, 77, 84, 92, 98, 100, 94, 76, 52];
const NAV = [
    ['grid', 'Dashboard'],
    ['globe', 'Zones'],
    ['ban', 'Ad-blocking'],
    ['eye', 'Audit log'],
    ['tools', 'Settings'],
] as const;

function ConsoleMock() {
    return (
        <div className="console-mock" aria-hidden="true">
            <aside className="console-side">
                <span className="console-brand">
                    <Mark brand="dnsone" size={22} />
                    <Wordmark brand="dnsone" />
                </span>
                {NAV.map(([icon, label]) => (
                    <span className={label === 'Zones' ? 'console-nav is-active' : 'console-nav'} key={label}>
                        <Icon name={icon} />
                        {label}
                    </span>
                ))}
            </aside>
            <div className="console-main">
                <div className="console-top">
                    <span className="console-crumb">Zones /</span>
                    <strong>example.net</strong>
                    <span className="mock-btn mock-btn-primary">Publish</span>
                </div>
                <div className="console-figures">
                    {[
                        ['Records', '18'],
                        ['Serial', '2026102403'],
                        ['State', 'Published'],
                    ].map(([label, value]) => (
                        <span key={label}>
                            <span className="mock-faint">{label}</span>
                            <strong className={label === 'State' ? 'console-ok' : undefined}>{value}</strong>
                        </span>
                    ))}
                </div>
                <table className="console-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Value</th>
                            <th>TTL</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[...RECORDS, ['_sip._tcp', 'SRV', '10 60 5060 sip.example.net.', '3600'], ['@', 'CAA', '0 issue "letsencrypt.org"', '86400']].map(([name, type, value, ttl], i) => (
                            <tr key={i}>
                                <td className="mock-mono">{name}</td>
                                <td>
                                    <span className="mock-type">{type}</span>
                                </td>
                                <td className="mock-mono">{value}</td>
                                <td className="mock-mono mock-faint">{ttl}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function QueriesMock() {
    return (
        <div className="queries-mock" aria-hidden="true">
            <span className="queries-title">Queries, last 24 hours</span>
            <div className="queries-bars">
                {HOURS.map((h, i) => (
                    <span key={i} style={{ height: `${h}%` }}>
                        <span style={{ height: `${Math.round(h * 0.16)}%` }} />
                    </span>
                ))}
            </div>
            <span className="queries-legend">
                <i />
                Answered
                <i className="blocked" />
                Blocked
            </span>
        </div>
    );
}

export default function DNSOne() {
    return (
        <>
            <section className="stage product-hero" aria-labelledby="hero-title">
                <div className="container product-hero-row">
                    <div className="product-hero-text">
                        <div className="tile-head">
                            <Mark brand="dnsone" size={52} className="ping-on-load" />
                            <span className="product-name">
                                <Wordmark brand="dnsone" />
                            </span>
                        </div>
                        <h1 id="hero-title" className="display">
                            DNS for ISPs, on your own server.
                        </h1>
                        <p className="lead">
                            Hosted zones, the customer resolver and ad-blocking in one console, on BIND, PowerDNS Recursor and dnsdist.
                        </p>
                        <div className="actions">
                            <a className="btn btn-primary btn-lg" href={DNSONE_REPO_URL} target="_blank" rel="noopener">
                                <Icon name="code" />
                                Get the code
                            </a>
                            <a className="btn btn-lg btn-ghost" href={RUNBOOK_URL} target="_blank" rel="noopener">
                                Read the runbook
                                <Icon name="external" />
                            </a>
                            <a className="btn btn-lg btn-ghost" href={mailto('DNSOne')}>
                                Email us
                            </a>
                        </div>
                    </div>
                    <figure className="product-hero-shot product-hero-console">
                        <ConsoleMock />
                        <div className="hero-float hero-float-queries">
                            <QueriesMock />
                        </div>
                    </figure>
                </div>
            </section>

            <Modules />

            <NetworkPath />

            <UseCases />

            <section className="section section-bg" id="install" aria-labelledby="install-title">
                <div className="container install-layout">
                    <div className="install">
                        <h2 id="install-title" className="h2">
                            A runbook you can paste, step by step.
                        </h2>
                        <p className="lead">
                            Every step comes with its commands and the checks that prove it worked, from a fresh server to a console behind
                            HTTPS.
                        </p>
                        <p className="small muted">
                            Get the code from the{' '}
                            <a href={DNSONE_REPO_URL} target="_blank" rel="noopener">
                                DNSOne repository on GitHub
                            </a>
                            , then follow{' '}
                            <a href={RUNBOOK_URL} target="_blank" rel="noopener">
                                docs/RUNBOOK.md
                            </a>
                            :
                        </p>
                        <CopyCommand />
                        <ol className="runbook-steps">
                            {RUNBOOK_STEPS.map((s) => (
                                <li key={s}>{s}</li>
                            ))}
                        </ol>
                        <dl className="rows rows-compact">
                            {REQUIREMENTS.map((r) => (
                                <div className="row" key={r.term}>
                                    <dt>{r.term}</dt>
                                    <dd>{r.text}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                    <Terminal />
                </div>
            </section>

            <Contact title="Running DNS for an ISP?" text="Tell us about your network, and we will help you plan a DNSOne server for it." />
        </>
    );
}
