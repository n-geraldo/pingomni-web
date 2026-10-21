import { useState } from 'react';
import { Mark, Wordmark } from '../brand';
import { DEMO_URL, mailto } from '../config';
import Icon from '../Icon';
import { Contact, Shot } from '../shared/Layout';

const SPEC: { area: string; icon: string; items: string[] }[] = [
    {
        area: 'Subscribers',
        icon: 'clients',
        items: ['PPPoE customers and service plans', 'Static IPs and IP pools', 'Suspension and expiry', 'Daily usage and data caps per plan'],
    },
    {
        area: 'Billing',
        icon: 'billing',
        items: ['Invoices and recurring billing every night', 'Payments with PDF receipts', 'A list of overdue invoices'],
    },
    {
        area: 'Network',
        icon: 'signal',
        items: ['NAS devices with SNMP v1, v2c and v3 monitoring', 'Disconnects over RADIUS CoA or the RouterOS API', 'Live sessions and authentication logs'],
    },
    {
        area: 'Notifications',
        icon: 'message',
        items: ['Customer email (SMTP or Mailgun) and SMS', 'Admin alerts and reports by email or Telegram'],
    },
    {
        area: 'Safety',
        icon: 'shield',
        items: ['Seven operator roles', 'Two-factor sign-in required for privileged roles', 'Nightly encrypted backups to Backblaze B2, Cloudflare R2 or SFTP'],
    },
    {
        area: 'Upkeep',
        icon: 'refresh',
        items: ['Software updates and rollback from inside the portal', 'Your company name and logo on the portal, emails and PDFs'],
    },
];

const REQUIREMENTS: { term: string; text: string }[] = [
    { term: 'Operating system', text: 'Ubuntu 24.04 LTS, server or minimal' },
    { term: 'Server', text: '2 CPU cores, 4 GB RAM and 20 GB disk to start; more database memory for thousands of clients' },
    { term: 'Access', text: 'root, or a user who can run sudo' },
    { term: 'Internet', text: 'Needed during the install' },
    { term: 'Domain', text: 'Optional: a DNS name for a trusted Let’s Encrypt certificate' },
    { term: 'Routers', text: 'MikroTik RouterOS, tested end to end. Cisco IOS XE in Beta' },
];

const INSTALL = 'sudo bash install.sh --domain radius.example.com';

function CopyCommand() {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(INSTALL);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            setCopied(false);
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

// The path a subscriber's login takes, and where RadiusOne sits on it.
function NetworkPath() {
    return (
        <section className="section section-bg" aria-labelledby="path-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="path-title" className="h2">
                        Where it sits in your network.
                    </h2>
                    <p className="lead">
                        RadiusOne writes to the same SQL tables FreeRADIUS already reads. It is never in the login path, so subscribers keep
                        signing in even while the portal is in maintenance.
                    </p>
                </div>
                <div className="path">
                    <ol className="path-chain" aria-label="A subscriber login, from the customer router to the FreeRADIUS SQL tables">
                        <li className="path-node">
                            <span className="path-kind">Customer router</span>
                            <strong>PPPoE login</strong>
                        </li>
                        <li className="path-node">
                            <span className="path-kind">NAS</span>
                            <strong>MikroTik RouterOS</strong>
                            <span className="small faint">Cisco IOS XE in Beta</span>
                        </li>
                        <li className="path-node">
                            <span className="path-kind">RADIUS</span>
                            <strong>FreeRADIUS</strong>
                        </li>
                        <li className="path-node">
                            <span className="path-kind">Database</span>
                            <strong>Standard FreeRADIUS SQL tables</strong>
                        </li>
                    </ol>
                    <div className="path-branch">
                        <div className="path-node path-node-product">
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
                            <span className="badge badge-success">Available</span>
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
                            <a className="btn btn-lg btn-ghost" href={mailto('RadiusOne')}>
                                Email us
                            </a>
                        </div>
                    </div>
                    <figure className="product-hero-shot">
                        <figcaption className="shot-label">Demo data</figcaption>
                        <Shot name="dashboard" alt="The RadiusOne dashboard: online clients, NAS status and top users" eager />
                    </figure>
                </div>
            </section>

            <section className="section section-surface" aria-labelledby="features-title">
                <div className="container">
                    <div className="section-head">
                        <h2 id="features-title" className="h2">
                            Everything the ISP office does.
                        </h2>
                        <p className="lead">From the first PPPoE login to the monthly invoice, in one portal your whole team shares.</p>
                    </div>
                    <div className="spec-layout">
                        <dl className="spec">
                            {SPEC.map((row) => (
                                <div className="spec-row" key={row.area}>
                                    <dt>
                                        <Icon name={row.icon} />
                                        {row.area}
                                    </dt>
                                    <dd>
                                        <ul>
                                            {row.items.map((item) => (
                                                <li key={item}>{item}</li>
                                            ))}
                                        </ul>
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        <figure className="frame spec-aside">
                            <Shot name="clients" alt="Part of the RadiusOne client list: username, plan, status badges, IP and NAS" />
                            <figcaption>The client list, on demo data</figcaption>
                        </figure>
                    </div>
                </div>
            </section>

            <NetworkPath />

            <section className="section section-surface" id="install" aria-labelledby="install-title">
                <div className="container install-layout">
                    <div className="install">
                        <h2 id="install-title" className="h2">
                            One command on a fresh server.
                        </h2>
                        <p className="lead">
                            The installer sets up the portal, the database and FreeRADIUS, connected and secured, with a Let’s Encrypt
                            certificate for your domain.
                        </p>
                        <CopyCommand />
                        <p className="small muted">Updates and rollback happen later from inside the portal.</p>
                    </div>
                    <dl className="rows">
                        {REQUIREMENTS.map((r) => (
                            <div className="row" key={r.term}>
                                <dt>{r.term}</dt>
                                <dd>{r.text}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            <Contact title="See it on sample data." text="The demo runs the real RadiusOne portal. Click through anything; nothing you change is saved." />
        </>
    );
}
