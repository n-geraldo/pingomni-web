// Community and Pro side by side, on each product's page: one table, the Pro column carries the accent.
import type { ReactNode } from 'react';
import { ACCOUNT_URL, mailto } from '../config';
import Icon from '../Icon';

// A row is a check or a dash, or, with text (a limit), the same words in both columns' place.
export type EditionGroup = { group: string; rows: { feature: string; detail: string; community: boolean | string; pro?: string }[] };

// A price tier: who it is for (a count range), the price, and what its button does.
export type PriceTier = { name: string; range: string; price: string; per?: string; yearly?: string; action: 'code' | 'buy' | 'quote' };

function Tiers({ product, unit, tiers, repoUrl }: { product: string; unit: string; tiers: PriceTier[]; repoUrl: string }) {
    return (
        <div className="tiers-block">
            <h3 className="h3 tiers-title">Prices</h3>
            <p className="small muted tiers-unit">By {unit}.</p>
            <ol className="tiers">
                {tiers.map((t) => (
                    <li className={t.action === 'code' ? 'tier tier-free' : 'tier'} key={t.name}>
                        <span className="tier-name">{t.name}</span>
                        <span className="tier-range">{t.range}</span>
                        <span className="tier-price">
                            {t.price}
                            {t.per && <span className="tier-per"> {t.per}</span>}
                        </span>
                        {t.yearly && <span className="tier-yearly">{t.yearly}</span>}
                        {t.action === 'code' && (
                            <a className="btn btn-sm btn-ghost" href={repoUrl} target="_blank" rel="noopener">
                                <Icon name="code" />
                                Get the code
                            </a>
                        )}
                        {t.action === 'buy' && (
                            <a className="btn btn-sm btn-primary" href={`${ACCOUNT_URL}/buy`}>
                                <Icon name="key" />
                                Buy {t.name}
                            </a>
                        )}
                        {t.action === 'quote' && (
                            <a className="btn btn-sm btn-ghost" href={mailto(`${product} ${t.name}: quote`)}>
                                <Icon name="mail" />
                                Ask for a quote
                            </a>
                        )}
                    </li>
                ))}
            </ol>
        </div>
    );
}

function Has({ yes, edition }: { yes: boolean | string; edition: string }) {
    if (typeof yes === 'string') {
        return <span className="edition-value">{yes}</span>;
    }
    return yes ? (
        <span className="edition-yes">
            <Icon name="check" />
            <span className="sr-only">Included in {edition}</span>
        </span>
    ) : (
        <span className="edition-no">
            <span aria-hidden="true">–</span>
            <span className="sr-only">Not in {edition}</span>
        </span>
    );
}

export function Editions({ product, lead, communityTerms, repoUrl, groups, note, tiers, tierUnit = 'clients' }: {
    product: string;
    lead: ReactNode;
    communityTerms: string;
    repoUrl: string;
    groups: EditionGroup[];
    note: ReactNode;
    /** Optional price tiers, shown under the table. */
    tiers?: PriceTier[];
    tierUnit?: string;
}) {
    return (
        <section className="section section-bg" id="editions" aria-labelledby="editions-title">
            <div className="container">
                <div className="section-head">
                    <h2 id="editions-title" className="h2">
                        Community or Pro.
                    </h2>
                    <p className="lead">{lead}</p>
                </div>
                <div className="editions">
                    <table className="editions-table">
                        <caption className="sr-only">What {product} Community and {product} Pro include</caption>
                        <thead>
                            <tr>
                                <th scope="col" className="edition-feature-head">
                                    <span className="sr-only">Feature</span>
                                </th>
                                <th scope="col">
                                    <span className="edition-name">Community</span>
                                    <span className="edition-terms">{communityTerms}</span>
                                </th>
                                <th scope="col" className="edition-pro">
                                    <span className="edition-name">Pro</span>
                                    <span className="edition-terms">With a licence key</span>
                                </th>
                            </tr>
                        </thead>
                        {groups.map((g) => (
                            <tbody key={g.group}>
                                <tr className="edition-group">
                                    <th scope="colgroup" colSpan={3}>
                                        {g.group}
                                    </th>
                                </tr>
                                {g.rows.map((r) => (
                                    <tr key={r.feature}>
                                        <th scope="row">
                                            <span className="edition-feature">{r.feature}</span>
                                            <span className="edition-detail">{r.detail}</span>
                                        </th>
                                        <td>
                                            <Has yes={r.community} edition="Community" />
                                        </td>
                                        <td className="edition-pro">
                                            <Has yes={r.pro ?? true} edition="Pro" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        ))}
                        <tfoot>
                            <tr>
                                <td />
                                <td>
                                    <a className="btn btn-sm btn-ghost" href={repoUrl} target="_blank" rel="noopener">
                                        <Icon name="code" />
                                        Get the code
                                    </a>
                                </td>
                                <td className="edition-pro">
                                    <a className="btn btn-sm btn-primary" href={`${ACCOUNT_URL}/buy`}>
                                        <Icon name="key" />
                                        Buy Pro
                                    </a>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                    {tiers && <Tiers product={product} unit={tierUnit} tiers={tiers} repoUrl={repoUrl} />}
                    <p className="small muted editions-note">{note}</p>
                </div>
            </div>
        </section>
    );
}
