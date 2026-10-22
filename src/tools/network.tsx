import { SERVER_LOCATION } from '../config';
import { api, ToolError, type Result } from '../lib/api';
import { locationsFor, mtrFrom, pingFrom, TEST_FROM, traceFrom, type MtrRun, type PingProbe, type TraceOptions, type TraceProbe } from '../lib/globalping';
import { hopsAsPath, mtrVerdict, pingVerdict, PORT_STATE, traceVerdict, type PortState, type Verdict } from '../lib/interpret';
import { CommonPortsNote, PORT_NAMES } from './ports';
import type { Field, Progress, ToolSpec } from './types';
import { Abbr, AsLink, AsPath, Explain, Mono, ms, Place, Rows, Status, Summary, Table, Target, type Next, type Values } from './ui';

// ---------------------------------------------------------------------------
// Shared pieces: where a test runs, and the trace options.
// ---------------------------------------------------------------------------

export const fromField = (label: string): Field => ({
    name: 'from',
    label,
    options: TEST_FROM.map((f) => ({ value: f.label, label: f.label })),
    width: 'medium',
});

export const runsOnFrom = (v: Values) =>
    locationsFor(v.from)
        ? `Runs on Globalping probes (${v.from}), started from your browser. Each test counts against your connection’s free hourly Globalping allowance.`
        : `Runs from our server in ${SERVER_LOCATION}, over IPv4.`;

async function viaGlobalping<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (err) {
        const message = err instanceof Error ? err.message : 'The test failed.';
        throw new ToolError(message, /allowance/.test(message) ? 'limited' : /valid|parameter/i.test(message) ? 'invalid' : 'failed');
    }
}

const PROTOCOL_FIELDS: Field[] = [
    {
        name: 'protocol',
        label: 'Probe type',
        options: [
            { value: 'icmp', label: 'ICMP (like ping)' },
            { value: 'tcp', label: 'TCP to a port' },
        ],
        width: 'medium',
        advanced: true,
        hint: 'TCP probes often get further through firewalls that drop ICMP.',
    },
    { name: 'port', label: 'TCP port', placeholder: '443', width: 'narrow', advanced: true, optional: true, numeric: true, showIf: (v) => v.protocol === 'tcp' },
];

const traceOptions = (v: Values): TraceOptions => (v.protocol === 'tcp' ? { protocol: 'TCP', port: Number(v.port) || 443 } : { protocol: 'ICMP' });
const traceParams = (v: Values): Values => (v.protocol === 'tcp' ? { protocol: 'tcp', port: v.port || '443' } : {});

const HOST_FIELD: Field = { name: 'host', label: 'Hostname or IP address', placeholder: 'example.com', hint: 'A name like example.com, or an address like 93.184.215.14.' };

const connectivityNext = (host: string, skip: string): Next[] =>
    [
        { tool: 'ping', label: `Ping ${host}`, values: { host } },
        { tool: 'traceroute', label: `Trace the route to ${host}`, values: { host } },
        { tool: 'mtr', label: `Measure loss along the route (MTR)`, values: { host } },
        { tool: 'port', label: `Check a TCP port on ${host}`, values: { host, port: '443' } },
    ].filter((n) => n.tool !== skip);

const NotFinished = ({ r }: { r: Result }) =>
    r.partial ? <p className="tool-note">Some probes had not finished after 45 seconds; their rows show what was available.</p> : null;

const probeFailed = (status: string) => status !== 'finished';

// ---------------------------------------------------------------------------
// Ping
// ---------------------------------------------------------------------------

function PingServer({ r }: { r: Result }) {
    const v = pingVerdict(r.sent, r.received);
    const loss = r.sent ? Math.round(((r.sent - r.received) / r.sent) * 100) : 100;
    return (
        <>
            <Summary verdict={v} />
            <Rows
                rows={[
                    ['Target', <Target host={r.host} ip={r.ip} />],
                    ['Packets', `${r.sent} sent, ${r.received} received, ${loss}% loss`],
                    ['Round trip (min / avg / max)', r.received ? `${ms(r.min)} / ${ms(r.avg)} / ${ms(r.max)}` : '—'],
                    [<Abbr short="Jitter (mdev)" long="Mean deviation: how much the round-trip times vary" />, r.received > 1 ? ms(r.mdev) : '—'],
                ]}
            />
            <Table
                head={['Reply', <Abbr short="TTL" long="Time to live: how many more routers the reply could have crossed" />, 'Time']}
                rows={r.replies.map((x: Result) => [`#${x.seq}`, x.ttl, ms(x.ms)])}
                empty="No replies arrived."
                caption="Ping replies"
            />
            {r.addresses?.length > 1 && (
                <p className="tool-note">
                    {r.host} has {r.addresses.length} addresses; we pinged <Mono>{r.ip}</Mono>.
                </p>
            )}
        </>
    );
}

function PingWorld({ r }: { r: Result }) {
    const probes = [...(r.probes as PingProbe[])].sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity));
    const ran = probes.filter((p) => !probeFailed(p.status));
    const answered = ran.filter((p) => p.avg != null);
    const fastest = answered[0];
    const verdict: Verdict = !ran.length
        ? { level: 'failed', label: 'Test failed', title: 'No probe could run the test.' }
        : answered.length === ran.length
          ? { level: 'pass', label: `${answered.length} of ${ran.length} answered`, title: `${r.target} answered ping from every location${fastest ? `; fastest from ${fastest.city} (${ms(fastest.avg)})` : ''}.` }
          : answered.length
            ? { level: 'neutral', label: `${answered.length} of ${ran.length} answered`, title: `${r.target} answered ping from some locations only.`, detail: 'Differences between locations can come from routing, regional filtering, or loss on part of the path. Trace from a location that got no reply to see where responses stop.' }
            : { ...pingVerdict(4, 0), label: 'No replies' };
    return (
        <>
            <Summary verdict={verdict} />
            <Table
                head={['Location', 'Network', 'Loss', 'Minimum', 'Average', 'Maximum']}
                rows={probes.map((p) => [
                    <Place p={p} />,
                    <span className="faint">
                        {p.network} (AS{p.asn})
                    </span>,
                    probeFailed(p.status) ? <Status level="failed">Probe failed</Status> : p.loss == null ? '—' : `${p.loss}%`,
                    ms(p.min),
                    ms(p.avg),
                    ms(p.max),
                ])}
                empty="No probes answered."
                caption="Ping from each location"
            />
            <NotFinished r={r} />
        </>
    );
}

const ping: ToolSpec = {
    id: 'ping',
    action: 'Run ping',
    bestFor: 'Checking whether a host answers and how long the round trip takes from a chosen location.',
    fields: [HOST_FIELD, fromField('Test from')],
    runsOn: runsOnFrom,
    duration: 'usually 3–10 seconds',
    run: async (v) => {
        const locations = locationsFor(v.from);
        return locations ? viaGlobalping(async () => ({ ...(await pingFrom(v.host, locations)), count: locations.reduce((n, l) => n + l.limit, 0) })) : api('ping', { host: v.host });
    },
    render: (r) => (
        <>
            {r.probes ? <PingWorld r={r} /> : <PingServer r={r} />}
            <Explain>
                <p>
                    Ping sends ICMP echo requests and times the replies. The round trip includes both directions, so it is not the one-way delay. Many
                    hosts and firewalls ignore ping on purpose: no reply does not mean a website or service is down.
                </p>
            </Explain>
        </>
    ),
    raw: (r) => (r.probes ? '' : r.raw ?? ''),
    next: (r) => connectivityNext(r.host ?? r.target, 'ping'),
    target: (v) => v.host,
};

// ---------------------------------------------------------------------------
// Traceroute
// ---------------------------------------------------------------------------

const AS_NOTE = 'AS: the network that announces this address, from Team Cymru’s IP-to-ASN data. Routers are sometimes numbered from another network’s addresses, so treat it as a hint.';

type AsNames = Record<string, { name: string } | undefined>;

/** The networks the trace crossed, in order, each linked to the AS lookup. */
function NetworksCrossed({ hops, names }: { hops: { asn: number | null }[]; names?: AsNames }) {
    const path = hopsAsPath(hops);
    if (!path.length) return null;
    return (
        <p className="out-aspath-line">
            <span className="faint">Networks crossed</span> <AsPath path={path} names={names} />
            {names && (
                <span className="out-aspath-names faint">
                    {path
                        .map((asn) => names[asn]?.name)
                        .filter(Boolean)
                        .join(' → ')}
                </span>
            )}
        </p>
    );
}

function TraceServer({ r }: { r: Result }) {
    const verdict = traceVerdict(r.hops, r.reached);
    return (
        <>
            <Summary verdict={verdict} />
            <NetworksCrossed hops={r.hops} names={r.asNames} />
            <Table
                head={['Hop', 'Address', 'Name', <Abbr short="AS" long={AS_NOTE} />, 'Loss', 'Average', 'Best']}
                rows={r.hops.map((h: Result) => [
                    h.hop,
                    h.address ? <Mono>{h.address}</Mono> : <span className="faint">No answer (*)</span>,
                    h.name ?? '—',
                    h.asn ? <AsLink asn={h.asn} name={r.asNames?.[h.asn]?.name} /> : '—',
                    h.address ? `${Math.round(h.loss)}%` : '—',
                    ms(h.avg),
                    ms(h.best),
                ])}
                empty="No hops were recorded."
                caption="Hops on the route"
            />
        </>
    );
}

function TraceWorld({ r }: { r: Result }) {
    const traces = r.traces as TraceProbe[];
    const reachedBy = (t: TraceProbe) => t.hops.some((h) => h.address && h.address === t.resolved);
    const done = traces.filter((t) => !probeFailed(t.status));
    const reached = done.filter(reachedBy).length;
    return (
        <>
            <Summary
                verdict={{
                    level: done.length ? (reached === done.length ? 'pass' : 'neutral') : 'failed',
                    label: done.length ? `Reached from ${reached} of ${done.length}` : 'Test failed',
                    title: `Routes to ${r.target} from ${traces.length} ${traces.length === 1 ? 'location' : 'locations'}.`,
                    detail: reached < done.length ? 'Where the destination did not answer, it or a firewall may drop trace probes; open a route to see where responses stop.' : undefined,
                }}
            />
            <div className="out-routes">
                {traces.map((t, i) => {
                    const last = [...t.hops].reverse().find((h) => h.avg != null);
                    const ok = reachedBy(t);
                    return (
                        <details className="out-route" key={i} open={traces.length === 1}>
                            <summary>
                                <Place p={t} />
                                <span className="faint out-route-net">
                                    {t.network} (AS{t.asn})
                                </span>
                                <span className="out-route-meta">
                                    {t.hops.length} hops · {ms(last?.avg)}
                                </span>
                                {probeFailed(t.status) ? (
                                    <Status level="failed">Probe failed</Status>
                                ) : (
                                    <Status level={ok ? 'pass' : 'neutral'}>{ok ? 'Destination answered' : 'Destination did not answer'}</Status>
                                )}
                            </summary>
                            <Table
                                head={['Hop', 'Address', 'Name', 'Time']}
                                rows={t.hops.map((h, n) => [n + 1, h.address ? <Mono>{h.address}</Mono> : <span className="faint">No answer (*)</span>, h.name ?? '—', ms(h.avg)])}
                                empty="No hops were recorded."
                                compact
                                caption={`Route from ${t.city}`}
                            />
                        </details>
                    );
                })}
            </div>
            <NotFinished r={r} />
        </>
    );
}

const traceroute: ToolSpec = {
    id: 'traceroute',
    action: 'Run traceroute',
    bestFor: 'Seeing the path to a destination and where responses stop.',
    fields: [HOST_FIELD, fromField('Trace from'), ...PROTOCOL_FIELDS],
    runsOn: runsOnFrom,
    duration: 'usually 10–30 seconds',
    run: async (v) => {
        const locations = locationsFor(v.from);
        return locations
            ? viaGlobalping(async () => ({ ...(await traceFrom(v.host, locations, traceOptions(v))), count: locations.reduce((n, l) => n + Math.ceil(l.limit / 2), 0) }))
            : api('traceroute', { host: v.host, ...traceParams(v) });
    },
    render: (r) => (
        <>
            {r.traces ? <TraceWorld r={r} /> : <TraceServer r={r} />}
            <Explain>
                <p>
                    Each row is a router on the way, found by sending probes that expire one hop further each time. “No answer (*)” means that router did
                    not reply to the probe, which many do by design while still forwarding traffic normally.
                </p>
                <p>
                    A trace that stops before the destination shows where probes stop getting answers, not necessarily where traffic stops. Times can
                    jump on one hop and drop again: routers answer probes slowly, at low priority.
                </p>
            </Explain>
        </>
    ),
    next: (r) => connectivityNext(r.host ?? r.target, 'traceroute'),
    target: (v) => v.host,
};

// ---------------------------------------------------------------------------
// MTR
// ---------------------------------------------------------------------------

function MtrTable({ hops, from, names }: { hops: MtrRun['hops']; from?: number; names?: AsNames }) {
    return (
        <Table
            head={['Hop', 'Host', <Abbr short="AS" long={AS_NOTE} />, 'Loss', 'Sent', 'Average', 'Best', 'Worst', <Abbr short="StDev" long="Standard deviation: how much the times vary" />]}
            rows={hops.map((h, n) => [
                from !== undefined && n >= from ? <strong>{n + 1}</strong> : n + 1,
                h.address ? (
                    <span className="out-host">
                        {h.name && <span>{h.name}</span>}
                        <Mono>{h.address}</Mono>
                    </span>
                ) : (
                    <span className="faint">No answer (*)</span>
                ),
                h.asn ? <AsLink asn={h.asn} name={names?.[h.asn]?.name} /> : '—',
                h.address ? `${Math.round(h.loss)}%` : '—',
                h.sent,
                ms(h.avg),
                ms(h.best),
                ms(h.worst),
                ms(h.stdev),
            ])}
            empty="No hops were recorded."
            compact
            caption="Loss and delay per hop"
        />
    );
}

function MtrView({ r }: { r: Result }) {
    const runs = r.runs as MtrRun[];
    if (runs.length === 1 && !runs[0].place) {
        const v = mtrVerdict(runs[0].hops);
        return (
            <>
                <Summary verdict={v} />
                <NetworksCrossed hops={runs[0].hops} names={r.asNames} />
                <MtrTable hops={runs[0].hops} from={v.from} names={r.asNames} />
            </>
        );
    }
    return (
        <>
            <p className="out-summary">
                MTR to <Target host={r.target} ip={r.resolved} /> from {runs.length} {runs.length === 1 ? 'location' : 'locations'}
            </p>
            <div className="out-routes">
                {runs.map((run, i) => {
                    const v = mtrVerdict(run.hops);
                    const failed = run.place && probeFailed(run.place.status);
                    return (
                        <details className="out-route" key={i} open={runs.length === 1}>
                            <summary>
                                {run.place && <Place p={run.place} />}
                                {run.place && (
                                    <span className="faint out-route-net">
                                        {run.place.network} (AS{run.place.asn})
                                    </span>
                                )}
                                <span className="out-route-meta">{run.hops.length} hops</span>
                                {failed ? <Status level="failed">Probe failed</Status> : <Status level={v.level}>{v.label}</Status>}
                            </summary>
                            {!failed && <p className="out-route-verdict">{v.title}</p>}
                            <NetworksCrossed hops={run.hops} />
                            <MtrTable hops={run.hops} from={v.from} />
                        </details>
                    );
                })}
            </div>
            <NotFinished r={r} />
        </>
    );
}

const mtr: ToolSpec = {
    id: 'mtr',
    action: 'Run MTR',
    bestFor: 'Finding recurring loss or delay along a route, hop by hop.',
    fields: [HOST_FIELD, fromField('Run from'), ...PROTOCOL_FIELDS],
    runsOn: runsOnFrom,
    duration: 'usually 10–40 seconds',
    run: async (v) => {
        const locations = locationsFor(v.from);
        return locations
            ? viaGlobalping(async () => ({ ...(await mtrFrom(v.host, locations, traceOptions(v))), count: locations.reduce((n, l) => n + Math.ceil(l.limit / 2), 0) }))
            : api('mtr', { host: v.host, ...traceParams(v) });
    },
    render: (r) => (
        <>
            <MtrView r={r} />
            <Explain>
                <p>
                    MTR combines traceroute and ping: it sends several probes to every hop and shows how many were lost and how long the rest took.
                </p>
                <p>
                    Read loss from the destination backwards. Loss on a middle hop that the hops after it do not show is that router limiting its own
                    replies (ICMP rate limiting), not loss of real traffic. Loss that starts at one hop and stays to the end shows where trouble
                    begins. Five probes per hop is a short sample: one lost probe already reads as 20%.
                </p>
            </Explain>
        </>
    ),
    next: (r) => connectivityNext(r.target, 'mtr'),
    target: (v) => v.host,
};

// ---------------------------------------------------------------------------
// Port check
// ---------------------------------------------------------------------------

function OnePort({ r }: { r: Result }) {
    const st = PORT_STATE[r.state as PortState];
    const name = PORT_NAMES.get(r.port);
    return (
        <>
            <Summary
                verdict={{
                    level: st.level,
                    label: st.label,
                    title: `TCP port ${r.port} on ${r.host}: ${st.label.toLowerCase()}${r.state === 'open' ? ` in ${ms(r.ms)}` : ''}.`,
                    detail: r.state === 'error' ? `${st.meaning} ${r.error ?? ''}` : st.meaning,
                }}
            />
            <Rows
                rows={[
                    ['Target', <Target host={r.host} ip={r.ip} />],
                    ['Port', <>{r.port}/tcp{name && <span className="faint"> · usually {name}</span>}</>],
                    ['Result', <Status level={st.level}>{st.label}</Status>],
                    ['Connect time', r.state === 'open' ? ms(r.ms) : '—'],
                ]}
            />
        </>
    );
}

function AllPorts({ r }: { r: Result }) {
    const count = (s: PortState) => r.results.filter((x: Result) => x.state === s).length;
    const open = count('open');
    return (
        <>
            <Summary
                verdict={{
                    level: 'neutral',
                    label: `${open} of ${r.results.length} connected`,
                    title: `${open} of the ${r.results.length} common ports on ${r.host} accepted a connection.`,
                    detail: `${count('closed')} refused, ${count('filtered')} gave no response within 4 seconds${count('error') ? `, ${count('error')} could not be tested` : ''}.`,
                }}
            />
            <Table
                head={['Port', 'Usual service', 'Result', 'Time']}
                rows={r.results.map((x: Result) => {
                    const st = PORT_STATE[x.state as PortState];
                    return [<Mono>{x.port}</Mono>, PORT_NAMES.get(x.port) ?? '—', <Status level={st.level}>{st.label}</Status>, x.state === 'error' ? x.error : ms(x.ms)];
                })}
                empty=""
                compact
                caption="Common ports"
            />
            <CommonPortsNote />
        </>
    );
}

const port: ToolSpec = {
    id: 'port',
    action: 'Check port',
    bestFor: 'Checking whether a TCP service is reachable from our server.',
    fields: [HOST_FIELD, { name: 'port', label: 'TCP port', placeholder: '443', width: 'narrow', numeric: true, hint: '1 to 65535' }],
    runsOn: () => `Runs from our server in ${SERVER_LOCATION}: one TCP connection attempt, 4 second timeout. It cannot test UDP services.`,
    duration: 'up to 5 seconds',
    run: (v) => {
        if (!/^\d{1,5}$/.test(v.port) || Number(v.port) < 1 || Number(v.port) > 65535) throw new ToolError('Enter a port from 1 to 65535.', 'invalid');
        return api('port', { host: v.host, port: v.port });
    },
    render: (r) => (
        <>
            {r.results ? <AllPorts r={r} /> : <OnePort r={r} />}
            <Explain>
                <p>
                    Connected: the host completed a TCP handshake. Refused: it answered with a reset, so nothing is listening there or a firewall
                    rejects it. No response: nothing came back within 4 seconds; that is often a firewall silently dropping the connection, but a
                    host that is down looks the same.
                </p>
                <p>The check is made from our server. Firewalls that allow only certain sources can give a different answer to you.</p>
            </Explain>
        </>
    ),
    next: (r) => [
        ...(r.port === 25 ? [{ tool: 'smtp', label: `Test the mail server on ${r.host}`, values: { host: r.host } }] : []),
        ...connectivityNext(r.host, 'port'),
    ],
    target: (v) => v.host,
};

// ---------------------------------------------------------------------------
// Reverse lookup
// ---------------------------------------------------------------------------

function Reverse({ r }: { r: Result }) {
    const o = r.lookup.outcome as string;
    const fwd = r.forward as Result[];
    let verdict: Verdict;
    if (o === 'found') {
        const all = fwd.every((f) => f.matches);
        verdict = all
            ? { level: 'pass', label: 'Forward-confirmed', title: `${r.ip} points to ${r.names.join(', ')}, which resolves back to the same address.` }
            : {
                  level: 'issue',
                  label: 'Does not match',
                  title: `${r.ip} points to ${r.names.join(', ')}, but ${fwd.length > 1 ? 'not every name resolves' : 'that name does not resolve'} back to ${r.ip}.`,
                  detail: 'Mail servers in particular are expected to have matching reverse and forward DNS (FCrDNS); many receivers reject or penalise mail when they do not match.',
              };
    } else if (o === 'nxdomain' || o === 'nodata') {
        verdict = { level: 'neutral', label: 'No PTR record', title: `${r.ip} has no reverse DNS name.`, detail: 'The owner of the address block (usually the ISP or hosting provider) sets PTR records, not the domain owner.' };
    } else {
        verdict = { level: 'failed', label: r.lookup.status, title: 'The reverse lookup failed, so we cannot tell whether a PTR record exists.' };
    }
    return (
        <>
            <Summary verdict={verdict} />
            <Rows
                rows={[
                    ['IP address', <Mono>{r.ip}</Mono>],
                    ['Queried name', <Mono>{r.arpa}</Mono>],
                    ['Hostnames (PTR)', r.names.length ? r.names.map((n: string) => <Mono key={n}>{n}</Mono>) : <span className="faint">None</span>],
                ]}
            />
            {fwd.length > 0 && (
                <Table
                    head={['Hostname', 'Resolves to', 'Back to this IP?']}
                    rows={fwd.map((f) => [
                        <Mono>{f.name}</Mono>,
                        f.addresses.length ? <Mono>{f.addresses.join(', ')}</Mono> : <span className="faint">{f.outcome === 'nxdomain' ? 'Name does not exist' : 'No address'}</span>,
                        <Status level={f.matches ? 'pass' : 'issue'}>{f.matches ? 'Yes' : 'No'}</Status>,
                    ])}
                    empty=""
                    caption="Forward check"
                />
            )}
            <Explain>
                <p>
                    A PTR record maps an address back to a name; forward DNS (A and AAAA records) maps a name to addresses. They are separate records
                    managed by different people, so they only agree when both are set up to match.
                </p>
            </Explain>
        </>
    );
}

const reverse: ToolSpec = {
    id: 'reverse',
    action: 'Look up PTR',
    bestFor: 'Finding the hostname an IP address points to, and whether it points back.',
    fields: [{ name: 'ip', label: 'IP address', placeholder: '8.8.8.8', hint: 'IPv4 or IPv6, public addresses only.' }],
    runsOn: () => `Runs from our server in ${SERVER_LOCATION}, through its DNS resolver.`,
    run: (v) => api('reverse', { ip: v.ip }),
    render: (r) => <Reverse r={r} />,
    raw: (r) => r.lookup?.raw ?? '',
    next: (r) => [
        ...r.names.slice(0, 1).map((n: string) => ({ tool: 'dns', label: `Look up the DNS records of ${n}`, values: { name: n, type: 'A' } })),
        { tool: 'whois', label: `Who is ${r.ip} registered to?`, values: { query: r.ip } },
        ...(r.ip.includes('.') ? [{ tool: 'blacklist', label: `Check ${r.ip} against reputation lists`, values: { host: r.ip } }] : []),
    ],
    target: (v) => v.ip,
};

// ---------------------------------------------------------------------------
// Proxy checker
// ---------------------------------------------------------------------------

const proxy: ToolSpec = {
    id: 'proxy',
    action: 'Check my connection',
    bestFor: 'Seeing which proxy-related headers our server receives from your connection.',
    fields: [],
    runsOn: () => 'Reads the request your browser sends to our server. Nothing else is tested.',
    run: () => api('proxy', {}),
    idle: <p className="out-empty">Shows the address our server sees and any proxy-related headers in your request.</p>,
    render: (r) => {
        const headers = Object.entries(r.headers as Record<string, string>);
        return (
            <>
                <Summary
                    verdict={{
                        level: 'neutral',
                        label: headers.length ? 'Headers found' : 'No headers found',
                        title: headers.length ? 'Proxy-related headers detected in your request.' : 'No proxy-related headers detected in your request.',
                        detail: headers.length
                            ? 'A proxy, VPN, antivirus or corporate gateway on your side may have added them. Any software can set these headers, so they are evidence, not verified identity.'
                            : 'Most VPNs and many proxies add no headers at all, so this does not show that your connection is direct.',
                    }}
                />
                <Rows
                    rows={[
                        ['Your address, as our server sees it', <Mono>{r.ip}</Mono>],
                        ['Its hostname (PTR)', r.hostname ?? <span className="faint">None</span>],
                        [
                            'Path to our server',
                            r.viaCloudflare ? 'Through Cloudflare, which this site uses. Cloudflare’s own headers are left out of the list below.' : 'Direct to our server',
                        ],
                    ]}
                />
                <Table head={['Header', 'Value']} rows={headers.map(([k, v]) => [k, <Mono>{v}</Mono>])} empty="No proxy-related headers in your request." caption="Proxy-related headers" />
                {r.hostnameHint && <p className="tool-note">Your address’s hostname contains a word often used by proxy or VPN providers. That is a hint, not proof.</p>}
            </>
        );
    },
    next: (r) => [
        { tool: 'reverse', label: `Reverse lookup of ${r.ip}`, values: { ip: r.ip } },
        { tool: 'whois', label: `Who is ${r.ip} registered to?`, values: { query: r.ip } },
        ...(r.ip.includes('.') ? [{ tool: 'blacklist', label: `Check ${r.ip} against reputation lists`, values: { host: r.ip } }] : []),
    ],
};

// ---------------------------------------------------------------------------
// Bandwidth meter
// ---------------------------------------------------------------------------

// Download test data from our server and time it, with live progress.
async function measureBandwidth(light: boolean, progress: (p: Progress) => void): Promise<Result> {
    const latencies: number[] = [];
    for (let i = 0; i < 3; i++) {
        progress({ text: 'Measuring the round trip to our server…' });
        const t = performance.now();
        await api('myip', {});
        latencies.push(performance.now() - t);
    }
    const download = async (mb: number) => {
        let res: Response;
        try {
            res = await fetch(`/api/?tool=bandwidth&mb=${mb}&t=${Date.now()}`, { cache: 'no-store' });
        } catch {
            throw new ToolError('Could not reach our server. Check your connection and try again.');
        }
        if (!res.ok || !res.body) {
            const data = await res.json().catch(() => null);
            throw new ToolError(data?.error ?? 'The download test could not start.', res.status === 429 ? 'limited' : 'failed', Number(res.headers.get('Retry-After')) || undefined);
        }
        const reader = res.body.getReader();
        const total = mb * 1024 * 1024;
        const start = performance.now();
        let got = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            got += value.length;
            const secs = (performance.now() - start) / 1000;
            if (secs > 0.05) progress({ text: `Downloading ${mb} MB…`, pct: Math.min(100, (got / total) * 100), value: `${((got * 8) / secs / 1e6).toFixed(1)} Mbit/s` });
        }
        const secs = (performance.now() - start) / 1000;
        return { bytes: got, secs, mbps: (got * 8) / secs / 1e6 };
    };
    const first = await download(5);
    // A fast connection finishes 5 MB too quickly to measure well; time a bigger download instead.
    const run = !light && first.secs < 2 ? await download(25) : first;
    const used = first.bytes + (run === first ? 0 : run.bytes);
    return {
        via: 'browser',
        ...run,
        used,
        latency: Math.min(...latencies),
        settings: run === first ? '5 MB download' : '5 MB warm-up, then a 25 MB download that is timed',
    };
}

const bandwidth: ToolSpec = {
    id: 'bandwidth',
    action: 'Start download test',
    bestFor: 'Estimating download speed between your device and our server.',
    fields: [
        {
            name: 'size',
            label: 'Test size',
            options: [
                { value: 'standard', label: 'Standard: 5 MB, plus 25 MB on fast connections' },
                { value: 'light', label: 'Light: 5 MB only' },
            ],
            width: 'medium',
            hint: 'Uses up to 30 MB of data (standard) or 5 MB (light). Mind metered or mobile plans.',
        },
    ],
    runsOn: () => `Runs in your browser: it downloads random data from our server in ${SERVER_LOCATION}, through Cloudflare, and times it.`,
    duration: 'usually 5–20 seconds',
    run: (v, progress) => measureBandwidth(v.size === 'light', progress),
    render: (r) => (
        <>
            <div className="out-speed">
                <span className="out-speed-value">{r.mbps.toFixed(1)}</span>
                <span className="out-speed-unit">Mbit/s download from our server</span>
            </div>
            <Rows
                rows={[
                    ['Timed download', `${(r.bytes / 1024 / 1024).toFixed(1)} MB in ${r.secs.toFixed(2)} s`],
                    ['Total data used', `${(r.used / 1024 / 1024).toFixed(1)} MB`],
                    ['Round trip to our server', ms(r.latency)],
                ]}
            />
            <p className="tool-note">
                This measures one download from one server, over the route between it and you. Wi-Fi, your device, other traffic on your connection and
                our server’s own capacity all affect it, so it is an estimate, not a full test of your internet plan.
            </p>
        </>
    ),
};

export const NETWORK_SPECS: ToolSpec[] = [ping, traceroute, mtr, port, reverse, proxy, bandwidth];

