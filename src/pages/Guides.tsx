import type { ReactNode } from 'react';
import freeradiusBilling from '../guides/freeradius-billing-for-isps.md?raw';
import connectMikrotik from '../guides/connect-mikrotik-to-freeradius.md?raw';
import mikrotikPppoe from '../guides/mikrotik-pppoe-freeradius.md?raw';
import rpzPowerdns from '../guides/rpz-ad-blocking-powerdns.md?raw';
import Icon from '../Icon';
import Guide from '../shared/guide';
import { Contact, useSite } from '../shared/Layout';

// How-to guides: doing a job on an ISP's network, step by step. Articles in src/guides/*.md, drawn by the
// same guide component as the product guides.
export type GuideId = 'freeradius-billing-for-isps' | 'connect-mikrotik-to-freeradius' | 'mikrotik-pppoe-freeradius' | 'rpz-ad-blocking-powerdns';

export const HOWTOS: Record<GuideId, { title: string; lead: string; minutes: number; tested: string; markdown: string; icons: Record<string, string> }> = {
    'freeradius-billing-for-isps': {
        title: 'FreeRADIUS billing for a small ISP: what you need to add',
        lead: 'What FreeRADIUS gives you, what billing has to add, and how to cut off an unpaid customer properly, including the session that is already running.',
        minutes: 10,
        tested: 'FreeRADIUS 3.2 SQL schema',
        markdown: freeradiusBilling,
        icons: {
            'what-freeradius-does-and-does-not-do': 'server',
            'the-tables-you-already-have': 'grid',
            'what-billing-has-to-add': 'billing',
            'stopping-service-when-a-customer-has-not-paid': 'ban',
            'build-it-or-use-a-panel': 'tools',
            'billing-in-radiusone': 'seal',
            'before-you-bill-real-customers': 'check',
        },
    },
    'connect-mikrotik-to-freeradius': {
        title: 'How to connect MikroTik PPPoE to FreeRADIUS',
        lead: 'Install FreeRADIUS, add the router as a client, create a test user with a speed limit, log in over PPPoE and disconnect the session with CoA.',
        minutes: 30,
        tested: 'FreeRADIUS 3.2 · RouterOS 7 · Ubuntu 24.04',
        markdown: connectMikrotik,
        icons: {
            'install-freeradius': 'server',
            'add-the-router-as-a-client': 'plug',
            'create-a-test-user': 'user',
            'open-the-firewall': 'shield',
            'set-up-the-mikrotik': 'settings',
            'check-the-first-login': 'check',
            'disconnect-a-session': 'ban',
            troubleshooting: 'search',
            'where-to-go-next': 'arrow',
        },
    },
    'mikrotik-pppoe-freeradius': {
        title: 'How to set up MikroTik PPPoE subscribers with RadiusOne',
        lead: 'Install RadiusOne, add your MikroTik, create a plan and a client, and disconnect sessions from the portal. RadiusOne runs FreeRADIUS for you.',
        minutes: 30,
        tested: 'RadiusOne 2.1 · RouterOS 7 · Ubuntu 24.04',
        markdown: mikrotikPppoe,
        icons: {
            'install-radiusone': 'server',
            'sign-in-and-set-the-basics': 'lock',
            'add-the-mikrotik-as-a-nas': 'plug',
            'set-up-the-router': 'settings',
            'create-a-service-plan': 'gauge',
            'add-a-client': 'clients',
            'check-the-first-login': 'check',
            'disconnect-suspend-and-renew': 'ban',
            troubleshooting: 'search',
        },
    },
    'rpz-ad-blocking-powerdns': {
        title: 'How to block ads and malware for ISP customers with DNSOne',
        lead: 'Turn on ad-blocking for every customer from the DNSOne console: blocklists, the block policy, false positives, and no blocking for business customers.',
        minutes: 20,
        tested: 'DNSOne 1.5 · PowerDNS Recursor 4.9 · Ubuntu 24.04',
        markdown: rpzPowerdns,
        icons: {
            'let-your-customers-use-the-resolver': 'clients',
            'subscribe-to-blocklists': 'shield',
            'choose-what-a-blocked-name-answers': 'ban',
            'check-a-domain': 'search',
            'fix-false-positives': 'check',
            'business-family-and-the-rest-client-groups': 'home',
            'pause-blocking': 'refresh',
            'test-it-from-a-customer-line': 'gauge',
            'good-to-know': 'message',
        },
    },
};

// Plain links: these articles have no console pages to link to.
const appLink = (href: string, children: ReactNode, key: string) => <a key={key} href={href}>{children}</a>;

export function HowTo({ id }: { id: GuideId }) {
    const { root } = useSite();
    const g = HOWTOS[id];
    return (
        <>
            <section className="stage docs-hero docs-hero-guide" aria-labelledby="hero-title">
                <div className="container docs-hero-inner">
                    <p className="docs-crumbs">
                        <a href={root}>PingOmni</a>
                        <span aria-hidden="true">/</span>
                        <a href={`${root}guides/`}>Guides</a>
                    </p>
                    <h1 id="hero-title" className="display">
                        {g.title}
                    </h1>
                    <p className="lead">{g.lead}</p>
                    <p className="docs-meta">
                        <Icon name="book" />
                        About {g.minutes} minutes · {g.tested}
                    </p>
                </div>
            </section>
            <section className="docs-page">
                <div className="container">
                    <Guide markdown={g.markdown} title="Before you start" icons={g.icons} appLink={appLink} search={false} topSelector=".site-header" />
                </div>
            </section>
            <Contact title="A question about your setup?" text="Tell us about your network and what you are trying to do: we answer within one working day." />
        </>
    );
}

/** /guides/: every how-to guide. */
export function GuidesHub() {
    const { root } = useSite();
    return (
        <>
            <section className="stage docs-hero" aria-labelledby="hero-title">
                <div className="container docs-hero-inner">
                    <p className="docs-crumbs">
                        <a href={root}>PingOmni</a>
                    </p>
                    <h1 id="hero-title" className="display">
                        How-to guides for ISPs
                    </h1>
                    <p className="lead">Step-by-step guides to FreeRADIUS, MikroTik PPPoE, billing and DNS, for people who run their own network.</p>
                </div>
            </section>
            <section className="docs-page">
                <div className="container">
                    <div className="docs-howtos">
                        <h2 className="h3">All guides</h2>
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
            <Contact title="A question about your setup?" text="Tell us about your network and what you are trying to do: we answer within one working day." />
        </>
    );
}
