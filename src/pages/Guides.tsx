import type { ReactNode } from 'react';
import mikrotikPppoe from '../guides/mikrotik-pppoe-freeradius.md?raw';
import rpzPowerdns from '../guides/rpz-ad-blocking-powerdns.md?raw';
import Icon from '../Icon';
import Guide from '../shared/guide';
import { useSite } from '../shared/Layout';

// How-to guides: doing a job with RadiusOne or DNSOne, step by step. Articles in src/guides/*.md, drawn by the
// same guide component as the product guides.
export type GuideId = 'mikrotik-pppoe-freeradius' | 'rpz-ad-blocking-powerdns';

export const HOWTOS: Record<GuideId, { title: string; lead: string; minutes: number; tested: string; markdown: string; icons: Record<string, string> }> = {
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
                        <a href={`${root}docs/#guides`}>Guides</a>
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
        </>
    );
}
