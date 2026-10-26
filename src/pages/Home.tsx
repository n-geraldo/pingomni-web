import { useEffect, useState, type FormEvent } from 'react';
import { Mark, Wordmark } from '../brand';
import { DNSONE_DEMO_URL, mailto } from '../config';
import Icon from '../Icon';
import { api } from '../lib/api';
import { TOOL_LIST, TOOL_PAGES, type ToolGroup } from '../lib/toolList';
import { Contact, Shot, useSite } from '../shared/Layout';
import { TOOL_PREVIEW } from '../shared/ToolPreviews';

function Launcher() {
    const { root } = useSite();
    return (
        <div className="launcher" id="products">
            <article className="tile tile-open" aria-labelledby="tile-radiusone">
                <div className="tile-body">
                    <div className="tile-head">
                        <Mark brand="radiusone" size={44} className="ping-on-load" />
                        <h2 id="tile-radiusone" className="tile-name">
                            <a href={`${root}radiusone/`}>
                                <Wordmark brand="radiusone" />
                            </a>
                        </h2>
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
                    <div className="actions">
                        <a className="btn btn-primary" href={mailto('RadiusOne')}>
                            Email us
                        </a>
                        <a className="text-link" href={`${root}radiusone/`}>
                            About RadiusOne
                            <Icon name="arrow" />
                        </a>
                    </div>
                </div>
                <figure className="tile-shot">
                    <Shot name="dashboard" alt="The RadiusOne dashboard: online clients, NAS status and top users" eager />
                </figure>
            </article>

            <article className="tile tile-open tile-flip" aria-labelledby="tile-dnsone">
                <div className="tile-body">
                    <div className="tile-head">
                        <Mark brand="dnsone" size={44} className="ping-on-load" />
                        <h2 id="tile-dnsone" className="tile-name">
                            <a href={`${root}dnsone/`}>
                                <Wordmark brand="dnsone" />
                            </a>
                        </h2>
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
                    <div className="actions">
                        <a className="btn btn-primary" href={DNSONE_DEMO_URL} target="_blank" rel="noopener">
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
                    <Shot name="dnsone-dashboard" alt="The DNSOne dashboard: queries, blocked queries, cache hit rate and service health" eager />
                </figure>
            </article>

            <article className="tile tile-closed" aria-labelledby="tile-ticketone">
                <Mark brand="ticketone" size={40} />
                <div className="tile-closed-text">
                    <h2 id="tile-ticketone" className="tile-name">
                        <a href={`${root}ticketone/`}>
                            <Wordmark brand="ticketone" />
                        </a>
                    </h2>
                    <p>Support tickets for ISP help desks.</p>
                </div>
                <span className="badge badge-warning">Coming soon</span>
                <a className="tile-link" href={mailto('Tell me when TicketOne is ready')}>
                    Tell me when it’s ready
                </a>
            </article>
        </div>
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
                <div className="section-head">
                    <h2 id="tools-title" className="h2">
                        Free network, email and BGP tools.
                    </h2>
                    <p className="lead">
                        {TOOL_LIST.length} checks for anyone who runs a network. Run them from our server, from probes in other countries through
                        Globalping, or against the internet’s live routing table. No account, nothing to install.
                    </p>
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
const FAMILY: { brand: 'radiusone' | 'ticketone' | 'dnsone'; job: string; available?: boolean }[] = [
    { brand: 'radiusone', job: 'ISP back office', available: true },
    { brand: 'dnsone', job: 'DNS', available: true },
    { brand: 'ticketone', job: 'Support tickets' },
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
                        technicians.
                    </p>
                    <p className="muted">
                        We start from what an ISP actually runs (FreeRADIUS, PPPoE, NAS devices, billing) and make one product for each job. The
                        free tools on this site are the checks we reach for ourselves every day.
                    </p>
                    <ol className="family" aria-label="The product family, in release order">
                        {FAMILY.map((f) => (
                            <li key={f.brand} data-available={f.available || undefined}>
                                <a href={`${root}${f.brand}/`}>
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
                        Questions ISPs ask us.
                    </h2>
                    <p className="lead">What RadiusOne and DNSOne do, where they run, and how to try them first.</p>
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
            <section className="stage hero" aria-labelledby="hero-title">
                <div className="container">
                    <div className="hero-head">
                        <div className="hero-copy">
                            <h1 id="hero-title" className="display">
                                Software that ISPs run on.
                            </h1>
                            <p className="lead">
                                Self-hosted software for ISPs and network operators, plus {TOOL_LIST.length} free tools for anyone who runs a
                                network.
                            </p>
                        </div>
                        <HeroConsole />
                    </div>
                    <Launcher />
                </div>
            </section>
            <FreeTools />
            <About />
            <Faq />
            <Contact
                title="Talk to us."
                text="Email us with questions about RadiusOne, the products coming next or the free tools."
            />
        </>
    );
}
