// Community and Pro side by side, on each product's page: one table, the Pro column carries the accent.
import { useState, type ReactNode } from 'react';
import { buyUrl, mailto } from '../config';
import Icon from '../Icon';

// "RadiusOne" -> "radiusone": the product's name in PingOmni Account's links.
const slug = (product: string) => product.toLowerCase() as 'radiusone' | 'dnsone';

// A row is a check or a dash, or, with text (a limit), the same words in both columns' place.
export type EditionGroup = { group: string; rows: { feature: string; detail: string; community: boolean | string; pro?: string }[] };

// A plan: who it is for, its price a month and a year (PingOmni Account's plans; a year costs ten months), what it
// includes beyond the edition table, and what its button does. Free plans have no price.
export type PriceTier = { name: string; range: string; monthly?: number; yearly?: number; points?: string[]; action: 'code' | 'buy' | 'quote' };

const euro = (n: number) => `€${n.toLocaleString('en')}`;

/** The plans as cards side by side, with a monthly/yearly switch: the same layout as PingOmni Monitor's on the home page. */
function Tiers({ product, unit, tiers, repoUrl }: { product: string; unit: string; tiers: PriceTier[]; repoUrl: string }) {
    const [yearly, setYearly] = useState(true);
    return (
        <div className="tiers-block">
            <div className="tiers-head">
                <div>
                    <h3 className="h3 tiers-title">Prices</h3>
                    <p className="small muted tiers-unit">By {unit}.</p>
                </div>
                <div className="period" role="group" aria-label="Billing period">
                    <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>
                        Monthly
                    </button>
                    <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>
                        Yearly <span className="period-save">2 months free</span>
                    </button>
                </div>
            </div>
            <div className="plans" style={{ ['--plans' as string]: tiers.length }}>
                {tiers.map((t, i) => {
                    const price = t.monthly === undefined ? undefined : yearly ? t.yearly ?? t.monthly * 10 : t.monthly;
                    return (
                        <article className="plan" key={t.name} aria-labelledby={`tier-${slug(product)}-${i}`} data-featured={(t.action === 'buy' && i === 1) || undefined}>
                            <h4 id={`tier-${slug(product)}-${i}`} className="plan-name">
                                {t.name}
                            </h4>
                            <p className="plan-price">
                                <strong>{price === undefined ? '€0' : euro(price)}</strong>
                                <span>{price === undefined ? 'forever' : yearly ? '/ year' : '/ month'}</span>
                            </p>
                            <p className="plan-sub small muted">
                                {t.monthly === undefined ? 'Free and open source' : yearly ? `${euro(t.monthly)} a month, paid monthly` : `or ${euro(t.yearly ?? t.monthly * 10)} a year`}
                            </p>
                            <ul className="plan-limits">
                                <li>
                                    <Icon name="check" />
                                    {t.range}
                                </li>
                                {t.points?.map((pt) => (
                                    <li key={pt}>
                                        <Icon name="check" />
                                        {pt}
                                    </li>
                                ))}
                            </ul>
                            {t.action === 'code' && (
                                <a className="btn" href={repoUrl} target="_blank" rel="noopener">
                                    <Icon name="code" />
                                    Get the code
                                </a>
                            )}
                            {t.action === 'buy' && (
                                <a className="btn btn-primary" href={buyUrl(slug(product), t.name, yearly)}>
                                    <Icon name="key" />
                                    Buy {t.name}
                                </a>
                            )}
                            {t.action === 'quote' && (
                                <a className="btn" href={mailto(`${product} ${t.name}: quote`)}>
                                    <Icon name="mail" />
                                    Ask for a quote
                                </a>
                            )}
                        </article>
                    );
                })}
            </div>
            <p className="plans-note small muted">
                Prices in euros; VAT is added where it applies. Buy in PingOmni Account and pay by card through POK’s secure payment page; the
                licence key appears in your account as soon as the payment goes through.
            </p>
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
                                    {/* Non-breaking hyphens: "AGPL-3.0" never splits at its hyphen on a phone. */}
                                    <span className="edition-terms">{communityTerms.replace(/-/g, '\u2011')}</span>
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
                                    <a className="btn btn-sm btn-primary" href={buyUrl(slug(product))}>
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
