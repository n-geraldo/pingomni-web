import { Mark, Wordmark } from '../brand';
import { DEMO_URL, mailto } from '../config';
import Icon from '../Icon';
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
                        Tell me when it's ready
                    </a>
                </article>
            ))}
        </div>
    );
}

// Situations RadiusOne is built for, each tied to what the product really does. No customer names or numbers.
const USE_CASES: { title: string; scene: string; how: string[] }[] = [
    {
        title: 'A wireless ISP with towers and MikroTik routers',
        scene: 'Customers connect over PPPoE through RouterOS NAS devices spread across several sites.',
        how: [
            'Each NAS is added once, with its RADIUS secret and SNMP settings',
            'Suspend or expire a customer and the session is cut over RADIUS CoA',
            'The monitoring page shows which NAS is up and how many sessions it carries',
        ],
    },
    {
        title: 'An ISP office that bills every month',
        scene: 'Office staff spend the start of each month making invoices and chasing who has not paid.',
        how: [
            'Invoices and recurring billing run every night on their own',
            'Payments get PDF receipts; overdue invoices have their own list',
            'Customers get their notices by email or SMS',
        ],
    },
    {
        title: 'A technician at the customer’s door',
        scene: 'The customer says the internet is down. The technician has a phone and five minutes.',
        how: [
            'Search by name, phone, IP or MAC from a phone',
            'See whether the session is online, which NAS it is on and its last usage',
            'Make the change on the spot, under a role that only allows what support needs',
        ],
    },
    {
        title: 'Moving off hand-edited FreeRADIUS',
        scene: 'The network runs on FreeRADIUS, but every change means SQL by hand and one person who knows how.',
        how: [
            'RadiusOne works on the standard FreeRADIUS SQL tables, so nothing is migrated away',
            'Authentication keeps working even while the portal is in maintenance',
            'Every operator has their own login, and privileged roles need two-factor sign-in',
        ],
    },
];

function UseCases() {
    const { root } = useSite();
    return (
        <section className="section section-surface" id="use-cases" aria-labelledby="use-cases-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="use-cases-title" className="h2">
                        Where RadiusOne fits.
                    </h2>
                    <p className="lead">Four everyday situations in an ISP, and what RadiusOne does in each.</p>
                </div>
                <ol className="cases">
                    {USE_CASES.map((c) => (
                        <li className="case" key={c.title}>
                            <div className="case-scene">
                                <h3 className="h3">{c.title}</h3>
                                <p>{c.scene}</p>
                            </div>
                            <ul className="case-how">
                                {c.how.map((line) => (
                                    <li key={line}>
                                        <Icon name="check" />
                                        {line}
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ol>
                <p className="section-foot">
                    <a className="text-link" href={`${root}radiusone/`}>
                        Everything RadiusOne does
                        <Icon name="arrow" />
                    </a>
                </p>
            </div>
        </section>
    );
}

const COMMITMENTS: { term: string; text: string }[] = [
    {
        term: 'Self-hosted',
        text: 'RadiusOne installs on your own Ubuntu server and your subscriber data stays there. Every PingOmni product will work the same way.',
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
                        RadiusOne is the first. TicketOne for support tickets and DNSOne for DNS come next.
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
                        <h1 id="hero-title" className="display">
                            Software that ISPs run on.
                        </h1>
                        <p className="lead">Self-hosted tools for ISPs and network operators, one product for each job.</p>
                    </div>
                    <Launcher />
                </div>
            </section>
            <UseCases />
            <About />
            <Contact title="Try RadiusOne, then talk to us." text="The demo runs the real portal on sample data. Click through anything; nothing you change is saved." />
        </>
    );
}
