import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Mark, Wordmark } from '../brand';
import { DEMO_URL, REPO_URL, mailto } from '../config';
import Icon from '../Icon';
import { copyText } from '../lib/copy';
import { Contact, Shot } from '../shared/Layout';

const REQUIREMENTS: { term: string; text: string }[] = [
    { term: 'Operating system', text: 'Ubuntu 24.04 LTS, server or minimal' },
    { term: 'Server', text: '2 CPU cores, 4 GB RAM and 20 GB disk to start; more database memory for thousands of clients' },
    { term: 'Access', text: 'Root, or a user with sudo rights' },
    { term: 'Internet', text: 'Required during installation' },
    { term: 'Domain', text: 'Optional: a DNS name for a trusted Let’s Encrypt certificate' },
    { term: 'Routers', text: 'MikroTik RouterOS, tested end to end; Cisco IOS XE in Beta' },
];

const INSTALL = 'sudo bash install.sh --domain radius.example.com';

// The installer's own step lines (install.sh), in order.
const INSTALL_STEPS = [
    'Checking the server',
    'Installing packages (nginx, PHP 8.3, MariaDB, FreeRADIUS)',
    'Generating keys and passwords',
    'Creating the database',
    'Setting up the application',
    'Creating the application tables',
    'Connecting FreeRADIUS to the database',
    'Configuring HTTPS and the web server',
    'Scheduling jobs and backups',
    'Creating the first administrator',
];

// Situations RadiusOne is built for, each tied to what the product really does. No customer names or numbers.
const USE_CASES: { id: string; icon: string; tab: string; title: string; scene: string; how: string[] }[] = [
    {
        id: 'wisp',
        icon: 'signal',
        tab: 'Wireless ISP',
        title: 'A wireless ISP with towers and MikroTik routers',
        scene: 'Customers connect over PPPoE through RouterOS NAS devices spread across several sites.',
        how: [
            'Each NAS is added once, with its RADIUS secret and SNMP settings',
            'Suspend or expire a customer, and RadiusOne ends the session over RADIUS CoA',
            'The monitoring page shows which NAS devices are up and how many sessions each carries',
        ],
    },
    {
        id: 'office',
        icon: 'billing',
        tab: 'Monthly billing',
        title: 'An ISP office that bills every month',
        scene: 'Office staff spend the first days of every month writing invoices and chasing late payers.',
        how: [
            'Recurring invoices are generated automatically every night',
            'Every payment gets a PDF receipt; overdue invoices sit in their own list',
            'Customers receive their notices by email or SMS',
        ],
    },
    {
        id: 'field',
        icon: 'phone',
        tab: 'Field technician',
        title: 'A technician at the customer’s door',
        scene: 'The customer says the internet is down. The technician has a phone and five minutes.',
        how: [
            'Search by name, phone, IP or MAC from a phone',
            'See whether the session is online, which NAS carries it and its latest usage',
            'Fix it on the spot, under a role limited to what support needs',
        ],
    },
    {
        id: 'migrate',
        icon: 'swap',
        tab: 'Leaving raw SQL',
        title: 'Moving off hand-edited FreeRADIUS',
        scene: 'The network runs on FreeRADIUS, but every change means hand-written SQL, and only one person knows how.',
        how: [
            'RadiusOne works directly on the standard FreeRADIUS SQL tables, so there is nothing to migrate',
            'Authentication keeps working even while the portal is in maintenance',
            'Every operator gets their own login, and privileged roles require two-factor sign-in',
        ],
    },
];

// Small, static recreations of portal screens. Sample data only; they illustrate, the demo is the real thing.
type Status = 'online' | 'paid' | 'up' | 'overdue' | 'suspended' | 'due' | 'expired';
const STATUS_TONE: Record<Status, string> = {
    online: 'ok',
    paid: 'ok',
    up: 'ok',
    overdue: 'warn',
    suspended: 'warn',
    due: 'plain',
    expired: 'plain',
};

function Pill({ status }: { status: Status }) {
    return <span className={`mock-pill mock-pill-${STATUS_TONE[status]}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

function ClientsMock() {
    const rows: [string, string, Status, string][] = [
        ['home-1042', 'Fiber 100', 'online', '10.20.4.17'],
        ['home-1187', 'Wireless 30', 'online', '10.20.6.102'],
        ['office-2210', 'Business 200', 'online', '10.30.1.9'],
        ['home-1311', 'Fiber 50', 'suspended', ''],
        ['home-0954', 'Wireless 30', 'expired', ''],
    ];
    return (
        <div className="mock mock-table" aria-hidden="true">
            <div className="mock-search">
                <Icon name="search" />
                Search by name, phone, IP or MAC
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Plan</th>
                        <th>Status</th>
                        <th className="mock-hide-sm">IP</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(([user, plan, status, ip]) => (
                        <tr key={user}>
                            <td className="mock-mono">{user}</td>
                            <td>{plan}</td>
                            <td>
                                <Pill status={status} />
                            </td>
                            <td className="mock-mono mock-hide-sm">{ip || <span className="mock-faint">none</span>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function InvoicesMock() {
    const rows: [string, string, Status][] = [
        ['INV-0412', '25.00', 'paid'],
        ['INV-0413', '40.00', 'overdue'],
        ['INV-0414', '25.00', 'due'],
    ];
    return (
        <div className="mock mock-list" aria-hidden="true">
            {rows.map(([no, amount, status]) => (
                <div className="mock-line" key={no}>
                    <span className="mock-mono">{no}</span>
                    <span className="mock-amount mock-mono">{amount}</span>
                    <Pill status={status} />
                </div>
            ))}
            <div className="mock-note">
                <Icon name="refresh" />
                Next run tonight
            </div>
        </div>
    );
}

function NasMock() {
    const rows: [string, number][] = [
        ['Tower North', 412],
        ['Tower East', 288],
        ['Office core', 37],
    ];
    const max = 412;
    return (
        <div className="mock mock-list" aria-hidden="true">
            {rows.map(([name, sessions]) => (
                <div className="mock-nas" key={name}>
                    <span className="mock-dot" />
                    <span className="mock-nas-name">{name}</span>
                    <span className="mock-mono mock-faint">{sessions} sessions</span>
                    <span className="mock-bar">
                        <span style={{ width: `${(sessions / max) * 100}%` }} />
                    </span>
                </div>
            ))}
        </div>
    );
}

function MessagesMock() {
    return (
        <div className="mock mock-messages" aria-hidden="true">
            <div className="mock-bubble">
                <span className="mock-bubble-head">
                    <Icon name="message" />
                    SMS to the customer
                </span>
                Invoice INV-0413 is overdue. Pay by 5 November to keep your service running.
            </div>
            <div className="mock-bubble mock-bubble-alt">
                <span className="mock-bubble-head">
                    <Icon name="activity" />
                    Alert to the NOC
                </span>
                Tower East is back up: 288 sessions.
            </div>
        </div>
    );
}

function SafetyMock() {
    return (
        <div className="mock mock-safety" aria-hidden="true">
            <div className="mock-roles">
                {['superadmin', 'admin', 'NOC', 'support', 'billing', 'security', 'view'].map((r) => (
                    <span key={r}>{r}</span>
                ))}
            </div>
            <div className="mock-otp">
                <span className="mock-otp-label">Two-factor code</span>
                <span className="mock-otp-boxes">
                    {['4', '8', '1', '0', '', ''].map((d, i) => (
                        <span key={i} data-empty={d === '' || undefined}>
                            {d}
                        </span>
                    ))}
                </span>
            </div>
        </div>
    );
}

function UpkeepMock() {
    return (
        <div className="mock mock-upkeep" aria-hidden="true">
            <div className="mock-update">
                <span className="mock-update-icon">
                    <Icon name="refresh" />
                </span>
                <span>
                    <strong>A new version is ready</strong>
                    <span className="mock-faint">A backup runs before every update</span>
                </span>
                <span className="mock-btns">
                    <span className="mock-btn mock-btn-primary">Update</span>
                    <span className="mock-btn">Roll back</span>
                </span>
            </div>
            <div className="mock-brand">
                <span className="mock-logo">Your ISP</span>
                <span className="mock-faint">on the portal, emails and PDF invoices</span>
            </div>
        </div>
    );
}

const MODULES: { area: string; icon: string; title: string; items: string[]; mock: ReactNode; wide?: boolean; full?: boolean }[] = [
    {
        area: 'subscribers',
        icon: 'clients',
        title: 'Subscribers',
        items: ['PPPoE customers and service plans', 'Static IPs and IP pools', 'Suspension and expiry', 'Daily usage and data caps per plan'],
        mock: <ClientsMock />,
        wide: true,
    },
    {
        area: 'billing',
        icon: 'billing',
        title: 'Billing',
        items: ['Recurring invoices generated every night', 'Payments with PDF receipts', 'Overdue invoices in one list'],
        mock: <InvoicesMock />,
    },
    {
        area: 'network',
        icon: 'server',
        title: 'Network',
        items: ['SNMP v1, v2c and v3 monitoring', 'Disconnects over RADIUS CoA or the RouterOS API', 'Live sessions and authentication logs'],
        mock: <NasMock />,
    },
    {
        area: 'notifications',
        icon: 'message',
        title: 'Notifications',
        items: ['Customer email (SMTP or Mailgun) and SMS', 'Admin alerts and reports by email or Telegram'],
        mock: <MessagesMock />,
    },
    {
        area: 'safety',
        icon: 'shield',
        title: 'Safety',
        items: ['Seven operator roles', 'Two-factor sign-in for privileged roles', 'Nightly encrypted backups to Backblaze B2, Cloudflare R2 or SFTP'],
        mock: <SafetyMock />,
    },
    {
        area: 'upkeep',
        icon: 'refresh',
        title: 'Upkeep',
        items: ['Software updates and rollback from inside the portal', 'Your company name and logo on the portal, emails and PDFs'],
        mock: <UpkeepMock />,
        full: true,
    },
];

function Modules() {
    return (
        <section className="section section-surface" aria-labelledby="features-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="features-title" className="h2">
                        Everything the ISP office does.
                    </h2>
                    <p className="lead">From the first PPPoE login to the monthly invoice, in one portal your whole team shares.</p>
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
                        Where RadiusOne fits.
                    </h2>
                    <p className="lead">Four everyday situations in an ISP, and what RadiusOne does in each.</p>
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
        if (await copyText(INSTALL)) {
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
                {INSTALL}
            </code>
            <button type="button" className="icon-btn" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the install command'}>
                <Icon name={copied ? 'check' : 'copy'} />
            </button>
            <span className="sr-only" role="status">
                {copied ? 'Copied to clipboard' : ''}
            </span>
        </div>
    );
}

// What the installer prints, step by step, ending on the portal address.
function Terminal() {
    return (
        <figure className="terminal">
            <div className="terminal-bar" aria-hidden="true">
                <span />
                <span />
                <span />
                <span className="terminal-title">root@radius: ~</span>
            </div>
            <pre className="terminal-body" aria-label="What the installer prints">
                <span className="t-cmd">
                    <span className="t-faint">$ </span>
                    {INSTALL}
                </span>
                {INSTALL_STEPS.map((step) => (
                    <span key={step}>
                        <span className="t-step">==&gt; </span>
                        {step}
                    </span>
                ))}
                <span className="t-done">==&gt; RadiusOne is installed.</span>
                <span>
                    <span className="t-faint">{'    '}Portal: </span>https://radius.example.com
                </span>
            </pre>
        </figure>
    );
}

const PATH: { kind: string; name: string; note?: string; icon: string }[] = [
    { kind: 'Customer router', name: 'PPPoE login', icon: 'home' },
    { kind: 'NAS', name: 'MikroTik RouterOS', note: 'Cisco IOS XE in Beta', icon: 'server' },
    { kind: 'RADIUS', name: 'FreeRADIUS', icon: 'key' },
    { kind: 'Database', name: 'Standard FreeRADIUS SQL tables', icon: 'grid' },
];

// The path a subscriber's login takes, and where RadiusOne sits on it. One login travels the chain on a loop.
function NetworkPath() {
    return (
        <section className="section section-bg" aria-labelledby="path-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="path-title" className="h2">
                        Where it sits in your network.
                    </h2>
                    <p className="lead">
                        RadiusOne writes to the same SQL tables FreeRADIUS already reads. It never sits in the login path, so subscribers keep
                        connecting even while the portal is down for maintenance.
                    </p>
                </div>
                <div className="path">
                    <ol className="path-chain" aria-label="A subscriber login, from the customer router to the FreeRADIUS SQL tables">
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
                                <Mark brand="radiusone" size={28} />
                            </span>
                            <span className="path-kind">Beside the login path</span>
                            <strong>
                                <Wordmark brand="radiusone" />
                            </strong>
                            <span className="small faint">Reads and writes the SQL tables. Talks to the NAS for CoA disconnects and SNMP monitoring.</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default function RadiusOne() {
    return (
        <>
            <section className="stage product-hero" aria-labelledby="hero-title">
                <div className="container product-hero-row">
                    <div className="product-hero-text">
                        <div className="tile-head">
                            <Mark brand="radiusone" size={52} className="ping-on-load" />
                            <span className="product-name">
                                <Wordmark brand="radiusone" />
                            </span>
                        </div>
                        <h1 id="hero-title" className="display">
                            The ISP back office on FreeRADIUS.
                        </h1>
                        <p className="lead">
                            Subscribers, service plans, billing and NAS monitoring in one portal. One command installs it on your own Ubuntu
                            server.
                        </p>
                        <div className="actions">
                            <a className="btn btn-primary btn-lg" href={DEMO_URL} target="_blank" rel="noopener">
                                Try the demo
                                <Icon name="external" />
                            </a>
                            <a className="btn btn-lg btn-ghost" href={REPO_URL} target="_blank" rel="noopener">
                                <Icon name="code" />
                                Get the code
                            </a>
                            <a className="btn btn-lg btn-ghost" href={mailto('RadiusOne')}>
                                Email us
                            </a>
                        </div>
                    </div>
                    <figure className="product-hero-shot">
                        <figcaption className="shot-label">Demo data</figcaption>
                        <Shot name="dashboard" alt="The RadiusOne dashboard: online clients, NAS status and top users" eager />
                        <div className="hero-float" aria-hidden="true">
                            <Shot name="clients" alt="" eager />
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
                            One command on a fresh server.
                        </h2>
                        <p className="lead">
                            The installer sets up the portal, the database and FreeRADIUS, already connected and secured, with a Let’s
                            Encrypt certificate for your domain.
                        </p>
                        <p className="small muted">
                            Get the code and the installer from the{' '}
                            <a href={REPO_URL} target="_blank" rel="noopener">
                                RadiusOne repository on GitHub
                            </a>
                            , then run it from the project folder:
                        </p>
                        <CopyCommand />
                        <p className="small muted">Later updates and rollbacks run from inside the portal.</p>
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

            <Contact demo title="See it on sample data." text="The demo runs the real RadiusOne portal on sample data. Click through anything; nothing you change is saved." />
        </>
    );
}
