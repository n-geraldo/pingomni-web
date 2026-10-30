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
    { brand: 'monitor', job: 'Uptime, SSL and domains for any website', href: 'monitor/', status: 'new' },
    { brand: 'radiusone', job: 'The ISP back office on FreeRADIUS', href: 'radiusone/', status: 'available' },
    { brand: 'dnsone', job: 'DNS for ISPs, on your own server', href: 'dnsone/', status: 'available' },
];

const STATUS = { available: ['badge-success', 'Available'], new: ['badge-success', 'New'], soon: ['badge-warning', 'Coming soon'] } as const;

function Lineup() {
    const { root } = useSite();
    return (
        <nav className="lineup" id="products-line" aria-label="Products">
            {LINEUP.map((p) => (
                <a key={p.brand} className="lineup-item" href={`${root}${p.href}`}>
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

// The three products side by side: what each one is, three things it does, what it costs, and the way in.
const PRODUCT_CARDS: { brand: Brand; page: string; pitch: string; points: { icon: string; text: string }[]; price: string; shot: string; alt: string; cta: { label: string; href: string; external?: boolean } }[] = [
    {
        brand: 'monitor',
        page: 'monitor/',
        pitch: 'Know the moment a site goes down.',
        points: [
            { icon: 'globe', text: 'Websites, APIs, SSL, domains, DNS, mail, databases and cron jobs' },
            { icon: 'message', text: 'Confirmed alerts to 8 channels, with escalation' },
            { icon: 'eye', text: 'Status pages with email subscribers, on your own domain' },
        ],
        price: 'Free for 10 monitors. Paid plans from €6 a month.',
        shot: 'monitor-overview',
        alt: 'The PingOmni Monitor overview',
        cta: { label: 'Start free', href: buyUrl('monitor') },
    },
    {
        brand: 'radiusone',
        page: 'radiusone/',
        pitch: 'The ISP back office on FreeRADIUS.',
        points: [
            { icon: 'clients', text: 'PPPoE subscribers, plans, static IPs and expiry' },
            { icon: 'billing', text: 'Invoices, payments and PDF receipts' },
            { icon: 'server', text: 'NAS monitoring over SNMP, disconnects over CoA' },
        ],
        price: 'Free up to 150 subscribers. Licences from €36 a month.',
        shot: 'dashboard',
        alt: 'The RadiusOne dashboard',
        cta: { label: 'Try the demo', href: DEMO_URL, external: true },
    },
    {
        brand: 'dnsone',
        page: 'dnsone/',
        pitch: 'DNS for ISPs, on your own server.',
        points: [
            { icon: 'globe', text: 'Authoritative zones and records, with DNSSEC' },
            { icon: 'ban', text: 'A resolver with ad-blocking and client groups' },
            { icon: 'gauge', text: 'Query log, rate limits, DNS over TLS and HTTPS' },
        ],
        price: 'Community is free. Pro from €10 a month.',
        shot: 'dnsone-dashboard',
        alt: 'The DNSOne dashboard',
        cta: { label: 'Try the demo', href: DNSONE_DEMO_URL, external: true },
    },
];

function Products() {
    const { root } = useSite();
    return (
        <section className="section section-surface" id="products" aria-labelledby="products-title">
            <div className="container">
                <div className="section-head section-head-center">
                    <h2 id="products-title" className="h2">
                        Three products, one account.
                    </h2>
                    <p className="lead">One for anyone with a website, two for the ISPs that run their own network.</p>
                </div>
                <div className="pcards">
                    {PRODUCT_CARDS.map((p) => (
                        <article className="pcard" key={p.brand} id={p.brand} aria-labelledby={`pcard-${p.brand}`}>
                            <a className="pcard-shot" href={`${root}${p.page}`} tabIndex={-1} aria-hidden="true">
                                <Shot name={p.shot} alt="" sizes="(max-width: 980px) 100vw, 380px" />
                            </a>
                            <div className="pcard-body">
                                <h3 className="pcard-name" id={`pcard-${p.brand}`}>
                                    <a href={`${root}${p.page}`}>
                                        <Mark brand={p.brand} size={32} />
                                        <Wordmark brand={p.brand} />
                                    </a>
                                </h3>
                                <p className="pcard-pitch">{p.pitch}</p>
                                <ul className="pcard-points">
                                    {p.points.map((pt) => (
                                        <li key={pt.text}>
                                            <Icon name={pt.icon} />
                                            {pt.text}
                                        </li>
                                    ))}
                                </ul>
                                <p className="pcard-price small muted">{p.price}</p>
                                <div className="actions">
                                    <a className="btn btn-primary" href={p.cta.href} target={p.cta.external ? '_blank' : undefined} rel={p.cta.external ? 'noopener' : undefined}>
                                        {p.cta.label}
                                        {p.cta.external && <Icon name="external" />}
                                    </a>
                                    <a className="text-link" href={`${root}${p.page}`}>
                                        Learn more
                                        <Icon name="arrow" />
                                    </a>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

// What changed in PingOmni Monitor lately, each linking to where /monitor/ explains it.
const MONITOR_NEW: { icon: string; title: string; text: string; anchor: string }[] = [
    { icon: 'server', title: 'Mail, database and WebSocket checks', text: 'SMTP with STARTTLS, MySQL to MongoDB without a password, and live sockets.', anchor: 'checks' },
    { icon: 'globe', title: 'JSON checks for APIs', text: 'Down when a field of the answer is wrong, even when the status code is fine.', anchor: 'checks' },
    { icon: 'code', title: 'Status widget', text: 'One line on your website shows the live status to your visitors.', anchor: 'status' },
    { icon: 'message', title: 'A connector for Claude', text: 'Ask your AI assistant what is down, or have it draft the status update.', anchor: 'scale' },
    { icon: 'user', title: 'Escalation', text: 'A channel alerts only when nobody has acknowledged the incident in time.', anchor: 'alerts' },
    { icon: 'mail', title: 'Status page subscribers', text: 'Your customers get an email when a service goes down and when it is back.', anchor: 'status' },
];

function MonitorNew() {
    const { root } = useSite();
    return (
        <section className="section section-bg" id="monitor" aria-labelledby="monitor-new-title">
            <div className="container mon-new">
                <div className="mon-new-head">
                    <Mark brand="monitor" size={48} className="ping-on-load" />
                    <h2 id="monitor-new-title" className="h2">
                        New in PingOmni Monitor.
                    </h2>
                    <p className="lead">Built for the teams that watch many sites for many customers, and for the customers who want to know.</p>
                    <div className="actions">
                        <a className="btn btn-primary" href={`${root}monitor/`}>
                            See everything it does
                        </a>
                        <a className="text-link" href={`${root}monitor/#plans`}>
                            Plans and prices
                            <Icon name="arrow" />
                        </a>
                    </div>
                </div>
                <ul className="mon-new-list">
                    {MONITOR_NEW.map((f) => (
                        <li key={f.title}>
                            <a href={`${root}monitor/#${f.anchor}`}>
                                <span className="check-grid-icon">
                                    <Icon name={f.icon} />
                                </span>
                                <strong>{f.title}</strong>
                                <span>{f.text}</span>
                            </a>
                        </li>
                    ))}
                </ul>
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
    { brand: 'monitor', job: 'Monitoring', href: 'monitor/', available: true },
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
export const FAQ: { q: string; a: string }[] = [
    {
        q: 'What is PingOmni Monitor?',
        a: 'A hosted monitoring service: it checks your websites and APIs, SSL certificates, domain registrations, DNS records, servers by ping, TCP ports, mail servers, databases, WebSockets and cron jobs from outside your network, confirms every failure from other networks, and alerts you by email, Slack, Teams, Telegram, Discord, Google Chat, PagerDuty or webhook, with escalation when nobody answers. Status pages with email subscribers keep your customers informed.',
    },
    {
        q: 'What does PingOmni Monitor cost?',
        a: 'The Free plan costs nothing and covers 10 monitors checked every 5 minutes. Starter is €6 a month, Pro €19 and Business €45; a year costs ten months. Paid plans are paid by card in your PingOmni Account, and start as soon as the payment goes through.',
    },
    {
        q: 'How do I buy RadiusOne or DNSOne?',
        a: 'Online, in your PingOmni Account: choose the plan and pay by card through POK’s secure payment page. The licence key appears in your account as soon as the payment goes through, and you paste it into the product under Settings → License.',
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

// The numbers that sum up the products: each one is a fact of the products themselves, not a claim about customers.
function Proof() {
    const facts: [string, string][] = [
        ['11', 'kinds of checks, from websites and certificates to databases and cron jobs'],
        ['8', 'alert channels, from email and Slack to PagerDuty, with escalation'],
        ['7', 'languages for public status pages, with email subscribers'],
        [String(TOOL_LIST.length), 'free network, DNS, email and BGP tools, no account needed'],
    ];
    return (
        <section className="proof" aria-label="PingOmni in numbers">
            <div className="container">
                <ul className="proof-grid">
                    {facts.map(([n, text]) => (
                        <li key={text}>
                            <strong>{n}</strong>
                            <span>{text}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

export default function Home() {
    return (
        <>
            <section className="stage product-hero home-hero" aria-labelledby="hero-title">
                <div className="container product-hero-row">
                    <div className="product-hero-text">
                        <p className="eyebrow">Monitoring and ISP software</p>
                        <h1 id="hero-title" className="display">
                            Keep every network running.
                        </h1>
                        <p className="lead">
                            PingOmni Monitor watches any website from the outside and tells you before your customers do. RadiusOne and DNSOne
                            run an ISP on its own servers. And {TOOL_LIST.length} free tools for everyone who runs a network.
                        </p>
                        <div className="actions">
                            <a className="btn btn-primary btn-lg" href={buyUrl('monitor')}>
                                Start Monitor, free
                                <Icon name="arrow" />
                            </a>
                            <a className="btn btn-lg btn-ghost" href="#products">
                                See the products
                            </a>
                        </div>
                        <ul className="hero-facts" aria-label="In short">
                            <li><Icon name="check" />Free plan, no card needed</li>
                            <li><Icon name="check" />Outages confirmed from other networks</li>
                            <li><Icon name="check" />ISP software on your own servers</li>
                        </ul>
                    </div>
                    <figure className="product-hero-shot">
                        <Shot name="monitor-overview" alt="The PingOmni Monitor overview: checks today, outages, the next certificate to end, 30-day uptime and response times" eager />
                        <div className="hero-float" aria-hidden="true">
                            <Shot name="monitor-status" alt="A public status page" eager sizes="(max-width: 980px) 52vw, 360px" />
                        </div>
                    </figure>
                </div>
                <div className="container">
                    <Lineup />
                </div>
            </section>
            <Products />
            <Proof />
            <MonitorNew />
            <FreeTools />
            <AccountBand />
            <About />
            <Faq />
            <Contact
                start
                title="Start in five minutes."
                text="Monitor is free for 10 monitors, with no card. For RadiusOne, DNSOne, a larger plan or anything else, email us: we answer within one working day."
            />
        </>
    );
}
