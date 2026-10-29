import { useEffect, useState, type FormEvent } from 'react';
import { Mark, Wordmark, type Brand } from '../brand';
import { ACCOUNT_URL, buyUrl, DEMO_URL, DNSONE_DEMO_URL } from '../config';
import Icon from '../Icon';
import { api } from '../lib/api';
import { TOOL_LIST, TOOL_PAGES, type ToolGroup } from '../lib/toolList';
import { Contact, Shot, useSite } from '../shared/Layout';
import { TOOL_PREVIEW } from '../shared/ToolPreviews';

// The product line, one row under the headline: each one a tap away, with its status in a word.
const LINEUP: { brand: Brand; job: string; href: string; status: 'available' | 'new' | 'soon' }[] = [
    { brand: 'monitor', job: 'Uptime, SSL and domains for any website', href: '#monitor', status: 'new' },
    { brand: 'radiusone', job: 'The ISP back office on FreeRADIUS', href: '#radiusone', status: 'available' },
    { brand: 'dnsone', job: 'DNS for ISPs, on your own server', href: '#dnsone', status: 'available' },
];

const STATUS = { available: ['badge-success', 'Available'], new: ['badge-success', 'New'], soon: ['badge-warning', 'Coming soon'] } as const;

function Lineup() {
    const { root } = useSite();
    return (
        <nav className="lineup" id="products" aria-label="Products">
            {LINEUP.map((p) => (
                <a key={p.brand} className="lineup-item" href={p.href.startsWith('#') ? p.href : `${root}${p.href}`}>
                    <Mark brand={p.brand} size={44} className="ping-on-load" />
                    <span className="lineup-text">
                        <Wordmark brand={p.brand} />
                        <span className="lineup-job">{p.job}</span>
                    </span>
                    <span className={`badge ${STATUS[p.status][0]}`}>{STATUS[p.status][1]}</span>
                </a>
            ))}
        </nav>
    );
}

// PingOmni Monitor's plans, as PingOmni Account sells them (EUR, VAT added where it applies; a year is ten months' price).
const PLANS: { name: string; monthly: number; yearly: number; limits: string[]; note?: string }[] = [
    { name: 'Free', monthly: 0, yearly: 0, limits: ['10 monitors', 'Checks every 5 minutes', '1 status page', '1 person', '7 days of history'], note: 'Ready at once' },
    { name: 'Starter', monthly: 6, yearly: 60, limits: ['25 monitors', 'Checks every minute', '2 status pages', '3 people', '30 days of history'] },
    { name: 'Pro', monthly: 19, yearly: 190, limits: ['100 monitors', 'Checks every 30 seconds', '10 status pages', '10 people', '90 days of history'] },
    { name: 'Business', monthly: 45, yearly: 450, limits: ['500 monitors', 'Checks every 30 seconds', '50 status pages', '50 people', '180 days of history'] },
];

const MONITOR_FEATURES: { icon: string; title: string; text: string }[] = [
    { icon: 'globe', title: 'Every kind of check', text: 'Websites and APIs, keywords, SSL certificates, domain registrations, DNS records, ping, TCP ports and cron-job heartbeats.' },
    { icon: 'message', title: 'Alerts that mean it', text: 'Email, Slack, Telegram or a webhook, after a second check confirms the failure, and again when it recovers.' },
    { icon: 'eye', title: 'Status pages', text: 'A public page with your services, 90 days of uptime and recent incidents, for your customers.' },
    { icon: 'clients', title: 'A team, with roles', text: 'Owners, admins, members and viewers in a company workspace; sign in with your PingOmni Account.' },
];

function MonitorShowcase() {
    return (
        <section className="section section-surface showcase" id="monitor" aria-labelledby="monitor-title">
            <div className="container">
                <div className="showcase-head">
                    <Mark brand="monitor" size={56} className="ping-on-load" />
                    <p className="showcase-name">
                        <Wordmark brand="monitor" /> <span className="badge badge-success">New</span>
                    </p>
                    <h2 id="monitor-title" className="h1">
                        Know the moment a site goes down.
                    </h2>
                    <p className="lead">
                        PingOmni Monitor checks your websites, certificates, domains and servers from the outside, around the clock, and tells you
                        before your customers do. For any website, not only ISPs.
                    </p>
                    <div className="actions actions-center">
                        <a className="btn btn-primary btn-lg" href={buyUrl('monitor')}>
                            Start free
                        </a>
                        <a className="text-link" href="#monitor-plans">
                            See the plans
                            <Icon name="arrow" />
                        </a>
                    </div>
                </div>
                <figure className="showcase-shot">
                    <Shot name="monitor-overview" alt="The PingOmni Monitor overview: monitors that need attention, 30-day uptime, response times and the latest checks" sizes="(max-width: 1160px) 100vw, 1100px" />
                    <figcaption className="small faint">Demo data</figcaption>
                </figure>
                <ul className="feature-row">
                    {MONITOR_FEATURES.map((f) => (
                        <li key={f.title}>
                            <Icon name={f.icon} />
                            <strong>{f.title}</strong>
                            <span>{f.text}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

function MonitorPlans() {
    const [yearly, setYearly] = useState(true);
    const euro = (n: number) => `€${n.toLocaleString('en')}`;
    return (
        <section className="section section-bg" id="monitor-plans" aria-labelledby="plans-title">
            <div className="container">
                <div className="section-head section-head-center">
                    <h2 id="plans-title" className="h2">
                        Start free. Grow when you need to.
                    </h2>
                    <p className="lead">Every plan has every check type, alerts and status pages. Paid plans add monitors, faster checks, people and history.</p>
                    <div className="period" role="group" aria-label="Billing period">
                        <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>
                            Monthly
                        </button>
                        <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>
                            Yearly <span className="period-save">2 months free</span>
                        </button>
                    </div>
                </div>
                <div className="plans">
                    {PLANS.map((p) => {
                        const price = yearly ? p.yearly : p.monthly;
                        return (
                            <article className="plan" key={p.name} aria-labelledby={`plan-${p.name}`} data-featured={p.name === 'Pro' || undefined}>
                                <h3 id={`plan-${p.name}`} className="plan-name">
                                    {p.name}
                                </h3>
                                <p className="plan-price">
                                    <strong>{euro(price)}</strong>
                                    <span>{price === 0 ? 'forever' : yearly ? '/ year' : '/ month'}</span>
                                </p>
                                <p className="plan-sub small muted">{p.note ?? (yearly ? `${euro(p.monthly)} a month, paid monthly` : `or ${euro(p.yearly)} a year`)}</p>
                                <ul className="plan-limits">
                                    {p.limits.map((l) => (
                                        <li key={l}>
                                            <Icon name="check" />
                                            {l}
                                        </li>
                                    ))}
                                </ul>
                                <a className={p.name === 'Free' || p.name === 'Pro' ? 'btn btn-primary' : 'btn'} href={buyUrl('monitor')}>
                                    {p.name === 'Free' ? 'Start free' : `Choose ${p.name}`}
                                </a>
                            </article>
                        );
                    })}
                </div>
                <p className="plans-note small muted">
                    Prices in euros; VAT is added where it applies. Paid plans are invoiced and paid by bank transfer: the plan starts as soon as
                    the payment arrives, and until then the workspace keeps its current plan.
                </p>
            </div>
        </section>
    );
}

function IspProducts() {
    const { root } = useSite();
    return (
        <section className="section section-surface" id="isp" aria-labelledby="isp-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="isp-title" className="h2">
                        For ISPs, on your own servers.
                    </h2>
                    <p className="lead">RadiusOne and DNSOne install on your Ubuntu servers and keep subscriber data, logs and DNS queries there.</p>
                </div>
                <div className="launcher">
                    <article className="tile tile-open" id="radiusone" aria-labelledby="tile-radiusone">
                        <div className="tile-body">
                            <div className="tile-head">
                                <Mark brand="radiusone" size={44} />
                                <h3 id="tile-radiusone" className="tile-name">
                                    <a href={`${root}radiusone/`}>
                                        <Wordmark brand="radiusone" />
                                    </a>
                                </h3>
                            </div>
                            <p className="tile-pitch">The ISP back office on FreeRADIUS.</p>
                            <p className="tile-text">
                                Subscribers, service plans, billing and NAS monitoring in one portal, installed with one command on your own Ubuntu
                                server.
                            </p>
                            <ul className="tile-points">
                                <li>
                                    <Icon name="clients" />
                                    PPPoE subscribers, plans, static IPs and expiry
                                </li>
                                <li>
                                    <Icon name="billing" />
                                    Invoices, payments and PDF receipts
                                </li>
                                <li>
                                    <Icon name="server" />
                                    NAS monitoring over SNMP, disconnects over CoA
                                </li>
                                <li>
                                    <Icon name="shield" />
                                    Operator roles, two-factor sign-in and encrypted backups
                                </li>
                            </ul>
                            <p className="tile-price">Free up to 150 subscribers. Licences from €36 a month.</p>
                            <div className="actions">
                                <a className="btn btn-primary" href={buyUrl('radiusone')}>
                                    Buy a licence
                                </a>
                                <a className="btn" href={DEMO_URL} target="_blank" rel="noopener">
                                    Try the demo
                                    <Icon name="external" />
                                </a>
                                <a className="text-link" href={`${root}radiusone/`}>
                                    About RadiusOne
                                    <Icon name="arrow" />
                                </a>
                            </div>
                        </div>
                        <figure className="tile-shot">
                            <Shot name="dashboard" alt="The RadiusOne dashboard: online clients, NAS status and top users" />
                        </figure>
                    </article>

                    <article className="tile tile-open tile-flip" id="dnsone" aria-labelledby="tile-dnsone">
                        <div className="tile-body">
                            <div className="tile-head">
                                <Mark brand="dnsone" size={44} />
                                <h3 id="tile-dnsone" className="tile-name">
                                    <a href={`${root}dnsone/`}>
                                        <Wordmark brand="dnsone" />
                                    </a>
                                </h3>
                            </div>
                            <p className="tile-pitch">DNS for ISPs, on your own server.</p>
                            <p className="tile-text">
                                Hosted zones, the customer resolver, ad-blocking and a query log in one console, on BIND, PowerDNS Recursor and
                                dnsdist.
                            </p>
                            <ul className="tile-points">
                                <li>
                                    <Icon name="globe" />
                                    Authoritative zones and records, with DNSSEC
                                </li>
                                <li>
                                    <Icon name="ban" />
                                    Ad-blocking and client groups for every customer
                                </li>
                                <li>
                                    <Icon name="search" />
                                    A searchable log of every query
                                </li>
                                <li>
                                    <Icon name="gauge" />
                                    Rate limits, and DNS over TLS and HTTPS
                                </li>
                            </ul>
                            <p className="tile-price">Community is free. Pro from €10 a month for a 2-server cluster.</p>
                            <div className="actions">
                                <a className="btn btn-primary" href={buyUrl('dnsone')}>
                                    Buy Pro
                                </a>
                                <a className="btn" href={DNSONE_DEMO_URL} target="_blank" rel="noopener">
                                    Try the demo
                                    <Icon name="external" />
                                </a>
                                <a className="text-link" href={`${root}dnsone/`}>
                                    About DNSOne
                                    <Icon name="arrow" />
                                </a>
                            </div>
                        </div>
                        <figure className="tile-shot">
                            <Shot name="dnsone-dashboard" alt="The DNSOne dashboard: queries, blocked queries, cache hit rate and service health" />
                        </figure>
                    </article>
                </div>
            </div>
        </section>
    );
}

function AccountBand() {
    return (
        <section className="section section-bg" id="account" aria-labelledby="account-title">
            <div className="container account-band">
                <Mark brand="pingomni" size={56} />
                <div>
                    <h2 id="account-title" className="h2">
                        One account for all of it.
                    </h2>
                    <p className="lead">
                        Your PingOmni Account holds your licences and invoices, buys and renews them online, and signs you in to PingOmni
                        Monitor.
                    </p>
                </div>
                <div className="actions">
                    <a className="btn btn-primary btn-lg" href={`${ACCOUNT_URL}/register`}>
                        Create an account
                    </a>
                    <a className="btn btn-lg" href={`${ACCOUNT_URL}/login`}>
                        Sign in
                    </a>
                </div>
            </div>
        </section>
    );
}

// The quick check's buttons: each opens its tool with the form filled in. Nothing runs until the visitor presses Run there.
const QUICK: { tool: string; field: string; label: string }[] = [
    { tool: 'ping', field: 'host', label: 'Ping' },
    { tool: 'traceroute', field: 'host', label: 'Traceroute' },
    { tool: 'dns', field: 'name', label: 'DNS lookup' },
    { tool: 'mx', field: 'domain', label: 'MX check' },
    { tool: 'blacklist', field: 'host', label: 'Blacklist check' },
    { tool: 'whois', field: 'query', label: 'Registration' },
    { tool: 'prefix', field: 'resource', label: 'BGP route' },
];

/** "https://user@example.com/path" as "example.com": the tools take a bare name or address. */
const bareHost = (input: string) =>
    input
        .trim()
        .replace(/^[a-z]+:\/\//i, '')
        .replace(/[/?#].*$/, '')
        .replace(/^.*@/, '');

function QuickCheck() {
    const { root } = useSite();
    const [value, setValue] = useState('');
    const submit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const host = bareHost(value);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const quick = QUICK.find((q) => q.tool === submitter?.value) ?? QUICK[0];
        const group = TOOL_LIST.find((t) => t.id === quick.tool)!.group;
        window.location.href = `${root}${TOOL_PAGES[group].path}#${quick.tool}?${new URLSearchParams({ [quick.field]: host })}`;
    };
    return (
        <form className="quick" onSubmit={submit}>
            <label className="quick-label" htmlFor="quick-host">
                Check a domain, hostname or IP address
            </label>
            <div className="quick-field">
                <span className="quick-prompt" aria-hidden="true">
                    $
                </span>
                <input
                    id="quick-host"
                    className="quick-input"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="example.com"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    required
                />
            </div>
            <div className="quick-actions">
                {QUICK.map((q, i) => (
                    <button key={q.tool} type="submit" name="tool" value={q.tool} className={i === 0 ? 'btn btn-primary btn-sm' : 'btn btn-sm'}>
                        {q.label}
                    </button>
                ))}
            </div>
        </form>
    );
}

/** The visitor's own address, as our server sees it: the first live reading on the page. */
function HeroConsole() {
    const [me, setMe] = useState<{ ip: string; hostname?: string } | null | undefined>(undefined);
    useEffect(() => {
        api('myip', {}, 8000).then(
            (r) => setMe({ ip: r.ip, hostname: r.hostname }),
            () => setMe(null),
        );
    }, []);
    return (
        <div className="console">
            <div className="console-bar">
                <span className="console-label">
                    <span className="console-live" data-state={me === undefined ? 'wait' : me ? 'on' : 'off'} />
                    {me === undefined && 'Finding your address'}
                    {me && 'Your IP address'}
                    {me === null && 'Run any check from our server or from other countries'}
                </span>
                {me && <code className="console-ip">{me.ip}</code>}
                {me?.hostname && <span className="console-host">{me.hostname}</span>}
            </div>
            <QuickCheck />
        </div>
    );
}

function FreeTools() {
    const { root } = useSite();
    const groups = Object.keys(TOOL_PAGES) as ToolGroup[];
    return (
        <section className="section section-surface" id="tools" aria-labelledby="tools-title">
            <div className="container">
                <div className="tools-head">
                    <div className="section-head">
                        <h2 id="tools-title" className="h2">
                            Free network, email and BGP tools.
                        </h2>
                        <p className="lead">
                            {TOOL_LIST.length} checks for anyone who runs a network. Run them from our server, from probes in other countries
                            through Globalping, or against the internet’s live routing table. No account, nothing to install.
                        </p>
                    </div>
                    <HeroConsole />
                </div>
                <div className="toolgroups">
                    {groups.map((g) => {
                        const info = TOOL_PAGES[g];
                        const href = `${root}${info.path}`;
                        const Preview = TOOL_PREVIEW[g];
                        return (
                            <div className="toolgroup" key={g}>
                                <a className="toolgroup-preview" href={href} tabIndex={-1} aria-hidden="true">
                                    <Preview />
                                </a>
                                <div className="toolgroup-body">
                                    <h3 className="toolgroup-head">
                                        <a href={href}>
                                            <span className="mega-toolgroup-icon">
                                                <Icon name={info.icon} />
                                            </span>
                                            {info.title}
                                            <Icon name="arrow" />
                                        </a>
                                    </h3>
                                    <ul className="toolgroup-list">
                                        {TOOL_LIST.filter((t) => t.group === g).map((t) => (
                                            <li key={t.id}>
                                                <a href={`${href}#${t.id}`} title={t.blurb}>
                                                    <Icon name={t.icon} />
                                                    {t.name}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

const COMMITMENTS: { term: string; icon: string; text: string }[] = [
    {
        term: 'Self-hosted',
        icon: 'server',
        text: 'Our products install on your own server, and your data stays there.',
    },
    {
        term: 'Safe by default',
        icon: 'shield',
        text: 'Access by role, two-factor sign-in for privileged roles, and encrypted backups.',
    },
    {
        term: 'Built for real ISP scale',
        icon: 'clients',
        text: 'Lists, search and exports are designed for thousands of subscribers, not a ten-row demo.',
    },
    {
        term: 'Desk and field',
        icon: 'phone',
        text: 'Every task the office handles at a desk also works on a technician’s phone.',
    },
    {
        term: 'One family',
        icon: 'grid',
        text: 'Every product shares one look, one set of roles and the same workflows.',
    },
];

// The product family in release order: what is out, then what comes next.
const FAMILY: { brand: Brand; job: string; href: string; available?: boolean }[] = [
    { brand: 'radiusone', job: 'ISP back office', href: 'radiusone/', available: true },
    { brand: 'dnsone', job: 'DNS', href: 'dnsone/', available: true },
    { brand: 'monitor', job: 'Monitoring', href: '#monitor', available: true },
];

function About() {
    const { root } = useSite();
    return (
        <section className="section section-bg" id="about" aria-labelledby="about-title">
            <div className="container about">
                <div className="about-intro">
                    <h2 id="about-title" className="h2">
                        About PingOmni.
                    </h2>
                    <p className="lead">
                        PingOmni builds software for the people who keep networks running: ISP owners, network engineers, office staff and field
                        technicians, and anyone whose website has to stay up.
                    </p>
                    <p className="muted">
                        We start from what an ISP actually runs (FreeRADIUS, PPPoE, NAS devices, billing) and make one product for each job.
                        PingOmni Monitor and the free tools on this site are the checks we reach for ourselves every day.
                    </p>
                    <ol className="family" aria-label="The product family, in release order">
                        {FAMILY.map((f) => (
                            <li key={f.brand} data-available={f.available || undefined}>
                                <a href={f.href.startsWith('#') ? f.href : `${root}${f.href}`}>
                                    <Mark brand={f.brand} size={40} />
                                    <Wordmark brand={f.brand} />
                                    <span className="family-job">{f.job}</span>
                                    {!f.available && <span className="badge badge-warning">Coming soon</span>}
                                </a>
                            </li>
                        ))}
                    </ol>
                </div>
                <ul className="commitments">
                    {COMMITMENTS.map((c) => (
                        <li className="commitment" key={c.term}>
                            <span className="commitment-icon">
                                <Icon name={c.icon} />
                            </span>
                            <strong>{c.term}</strong>
                            <span>{c.text}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

// Questions ISPs ask before trying the products. Every answer is something the product pages and guides also say.
const FAQ: { q: string; a: string }[] = [
    {
        q: 'What is PingOmni Monitor?',
        a: 'A hosted monitoring service: it checks your websites and APIs, SSL certificates, domain registrations, DNS records, servers by ping, TCP ports and cron jobs from the outside, and alerts you by email, Slack, Telegram or webhook. It is for any website, with status pages for your customers and a team with roles.',
    },
    {
        q: 'What does PingOmni Monitor cost?',
        a: 'The Free plan costs nothing and covers 10 monitors checked every 5 minutes. Starter is €6 a month, Pro €19 and Business €45; a year costs ten months. Paid plans are invoiced and paid by bank transfer, and the plan starts when the payment arrives.',
    },
    {
        q: 'How do I buy RadiusOne or DNSOne?',
        a: 'Online, in your PingOmni Account: choose the plan, and you get an invoice to pay by bank transfer. The licence key appears in your account as soon as the payment arrives, and you paste it into the product under Settings → License.',
    },
    {
        q: 'What is RadiusOne?',
        a: 'RadiusOne is a web portal for FreeRADIUS: PPPoE subscribers and their service plans, the NAS routers they connect through, invoices and payments, SNMP monitoring, customer messages by email and SMS, and admin alerts. Changes are written to the database FreeRADIUS reads, so they apply at the next customer login.',
    },
    {
        q: 'What is DNSOne?',
        a: 'DNSOne runs an ISP’s DNS from one web console: authoritative zones on BIND with DNSSEC, a PowerDNS Recursor resolver for your customers with ad-blocking and client groups, a query log, and dnsdist rate limits and attack protection in front of both.',
    },
    {
        q: 'Do the products run on my own server?',
        a: 'Yes. Both are self-hosted on Ubuntu 24.04 LTS, so subscriber data, logs and DNS queries stay on servers you control. RadiusOne installs with one command; DNSOne comes with a step-by-step runbook whose every step ends with a check.',
    },
    {
        q: 'Which routers work with RadiusOne?',
        a: 'MikroTik RouterOS is tested end to end: login, IP address, speed limits and disconnects (RADIUS CoA, or the RouterOS API). Cisco IOS XE support is marked beta until it has been tested on a real router.',
    },
    {
        q: 'How big a network can DNSOne serve?',
        a: 'One server handles about 10,000 clients and is tuned for up to 50,000. More servers can join as secondaries that take their zones and settings from the primary.',
    },
    {
        q: 'Can I try them before installing?',
        a: 'Yes. Both have a public demo with sample data: sign in as demo / demo and click through every page. Changes stay in your browser tab and never reach a real server.',
    },
    {
        q: 'Are the network tools free?',
        a: 'Yes, with no account: ping, traceroute and MTR (also from probes in other countries), port checks, a subnet calculator, DNS, MX, SPF, DMARC and DKIM checks, a blacklist check, WHOIS, ASN and prefix lookups with RPKI, and a BGP looking glass.',
    },
    {
        q: 'Where is the documentation?',
        a: 'Each product’s user guide is on this site under Docs, the same guide the console carries inside for its version: every page, how to set it up and how it works.',
    },
];

function Faq() {
    return (
        <section className="section section-surface" id="faq" aria-labelledby="faq-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="faq-title" className="h2">
                        Questions we hear.
                    </h2>
                    <p className="lead">What each product does, what it costs, where it runs, and how to try it first.</p>
                </div>
                <div className="faq-list">
                    {FAQ.map((f) => (
                        <details className="faq-item" key={f.q}>
                            <summary>
                                <h3 className="h3">{f.q}</h3>
                                <Icon name="chevron" />
                            </summary>
                            <p>{f.a}</p>
                        </details>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default function Home() {
    return (
        <>
            <section className="stage hero hero-center" aria-labelledby="hero-title">
                <div className="container">
                    <h1 id="hero-title" className="display">
                        Keep every network running.
                    </h1>
                    <p className="lead">
                        PingOmni Monitor for anyone with a website. RadiusOne and DNSOne for ISPs, on your own servers. And {TOOL_LIST.length} free
                        tools for everyone who runs a network.
                    </p>
                    <div className="actions actions-center">
                        <a className="btn btn-primary btn-lg" href={buyUrl('monitor')}>
                            Start Monitor, free
                        </a>
                        <a className="btn btn-lg" href="#isp">
                            Software for ISPs
                        </a>
                    </div>
                    <Lineup />
                </div>
            </section>
            <MonitorShowcase />
            <MonitorPlans />
            <IspProducts />
            <AccountBand />
            <FreeTools />
            <About />
            <Faq />
            <Contact
                title="Talk to us."
                text="Email us with questions about PingOmni Monitor, RadiusOne, DNSOne or the free tools."
            />
        </>
    );
}
