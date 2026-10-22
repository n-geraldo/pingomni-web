import type { ReactNode } from 'react';
import { api, type Result } from '../lib/api';
import { RPKI_STATE, routeVerdict } from '../lib/interpret';
import type { Field, ToolSpec } from './types';
import { AsLink, AsPath, date, Explain, Mono, PrefixLink, Rows, Status, Summary, Table, type Next } from './ui';

// BGP and AS tools. Everything comes from public routing data (RIPEstat, PeeringDB, Team Cymru) through our API,
// so results show how the internet sees a network, not a measurement from our server.

const RESOURCE_FIELD: Field = {
    name: 'resource',
    label: 'IP address, prefix or hostname',
    placeholder: '8.8.8.0/24',
    hint: 'An address like 1.1.1.1, a prefix like 193.0.0.0/21, or a name like example.com.',
};

const RUNS_ON = 'Our server asks RIPEstat, RIPE NCC’s routing data: what its RIS route collectors, fed by hundreds of networks worldwide, see now.';

/** A prefix is not a host, so it is not carried into ping or traceroute. */
const hostTarget = (resource: string) => (resource.includes('/') ? '' : resource);

// ---------------------------------------------------------------------------
// AS lookup
// ---------------------------------------------------------------------------

type Neighbour = { asn: number; name: string | null; country: string | null; v4: number; v6: number };

function Neighbours({ title, rows, empty }: { title: string; rows: Neighbour[]; empty: string }) {
    return (
        <div className="out-group">
            <h3 className="out-group-title">{title}</h3>
            <Table
                head={['AS', 'Name', 'Seen over']}
                rows={rows.map((n) => [
                    <AsLink asn={n.asn} name={n.name} />,
                    <span>
                        {n.name ?? '—'} {n.country && <span className="faint">{n.country}</span>}
                    </span>,
                    [n.v4 > 0 && 'IPv4', n.v6 > 0 && 'IPv6'].filter(Boolean).join(', ') || '—',
                ])}
                empty={empty}
                compact
                caption={title}
            />
        </div>
    );
}

function PeeringDb({ r }: { r: Result }) {
    const p = r.peeringdb;
    if (!p) {
        return (
            <p className="tool-note">
                {r.peeringdbFailed
                    ? 'PeeringDB did not answer, so network details are missing. Try again in a minute.'
                    : `AS${r.asn} has no PeeringDB record. Networks that do not peer at internet exchanges often have none.`}
            </p>
        );
    }
    // Networks fill in PeeringDB themselves; fields they left empty are not shown.
    const rows: [string, ReactNode][] = [
        ['Name', p.aka ? `${p.name} (${p.aka})` : p.name],
        ['Network type', p.type],
        ['Traffic', p.traffic],
        ['Traffic ratio', p.ratio],
        ['Scope', p.scope],
        ['Peering policy', p.policy],
        ['IRR as-set', p.irrAsSet && <Mono>{p.irrAsSet}</Mono>],
        ['Present at', `${p.ixCount ?? 0} internet exchanges, ${p.facCount ?? 0} facilities`],
        [
            'Record',
            <>
                <a className="out-link" href={`https://www.peeringdb.com/net/${p.id}`} target="_blank" rel="noopener noreferrer">
                    peeringdb.com/net/{p.id}
                </a>
                {p.website && (
                    <>
                        {' · '}
                        <a className="out-link" href={p.website} target="_blank" rel="noopener noreferrer nofollow">
                            {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                    </>
                )}
                {p.updated && <span className="faint"> · updated {date(p.updated)}</span>}
            </>,
        ],
    ];
    return (
        <div className="out-group">
            <h3 className="out-group-title">PeeringDB</h3>
            <Rows rows={rows.filter(([, v]) => v)} />
        </div>
    );
}

function Prefixes({ r }: { r: Result }) {
    const list: string[] = r.prefixes.list;
    const total = r.prefixes.v4 + r.prefixes.v6;
    if (!total) return null;
    return (
        <details className="out-raw" open={total <= 24}>
            <summary>
                Announced prefixes ({r.prefixes.v4.toLocaleString('en')} IPv4, {r.prefixes.v6.toLocaleString('en')} IPv6)
            </summary>
            <ul className="out-prefixes">
                {list.map((p) => (
                    <li key={p}>
                        <PrefixLink prefix={p} />
                    </li>
                ))}
            </ul>
            {list.length < total && <p className="tool-note">Showing the first {list.length.toLocaleString('en')} of {total.toLocaleString('en')}.</p>}
        </details>
    );
}

function AsnView({ r }: { r: Result }) {
    if (r.special) {
        return <Summary verdict={{ level: 'neutral', label: 'Special-purpose', title: `AS${r.asn} is not a public network.`, detail: r.special }} />;
    }
    const total = r.prefixes.v4 + r.prefixes.v6;
    const counts = r.neighbours?.counts;
    return (
        <>
            <Summary
                verdict={
                    r.announced
                        ? { level: 'pass', label: 'Announced', title: `AS${r.asn}${r.holder ? ` (${r.holder})` : ''} announces ${total.toLocaleString('en')} ${total === 1 ? 'prefix' : 'prefixes'}.` }
                        : {
                              level: 'neutral',
                              label: 'Not announced',
                              title: `AS${r.asn} announces no routes right now.`,
                              detail: r.holder
                                  ? 'It is registered, but RIS route collectors see no prefixes from it. It may be unused, used only inside a network, or its address space may be announced by another AS.'
                                  : 'RIPEstat knows no holder for it, so it may not be assigned to anyone.',
                          }
                }
            />
            <Rows
                rows={[
                    ['AS number', <Mono>AS{r.asn}</Mono>],
                    ['Holder', r.holder],
                    ['Prefixes', total ? `${r.prefixes.v4.toLocaleString('en')} IPv4, ${r.prefixes.v6.toLocaleString('en')} IPv6` : 'None announced'],
                    ['Neighbours', counts ? `${counts.left} upstream side, ${counts.right} downstream side${counts.uncertain ? `, ${counts.uncertain} unclear` : ''}` : '—'],
                    ['Registry', r.block?.desc],
                ]}
            />
            <PeeringDb r={r} />
            {r.neighbours && (
                <>
                    <Neighbours title="Upstreams and peers" rows={r.neighbours.left} empty="None seen: no network appears before this AS in collected paths." />
                    <Neighbours title="Customers (downstream)" rows={r.neighbours.right} empty="None seen: no network appears after this AS in collected paths." />
                    {(counts?.left > 25 || counts?.right > 25) && <p className="tool-note">Showing the 25 most often seen on each side.</p>}
                </>
            )}
            <Prefixes r={r} />
        </>
    );
}

const asn: ToolSpec = {
    id: 'asn',
    action: 'Look up AS',
    bestFor: 'Finding who runs an autonomous system, what it announces, and who it connects to.',
    fields: [{ name: 'asn', label: 'AS number', placeholder: 'AS15169', hint: 'With or without “AS”: AS15169 or 15169.' }],
    runsOn: () => `${RUNS_ON} Network details come from PeeringDB.`,
    duration: 'usually 1–5 seconds',
    run: (v) => api('asn', { asn: v.asn }),
    render: (r) => (
        <>
            <AsnView r={r} />
            <Explain>
                <p>
                    Neighbours are read from the AS paths RIS collects. A network seen just before this AS in a path (towards the collector) is on the
                    upstream side: usually a transit provider or a peer. One seen just after it (towards the origin) is on the downstream side: usually a
                    customer. Paths only show what reaches the collectors, so private peering and some customers can be missing.
                </p>
                <p>PeeringDB is filled in by networks themselves. Missing or old details there are common and not errors.</p>
            </Explain>
        </>
    ),
    next: (r) =>
        r.prefixes?.list?.length
            ? [
                  { tool: 'prefix', label: `Look up the route for ${r.prefixes.list[0]}`, values: { resource: r.prefixes.list[0] } },
                  { tool: 'lg', label: `See how networks reach ${r.prefixes.list[0]}`, values: { resource: r.prefixes.list[0] } },
              ]
            : [],
};

// ---------------------------------------------------------------------------
// Prefix lookup
// ---------------------------------------------------------------------------

function PrefixView({ r }: { r: Result }) {
    const v = routeVerdict(r as Parameters<typeof routeVerdict>[0]);
    if (!r.announced) {
        return (
            <>
                <Summary verdict={v} />
                <Rows rows={[['Looked up', <Mono>{r.query}</Mono>], ...(r.host ? [['Hostname', r.host] as [string, string]] : []), ['Registry', r.block?.desc]]} />
            </>
        );
    }
    const paths = r.paths;
    return (
        <>
            <Summary verdict={v} />
            <Rows
                rows={[
                    ['Announced prefix', <Mono>{r.prefix}</Mono>],
                    ...(r.prefix !== r.query ? [['Looked up', <>{r.host && `${r.host} `}<Mono>{r.query}</Mono></>] as [string, ReactNode]] : []),
                    [
                        r.origins.length > 1 ? 'Origin ASes' : 'Origin AS',
                        <span className="out-stack">
                            {r.origins.map((o: Result) => (
                                <span key={o.asn}>
                                    <AsLink asn={o.asn} name={o.holder} /> {o.holder && <span className="faint">{o.holder}</span>}
                                </span>
                            ))}
                        </span>,
                    ],
                    [
                        'RPKI',
                        <span className="out-stack">
                            {r.rpki.map((x: Result) => {
                                const st = RPKI_STATE[x.status] ?? { level: 'neutral', label: 'Not checked', meaning: 'RIPEstat did not return a result.' };
                                return (
                                    <span key={x.asn}>
                                        <Status level={st.level}>{st.label}</Status> {r.rpki.length > 1 && <>AS{x.asn}: </>}
                                        <span className="faint">{st.meaning}</span>
                                    </span>
                                );
                            })}
                        </span>,
                    ],
                    ['Visibility', r.visibility ? `Seen by ${r.visibility.seeing} of ${r.visibility.total} RIS peers` : '—'],
                    ['First seen', r.firstSeen ? `${date(r.firstSeen.time)}, from AS${r.firstSeen.origin}` : '—'],
                    ['Covering prefixes', r.lessSpecifics.length ? <span className="out-stack">{r.lessSpecifics.map((l: Result) => <span key={l.prefix}><PrefixLink prefix={l.prefix} /> <span className="faint">from AS{l.origin}</span></span>)}</span> : 'None'],
                    ['More specific', r.moreSpecificsTotal ? `${r.moreSpecificsTotal} more specific ${r.moreSpecificsTotal === 1 ? 'prefix' : 'prefixes'} inside it` : 'None'],
                    ['Registry', r.block?.desc],
                ]}
            />
            {r.rpki.some((x: Result) => x.roas.length) && (
                <div className="out-group">
                    <h3 className="out-group-title">ROAs that cover it</h3>
                    <Table
                        head={['Prefix', 'Max length', 'Allowed origin', 'Matches this route']}
                        rows={r.rpki.flatMap((x: Result) => x.roas).map((roa: Result) => [<Mono>{roa.prefix}</Mono>, `/${roa.maxLength}`, <AsLink asn={roa.asn} />, roa.validity === 'valid' ? 'Yes' : 'No'])}
                        empty=""
                        compact
                        caption="ROAs"
                    />
                </div>
            )}
            {paths && (
                <>
                    <div className="out-group">
                        <h3 className="out-group-title">Upstreams of the origin</h3>
                        <Table
                            head={['AS', 'Name', 'Paths through it']}
                            rows={paths.upstreams.map((u: Result) => [<AsLink asn={u.asn} name={u.name} />, u.name ?? '—', `${u.paths} of ${paths.total}`])}
                            empty="Every path ends at the origin itself: the collectors peer with it directly."
                            compact
                            caption="Networks just before the origin"
                        />
                    </div>
                    <div className="out-group">
                        <h3 className="out-group-title">
                            Most common AS paths <span className="faint">({paths.unique} different paths from {paths.total} RIS peers)</span>
                        </h3>
                        <Table
                            head={['AS path (collector peer → origin)', 'Peers']}
                            rows={paths.top.map((p: Result) => [<AsPath path={p.path} />, p.peers])}
                            empty="No paths were collected."
                            compact
                            caption="AS paths"
                        />
                    </div>
                </>
            )}
            {r.moreSpecifics.length > 0 && (
                <details className="out-raw">
                    <summary>More specific prefixes ({r.moreSpecificsTotal})</summary>
                    <ul className="out-prefixes">
                        {r.moreSpecifics.map((m: Result) => (
                            <li key={m.prefix}>
                                <PrefixLink prefix={m.prefix} /> <span className="faint">AS{m.origin}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </>
    );
}

const prefix: ToolSpec = {
    id: 'prefix',
    action: 'Look up route',
    bestFor: 'Finding which network announces an address, whether RPKI allows it, and how the internet reaches it.',
    fields: [RESOURCE_FIELD],
    runsOn: () => `${RUNS_ON} RPKI comes from RIPEstat’s validator.`,
    duration: 'usually 1–5 seconds',
    run: (v) => api('prefix', { resource: v.resource }),
    render: (r) => (
        <>
            <PrefixView r={r} />
            <Explain>
                <p>
                    An address is reached through the most specific prefix that covers it. The origin AS is the network that announces that prefix; the
                    upstreams are the networks that pass it on, as seen in the paths RIS collects.
                </p>
                <p>
                    RPKI lets the holder of address space publish which AS may announce it (a ROA). “Invalid” routes are dropped by networks that
                    validate RPKI. “No ROA” routes are still accepted everywhere, but nothing stops another network from announcing them.
                </p>
            </Explain>
        </>
    ),
    next: (r) =>
        [
            ...(r.announced ? [{ tool: 'lg', label: `See each network’s path to ${r.prefix}`, values: { resource: r.prefix } }] : []),
            ...(r.origins ?? []).slice(0, 1).map((o: Result) => ({ tool: 'asn', label: `Look up the origin, AS${o.asn}`, values: { asn: `AS${o.asn}` } })),
            ...(r.announced && !r.query.includes('/') ? [{ tool: 'traceroute', label: `Trace the route to ${r.host ?? r.query}`, values: { host: r.host ?? r.query } }] : []),
            ...(!r.query.includes('/') ? [{ tool: 'whois', label: `Who is ${r.query} registered to?`, values: { query: r.query } }] : []),
        ] as Next[],
    target: (v) => hostTarget(v.resource),
};

// ---------------------------------------------------------------------------
// Looking glass
// ---------------------------------------------------------------------------

type Peer = { peer: string; path: number[]; prefix: string; origin: string; nextHop: string; communities: string; updated: string | null };

function LookingGlass({ r }: { r: Result }) {
    const collectors = r.collectors as { rrc: string; location: string; peers: Peer[] }[];
    if (!r.peers) {
        return (
            <Summary
                verdict={{
                    level: 'neutral',
                    label: 'No routes',
                    title: `No RIS route collector has a route to ${r.query}.`,
                    detail: 'Nothing in the global routing table covers it right now. Prefix lookup shows whether it was announced before.',
                }}
            />
        );
    }
    const lengths = collectors.flatMap((c) => c.peers.map((p) => p.path.length));
    const shortest = Math.min(...lengths);
    return (
        <>
            <Summary
                verdict={{
                    level: 'neutral',
                    label: `${r.peers} routes`,
                    title: `${r.prefix} as seen by ${r.peers} networks at ${collectors.length} route collectors.`,
                    detail: `AS paths are ${shortest} to ${Math.max(...lengths)} networks long. Open a collector to see each network’s path.`,
                }}
            />
            <div className="out-routes">
                {collectors.map((c) => (
                    <details className="out-route" key={c.rrc} open={collectors.length === 1}>
                        <summary>
                            <span className="out-place">
                                <strong>{c.location}</strong> <span className="faint">{c.rrc}</span>
                            </span>
                            <span className="out-route-meta">{c.peers.length} {c.peers.length === 1 ? 'peer' : 'peers'}</span>
                        </summary>
                        <Table
                            head={['Peer', 'AS path (peer → origin)', 'Next hop', 'Communities', 'Since']}
                            rows={c.peers.map((p) => [
                                <Mono>{p.peer}</Mono>,
                                <AsPath path={p.path} />,
                                <Mono>{p.nextHop}</Mono>,
                                p.communities ? <span className="out-communities">{p.communities}</span> : '—',
                                p.updated ? date(p.updated) : '—',
                            ])}
                            empty="No routes at this collector."
                            compact
                            caption={`Routes at ${c.rrc}, ${c.location}`}
                        />
                    </details>
                ))}
            </div>
        </>
    );
}

const lg: ToolSpec = {
    id: 'lg',
    action: 'Show routes',
    bestFor: 'Seeing the BGP paths that networks around the world use to reach a prefix right now.',
    fields: [RESOURCE_FIELD],
    runsOn: () => RUNS_ON,
    duration: 'usually 1–4 seconds',
    run: (v) => api('lg', { resource: v.resource }),
    render: (r) => (
        <>
            <LookingGlass r={r} />
            <Explain>
                <p>
                    RIPE NCC runs route collectors at internet exchanges around the world. Each one takes a full BGP feed from the networks it peers with,
                    and shows the best route each of those networks has to this prefix. The AS path reads from the peer’s own network (first) to the
                    origin (last).
                </p>
                <p>
                    These are routes that other networks have, not the path from our server or from your connection. Run a traceroute to see the path
                    traffic actually takes from one place.
                </p>
            </Explain>
        </>
    ),
    next: (r) =>
        [
            ...(r.prefix ? [{ tool: 'prefix', label: `Origin, RPKI and visibility of ${r.prefix}`, values: { resource: r.prefix } }] : []),
            ...(!r.query.includes('/') ? [{ tool: 'traceroute', label: `Trace the route to ${r.host ?? r.query}`, values: { host: r.host ?? r.query } }] : []),
        ] as Next[],
    target: (v) => hostTarget(v.resource),
};

export const BGP_SPECS: ToolSpec[] = [asn, prefix, lg];
