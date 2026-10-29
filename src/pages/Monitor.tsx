import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Mark, Wordmark } from '../brand';
import { ACCOUNT_URL, buyUrl } from '../config';
import Icon from '../Icon';
import { Contact, Shot } from '../shared/Layout';
import { MonitorPlans } from '../shared/MonitorPlans';

// What one monitor can watch: the eight check types, each with what it actually catches.
const CHECKS: { icon: string; name: string; text: string }[] = [
    { icon: 'globe', name: 'Websites and APIs', text: 'The status code you expect, response time, redirects and the TLS handshake. GET, HEAD or POST.' },
    { icon: 'search', name: 'Keywords', text: 'A word that must be on the page (or must not), so an error page that answers 200 still counts as down.' },
    { icon: 'lock', name: 'SSL certificates', text: 'Expiry, chain and host name, with a warning days before the certificate ends.' },
    { icon: 'id', name: 'Domain registration', text: 'When the domain itself expires, read from the registry, so a forgotten renewal never takes you offline.' },
    { icon: 'nodes', name: 'DNS records', text: 'A, AAAA, CNAME, MX, NS or TXT, with the answer you expect.' },
    { icon: 'signal', name: 'Ping', text: 'Routers, servers and links, with the round-trip time.' },
    { icon: 'plug', name: 'TCP ports', text: 'Mail, databases, RADIUS, SSH or any service that listens on a port.' },
    { icon: 'activity', name: 'Heartbeats', text: 'Your backups and cron jobs call a link when they finish; a missed call is an alert.' },
];

// From a failed check to the right person, in the order it happens.
const FLOW: { icon: string; kind: string; name: string; note: string }[] = [
    { icon: 'server', kind: 'Check', name: 'From outside', note: 'A probe server outside your network runs the check.' },
    { icon: 'refresh', kind: 'Retry', name: '20 seconds later', note: 'One failure is never enough: it is checked again.' },
    { icon: 'nodes', kind: 'Confirm', name: 'Other networks', note: 'Other probes check it too, so trouble on one path never alerts.' },
    { icon: 'message', kind: 'Alert', name: 'Your channels', note: 'At once, or after the delay you set for that monitor.' },
    { icon: 'user', kind: 'Escalate', name: 'If nobody answers', note: 'Not acknowledged in time? The next person or PagerDuty hears.' },
    { icon: 'check', kind: 'Recover', name: 'Everyone told', note: 'The incident closes and every channel that heard gets the all-clear.' },
];

const CHANNELS = ['Email', 'Slack', 'Microsoft Teams', 'Telegram', 'Discord', 'Google Chat', 'PagerDuty', 'Webhooks'];

// The product, area by area, each next to its real screen (demo data).
const AREAS: { id: string; title: string; pitch: string; points: { icon: string; text: ReactNode }[]; shot: string; alt: string }[] = [
    {
        id: 'alerts',
        title: 'Alerts that mean it.',
        pitch: 'Every failure is confirmed before anyone is woken, and every channel can wait for its turn.',
        points: [
            { icon: 'message', text: <>{CHANNELS.join(', ')}</> },
            { icon: 'user', text: 'Escalation: a channel alerts only if nobody has acknowledged the incident in 5 to 60 minutes' },
            { icon: 'gauge', text: 'Slow-response alerts, after the site has stayed slow for the minutes you choose' },
            { icon: 'refresh', text: 'Alert delays per monitor, and a guard that holds back alerts while a site flaps' },
            { icon: 'settings', text: 'Maintenance windows: checks keep running, alerts stay quiet' },
        ],
        shot: 'monitor-alerts',
        alt: 'The Alerts page: eight kinds of channels, and each channel set to alert at once or only when an incident is not acknowledged',
    },
    {
        id: 'incidents',
        title: 'One place for every outage.',
        pitch: 'An incident opens by itself and keeps the whole story: what failed, who is on it, and what the customers were told.',
        points: [
            { icon: 'check', text: 'Acknowledge in one click, so the team sees someone is on it and escalation stops' },
            { icon: 'logs', text: 'A timeline with every alert, note and check around the outage' },
            { icon: 'eye', text: 'Public updates go to your status pages and their email subscribers; team notes stay inside' },
            { icon: 'reports', text: 'Reports with uptime, incidents and SLA for any month' },
        ],
        shot: 'monitor-incident',
        alt: 'An incident: the Billing API is down, acknowledged by a team member, with a team note and a public update in its timeline',
    },
    {
        id: 'status',
        title: 'A status page your customers trust.',
        pitch: 'Show them that everything works, or that you already know it does not, before they call support.',
        points: [
            { icon: 'chart', text: '90 days of uptime for each service, and the incidents of the last two weeks' },
            { icon: 'mail', text: 'Visitors subscribe by email and hear when a service goes down, gets an update and recovers' },
            { icon: 'globe', text: 'On your own domain, like status.yourcompany.com, with HTTPS set up for you (Pro and Business)' },
            { icon: 'seal', text: 'Live status and uptime badges for your website or README' },
        ],
        shot: 'monitor-status',
        alt: 'A public status page: five services with 90 days of uptime bars, and a public update on an ongoing incident',
    },
    {
        id: 'scale',
        title: 'Fifty sites or five hundred.',
        pitch: 'Built for agencies, ISPs and hosting companies that watch many sites for many customers.',
        points: [
            { icon: 'grid', text: 'Tags to group monitors by customer, site or team, and filter by them' },
            { icon: 'check', text: 'Bulk actions: pause, resume, alerts on or off, tag or remove many monitors at once' },
            { icon: 'swap', text: 'Import monitors from a CSV file, and export them again' },
            { icon: 'code', text: 'A REST API with keys, for the monitors your own systems create' },
            { icon: 'clients', text: 'A team with owners, admins, members and viewers' },
        ],
        shot: 'monitor-list',
        alt: 'The monitor list with tags such as web, billing, network and mail, filters by type, status and tag, and CSV import and export',
    },
];

const USE_CASES: { id: string; icon: string; tab: string; title: string; scene: string; how: string[] }[] = [
    {
        id: 'shop',
        icon: 'billing',
        tab: 'Online shop',
        title: 'A shop that loses money every minute it is down',
        scene: 'The site, the checkout and the payment provider all have to work, and the certificate must never expire on a Friday night.',
        how: [
            'A keyword check on the checkout page catches an error page that still answers 200',
            'SSL and domain monitors warn weeks before anything expires',
            'Slow-response alerts tell you when the shop is up but too slow to buy from',
        ],
    },
    {
        id: 'agency',
        icon: 'clients',
        tab: 'Web agency',
        title: 'An agency that hosts sites for thirty customers',
        scene: 'Every customer believes their site is the only one, and each one wants to know when something breaks.',
        how: [
            'Import every site from a CSV file, tagged by customer',
            'One status page per customer, on the customer’s own domain',
            'Alerts to the agency’s Slack; the customer hears through their status page',
        ],
    },
    {
        id: 'isp',
        icon: 'signal',
        tab: 'ISP or hosting',
        title: 'An ISP with a NOC and a duty manager',
        scene: 'Routers, RADIUS, mail and DNS are watched around the clock, and the night shift is one person.',
        how: [
            'Ping, TCP port and DNS checks on core routers, RADIUS servers and resolvers',
            'The NOC is alerted at once; the duty manager’s PagerDuty only if nobody acknowledges in 15 minutes',
            'A public status page with email subscribers takes the calls off the support line',
        ],
    },
    {
        id: 'saas',
        icon: 'code',
        tab: 'SaaS and developers',
        title: 'A product team that ships every day',
        scene: 'The API, the background jobs and the nightly backup all fail quietly unless someone is watching.',
        how: [
            'API checks with the expected status code and a time-out',
            'Heartbeats for cron jobs and backups: a missed call is an alert',
            'Webhooks into your own tools, and the REST API to create monitors from code',
        ],
    },
];

const FAQ: { q: string; a: string }[] = [
    {
        q: 'Will it wake me up for nothing?',
        a: 'No: one failed check is never an alert. The check is repeated 20 seconds later, then other probes in other networks are asked. Only when they agree that the site is down does the incident open and the alert go out, and you can add a delay per monitor on top.',
    },
    {
        q: 'Where do the checks come from?',
        a: 'From PingOmni’s probe servers, outside your network, so they see what your customers see. Each check runs on one probe and moves to another if that probe stops answering. The addresses are listed on the bot page, so you can let them through a firewall or bot protection.',
    },
    {
        q: 'How do status page subscribers work?',
        a: 'Visitors enter their email on your status page and confirm it with a link. They get an email when a service goes down, when you post a public update, and when it recovers; every email has an unsubscribe link. Starter allows 100 subscribers a page, Pro 1,000 and Business 10,000.',
    },
    {
        q: 'Can the status page be on my own domain?',
        a: 'Yes, on Pro and Business. Enter status.yourcompany.com, add one CNAME record at your DNS provider, and the HTTPS certificate is issued for you within minutes.',
    },
    {
        q: 'How do I pay, and can I cancel?',
        a: 'Paid plans are paid by card in your PingOmni Account, through POK’s secure payment page, monthly or yearly. There is nothing to cancel: a plan simply ends when it is not renewed.',
    },
    {
        q: 'Do I need to install anything?',
        a: 'No. PingOmni Monitor is a hosted service: sign up with a PingOmni Account and add your first monitor in a minute. Only heartbeats need a line in your own job, to call the link when it finishes.',
    },
];

function Flow() {
    return (
        <section className="section section-bg" aria-labelledby="flow-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="flow-title" className="h2">
                        From a failed check to the right person.
                    </h2>
                    <p className="lead">Six steps, in this order, every time. Your phone only rings when a site is really down.</p>
                </div>
                <div className="path">
                    <ol className="path-chain mon-flow" aria-label="What happens when a check fails, in order">
                        {FLOW.map((n, i) => (
                            <li className="path-node" key={n.kind} style={{ '--i': i } as CSSProperties}>
                                <span className="path-icon">
                                    <Icon name={n.icon} />
                                </span>
                                <span className="path-kind">{n.kind}</span>
                                <strong>{n.name}</strong>
                                <span className="small faint">{n.note}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            </div>
        </section>
    );
}

function Checks() {
    return (
        <section className="section section-surface" id="checks" aria-labelledby="checks-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="checks-title" className="h2">
                        Eight kinds of checks.
                    </h2>
                    <p className="lead">Everything a customer would notice, and the things that expire quietly before they do.</p>
                </div>
                <ul className="check-grid">
                    {CHECKS.map((c) => (
                        <li key={c.name}>
                            <span className="check-grid-icon">
                                <Icon name={c.icon} />
                            </span>
                            <strong>{c.name}</strong>
                            <span>{c.text}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

function Areas() {
    return (
        <section className="section section-surface" id="features" aria-labelledby="features-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="features-title" className="h2">
                        Built for the moment something breaks.
                    </h2>
                    <p className="lead">The screens below are the real product, with demo data.</p>
                </div>
                <div className="launcher">
                    {AREAS.map((a, i) => (
                        <article className={i % 2 ? 'tile tile-open tile-flip' : 'tile tile-open'} id={a.id} key={a.id} aria-labelledby={`area-${a.id}`}>
                            <div className="tile-body">
                                <h3 id={`area-${a.id}`} className="h3 area-title">
                                    {a.title}
                                </h3>
                                <p className="tile-text">{a.pitch}</p>
                                <ul className="tile-points">
                                    {a.points.map((p, k) => (
                                        <li key={k}>
                                            <Icon name={p.icon} />
                                            {p.text}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <figure className="tile-shot">
                                <Shot name={a.shot} alt={a.alt} />
                            </figure>
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
        <section className="section section-bg" id="use-cases" aria-labelledby="use-cases-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="use-cases-title" className="h2">
                        Who it is for.
                    </h2>
                    <p className="lead">Four kinds of teams, and how each one uses PingOmni Monitor.</p>
                </div>
                <div className="cases">
                    <div className="cases-tabs" role="tablist" aria-label="Kinds of teams">
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

function Faq() {
    return (
        <section className="section section-surface" id="faq" aria-labelledby="faq-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="faq-title" className="h2">
                        Questions we hear.
                    </h2>
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

export default function Monitor() {
    return (
        <>
            <section className="stage product-hero" aria-labelledby="hero-title">
                <div className="container product-hero-row">
                    <div className="product-hero-text">
                        <div className="tile-head">
                            <Mark brand="monitor" size={52} className="ping-on-load" />
                            <span className="product-name">
                                <Wordmark brand="monitor" />
                            </span>
                        </div>
                        <h1 id="hero-title" className="display">
                            Know the moment a site goes down.
                        </h1>
                        <p className="lead">
                            Websites, APIs, certificates, domains, servers and cron jobs, checked from outside your network around the clock.
                            Every failure is confirmed before anyone is alerted, and your customers see it on your status page.
                        </p>
                        <div className="actions">
                            <a className="btn btn-primary btn-lg" href={buyUrl('monitor')}>
                                Start free
                            </a>
                            <a className="btn btn-lg btn-ghost" href="#plans">
                                See the plans
                            </a>
                        </div>
                        <ul className="hero-facts" aria-label="At a glance">
                            <li>
                                <strong>10</strong> monitors free, for good
                            </li>
                            <li>
                                <strong>30 s</strong> between checks on Pro
                            </li>
                            <li>
                                <strong>8</strong> alert channels
                            </li>
                        </ul>
                    </div>
                    <figure className="product-hero-shot">
                        <Shot name="monitor-overview" alt="The PingOmni Monitor overview: checks today, outages, the next certificate to end, 30-day uptime and response times" eager />
                        <div className="hero-float" aria-hidden="true">
                            <Shot name="monitor-detail" alt="One monitor's uptime and response time" eager sizes="(max-width: 980px) 52vw, 360px" />
                        </div>
                    </figure>
                </div>
            </section>

            <Checks />
            <Flow />
            <Areas />
            <UseCases />
            <MonitorPlans />
            <Faq />

            <section className="section section-bg" aria-labelledby="start-title">
                <div className="container account-band">
                    <Mark brand="monitor" size={56} className="ping-on-load" />
                    <div>
                        <h2 id="start-title" className="h2">
                            Your first monitor takes a minute.
                        </h2>
                        <p className="lead">Create a PingOmni Account, choose the Free plan, and add the address you want watched.</p>
                    </div>
                    <div className="actions">
                        <a className="btn btn-primary btn-lg" href={buyUrl('monitor')}>
                            Start free
                        </a>
                        <a className="btn btn-lg" href={`${ACCOUNT_URL}/login`}>
                            Sign in
                        </a>
                    </div>
                </div>
            </section>

            <Contact title="Talk to us." text="Questions about PingOmni Monitor, a larger plan, or monitoring many customers’ sites? Email us." />
        </>
    );
}
