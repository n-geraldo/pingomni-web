import privacy from '../legal/privacy.md?raw';
import terms from '../legal/terms.md?raw';
import Icon from '../Icon';
import Guide from '../shared/guide';
import { useSite } from '../shared/Layout';

// The Terms and Conditions and the Privacy Policy: articles in src/legal/*.md, drawn by the guide component (contents
// that follow the reader, one card per section). PingOmni Account's sign-up links here.
export type LegalId = 'terms' | 'privacy';

const DOCS: Record<LegalId, { title: string; lead: string; markdown: string; intro: string }> = {
    terms: {
        title: 'Terms and Conditions',
        lead: 'The terms for buying and using RadiusOne Pro, DNSOne Pro and PingOmni Monitor plans, including your right of withdrawal.',
        markdown: terms,
        intro: 'Who sells',
    },
    privacy: {
        title: 'Privacy Policy',
        lead: 'What personal data PingOmni collects, why, who receives it, how long it is kept, and your rights.',
        markdown: privacy,
        intro: 'Who is responsible',
    },
};

export const LEGAL_VERSION = 'Version 2.0 · in force from 29 October 2026';

export default function Legal({ id }: { id: LegalId }) {
    const { root } = useSite();
    const d = DOCS[id];
    return (
        <>
            <section className="stage docs-hero docs-hero-guide" aria-labelledby="hero-title">
                <div className="container docs-hero-inner">
                    <p className="docs-crumbs">
                        <a href={root}>PingOmni</a>
                        <span aria-hidden="true">/</span>
                        <span>Legal</span>
                    </p>
                    <h1 id="hero-title" className="display">
                        {d.title}
                    </h1>
                    <p className="lead">{d.lead}</p>
                    <p className="docs-meta">
                        <Icon name="book" />
                        {LEGAL_VERSION}
                    </p>
                </div>
            </section>
            <section className="docs-page">
                <div className="container">
                    <Guide markdown={d.markdown} title={d.intro} search={false} topSelector=".site-header" />
                </div>
            </section>
        </>
    );
}
