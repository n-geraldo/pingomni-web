// Community and Pro side by side, on each product's page: one table, the Pro column carries the accent.
import type { ReactNode } from 'react';
import { ACCOUNT_URL } from '../config';
import Icon from '../Icon';

export type EditionGroup = { group: string; rows: { feature: string; detail: string; community: boolean }[] };

function Has({ yes, edition }: { yes: boolean; edition: string }) {
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

export function Editions({ product, lead, communityTerms, repoUrl, groups, note }: {
    product: string;
    lead: ReactNode;
    communityTerms: string;
    repoUrl: string;
    groups: EditionGroup[];
    note: ReactNode;
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
                                            <Has yes edition="Pro" />
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
                    <p className="small muted editions-note">{note}</p>
                </div>
            </div>
        </section>
    );
}
