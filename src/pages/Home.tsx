import { useEffect, useState, type FormEvent } from 'react';
import { Mark, Wordmark } from '../brand';
import { DEMO_URL, mailto } from '../config';
import Icon from '../Icon';
import { api } from '../lib/api';
import { TOOL_LIST, TOOL_PAGES, type ToolGroup } from '../lib/toolList';
import { Contact, Shot, useSite } from '../shared/Layout';

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
                        <span className="badge badge-success">Available</span>
                    </div>
                    <p className="tile-pitch">The ISP back office on FreeRADIUS.</p>
                    <p className="tile-text">
                        Subscribers, service plans, billing and NAS monitoring in one portal, installed with one command on your own Ubuntu
                        server.
                    </p>
                    <ul className="tile-points">
                        <li>
                            <Icon name="clients" />
                            PPPoE clients, plans, static IPs and expiry
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
                            Roles with two-factor sign-in, encrypted backups
                        </li>
                    </ul>
                    <div className="actions">
                        <a className="btn btn-primary" href={DEMO_URL} target="_blank" rel="noopener">
                            Try the demo
                            <Icon name="external" />
                        </a>
                        <a className="btn" href={mailto('RadiusOne')}>
                            Email us
                        </a>
                        <a className="text-link" href={`${root}radiusone/`}>
                            About RadiusOne
                            <Icon name="arrow" />
                        </a>
                    </div>
                </div>
                <figure className="tile-shot">
                    <figcaption className="shot-label">Demo data</figcaption>
                    <Shot name="dashboard" alt="The RadiusOne dashboard: online clients, NAS status and top users" eager />
                </figure>
            </article>

            {(['ticketone', 'dnsone'] as const).map((brand) => (
                <article className="tile tile-closed" aria-labelledby={`tile-${brand}`} key={brand}>
                    <Mark brand={brand} size={40} />
                    <div className="tile-closed-text">
                        <h2 id={`tile-${brand}`} className="tile-name">
                            <a href={`${root}${brand}/`}>
                                <Wordmark brand={brand} />
                            </a>
                        </h2>
                        <p>{brand === 'ticketone' ? 'Support tickets for ISP help desks.' : 'DNS for ISPs and network operators.'}</p>
                    </div>
                    <span className="badge badge-warning">Coming soon</span>
                    <a className="tile-link" href={mailto(`Tell me when ${brand === 'ticketone' ? 'TicketOne' : 'DNSOne'} is ready`)}>
                        Tell me when it’s ready
                    </a>
                </article>
            ))}
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
                <span className="console-live" data-state={me === undefined ? 'wait' : me ? 'on' : 'off'} />
                {me === undefined && <span>Finding your address</span>}
                {me && (
                    <span>
                        You are <code className="console-ip">{me.ip}</code>
                        {me.hostname && <span className="console-host">{me.hostname}</span>}
                    </span>
                )}
                {me === null && <span>Run any check from our server or from other countries</span>}
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
                        {TOOL_LIST.length} checks for anyone who runs a network: from our server, from other countries through Globalping, or
                        from the internet’s routing table. No account, nothing to install.
                    </p>
                </div>
                <div className="toolgroups">
                    {groups.map((g) => {
                        const info = TOOL_PAGES[g];
                        const href = `${root}${info.path}`;
                        return (
                            <div className="toolgroup" key={g}>
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
                                            <a href={`${href}#${t.id}`}>
                                                <Icon name={t.icon} />
                                                <span>
                                                    <strong>{t.name}</strong>
                                                    <span>{t.blurb}</span>
                                                </span>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

const COMMITMENTS: { term: string; text: string }[] = [
    {
        term: 'Self-hosted',
        text: 'Our products install on your own server and your data stays there. RadiusOne runs on Ubuntu; every product after it will work the same way.',
    },
    {
        term: 'Safe by default',
        text: 'Operators get only the access their role needs, privileged roles must use two-factor sign-in, and backups are encrypted.',
    },
    {
        term: 'Built for real ISP size',
        text: 'Lists, search and exports are built for thousands of subscribers, not for a demo with ten.',
    },
    {
        term: 'Desk and field',
        text: 'Every task the office does on a desktop is built to work on a technician’s phone too.',
    },
    {
        term: 'One family',
        text: 'Products share one look, one set of roles and the same habits, so the next one feels familiar on day one.',
    },
];

function About() {
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
                        We start from what an ISP actually runs (FreeRADIUS, PPPoE, NAS devices, billing) and make one product for each job.
                        RadiusOne is the first. TicketOne for support tickets and DNSOne for DNS come next. The free tools on this site are the
                        checks we reach for ourselves every day.
                    </p>
                </div>
                <dl className="rows">
                    {COMMITMENTS.map((c) => (
                        <div className="row" key={c.term}>
                            <dt>{c.term}</dt>
                            <dd>{c.text}</dd>
                        </div>
                    ))}
                </dl>
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
                                Self-hosted products for ISPs and network operators, and {TOOL_LIST.length} free tools for anyone who runs a
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
            <Contact
                title="Talk to us."
                text="Questions about RadiusOne, the products coming next or the tools: email us. Or try the RadiusOne demo first; nothing you change in it is saved."
            />
        </>
    );
}
