import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Icon from '../Icon';
import { rangeToMasks, subnet } from '../lib/ipcalc';
import { TOOL_LIST, TOOL_PAGES, type ToolGroup } from '../lib/toolList';
import { useSite } from '../shared/Layout';

// ---------------------------------------------------------------------------
// The tools: two groups, each tool a form that runs on our server (/api/) or in the browser.
// ---------------------------------------------------------------------------

type Field = { name: string; label: string; placeholder: string; options?: string[]; width?: 'narrow' };
type Result = Record<string, any>;
type ToolSpec = {
    id: string;
    fields: Field[];
    run?: (values: Record<string, string>) => Promise<Result>;
    render: (r: Result) => ReactNode;
    note?: string;
};
type Tool = ToolSpec & (typeof TOOL_LIST)[number];

class ToolError extends Error {}

async function api(tool: string, params: Record<string, string>): Promise<Result> {
    const query = new URLSearchParams({ tool, ...params });
    let res: Response;
    try {
        res = await fetch(`/api/?${query}`, { headers: { Accept: 'application/json' } });
    } catch {
        throw new ToolError('Could not reach our server. Check your connection and try again.');
    }
    const data = await res.json().catch(() => null);
    if (!data || !data.ok) throw new ToolError(data?.error ?? `The server answered ${res.status}.`);
    return data;
}

const ms = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)} ms`);
const date = (v?: string) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function Rows({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <dl className="out-rows">
            {rows.map(([k, v]) => (
                <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v ?? '—'}</dd>
                </div>
            ))}
        </dl>
    );
}

function Table({
    head,
    rows,
    empty,
    compact = false,
    stack = false,
}: {
    head: string[];
    rows: ReactNode[][];
    empty: string;
    compact?: boolean;
    stack?: boolean;
}) {
    if (!rows.length) return <p className="out-empty">{empty}</p>;
    return (
        <div className="out-table-wrap">
            <table className={['out-table', compact && 'out-table-compact', stack && 'out-table-stack'].filter(Boolean).join(' ')}>
                <thead>
                    <tr>
                        {head.map((h) => (
                            <th key={h}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i}>
                            {r.map((c, j) => (
                                <td key={j}>{c}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Status({ level, children }: { level: 'ok' | 'warning' | 'error' | 'neutral'; children: ReactNode }) {
    const cls = { ok: 'badge-success', warning: 'badge-warning', error: 'badge-danger', neutral: 'badge-neutral' }[level];
    return <span className={`badge ${cls}`}>{children}</span>;
}

function Notes({ notes }: { notes: { level: 'ok' | 'warning' | 'error'; text: string }[] }) {
    return (
        <ul className="out-notes">
            {notes.map((n) => (
                <li key={n.text}>
                    <Status level={n.level}>{n.level === 'ok' ? 'Good' : n.level === 'warning' ? 'Check' : 'Problem'}</Status>
                    <span>{n.text}</span>
                </li>
            ))}
        </ul>
    );
}

const Mono = ({ children }: { children: ReactNode }) => <code className="out-mono">{children}</code>;

/** "example.com 93.184.216.34", or just the address when that is what was entered. */
const Target = ({ host, ip }: { host: string; ip: string }) => (host === ip ? <Mono>{ip}</Mono> : <>{host} <Mono>{ip}</Mono></>);
const Record_ = ({ text }: { text: string }) => <pre className="out-record">{text}</pre>;

function Contacts({ contacts }: { contacts: Result[] }) {
    const shown = contacts.filter((c) => c.fn || c.org || c.email || c.tel || c.address);
    if (!shown.length) return <p className="out-empty">The registry publishes no contact details (most hide them for privacy).</p>;
    return (
        <Table
            head={['Role', 'Name', 'Email', 'Phone', 'Address']}
            rows={shown.map((c) => [c.roles.join(', ') || '—', c.fn ?? c.org ?? '—', c.email ?? '—', c.tel ?? '—', c.address ?? '—'])}
            empty=""
        />
    );
}

// Bandwidth: download test data from our server and time it, with live progress.
async function measureBandwidth(onProgress: (mbps: number, pct: number) => void): Promise<Result> {
    const latencies: number[] = [];
    for (let i = 0; i < 3; i++) {
        const t = performance.now();
        await api('myip', {});
        latencies.push(performance.now() - t);
    }
    const download = async (mb: number) => {
        const res = await fetch(`/api/?tool=bandwidth&mb=${mb}&t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok || !res.body) {
            const data = await res.json().catch(() => null);
            throw new ToolError(data?.error ?? 'The download test could not start.');
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
            if (secs > 0.05) onProgress((got * 8) / secs / 1e6, Math.min(100, (got / total) * 100));
        }
        const secs = (performance.now() - start) / 1000;
        return { bytes: got, secs, mbps: (got * 8) / secs / 1e6 };
    };
    let run = await download(5);
    if (run.secs < 2) run = await download(25);
    return { ...run, latency: Math.min(...latencies) };
}

const SPECS: ToolSpec[] = [
    {
        id: 'ping',
        fields: [{ name: 'host', label: 'Host or IP', placeholder: 'example.com' }],
        run: (v) => api('ping', v),
        render: (r) => (
            <>
                <div className="out-summary">
                    <Status level={r.received === 0 ? 'error' : r.received < r.sent ? 'warning' : 'ok'}>
                        {r.received} of {r.sent} replies
                    </Status>
                    <span>
                        <Target host={r.host} ip={r.ip} />
                    </span>
                </div>
                <Rows rows={[['Minimum', ms(r.min)], ['Average', ms(r.avg)], ['Maximum', ms(r.max)]]} />
                <Table
                    head={['Reply', 'TTL', 'Time']}
                    rows={r.replies.map((x: Result) => [`#${x.seq}`, x.ttl, ms(x.ms)])}
                    empty="No replies. The host may block ping (ICMP) or be offline."
                />
            </>
        ),
    },
    {
        id: 'traceroute',
        fields: [{ name: 'host', label: 'Host or IP', placeholder: 'example.com' }],
        run: (v) => api('traceroute', v),
        note: 'A trace can take up to half a minute.',
        render: (r) => (
            <>
                <div className="out-summary">
                    <span>
                        From our server to <Target host={r.host} ip={r.ip} />, {r.hops.length} hops
                    </span>
                </div>
                <Table
                    head={['Hop', 'Address', 'Name', 'Loss', 'Average', 'Best']}
                    rows={r.hops.map((h: Result) => [
                        h.hop,
                        h.host ? <Mono>{h.host}</Mono> : <span className="faint">No answer</span>,
                        h.name && h.name !== h.host ? h.name : '—',
                        `${h.loss}%`,
                        ms(h.avg),
                        ms(h.best),
                    ])}
                    empty="No hops were recorded."
                />
            </>
        ),
    },
    {
        id: 'port',
        fields: [
            { name: 'host', label: 'Host or IP', placeholder: 'example.com' },
            { name: 'port', label: 'Port', placeholder: '443', width: 'narrow' },
        ],
        run: (v) => api('port', v),
        render: (r) => (r.results ? <AllPorts r={r} /> : <OnePort r={r} />),
    },
    {
        id: 'reverse',
        fields: [{ name: 'ip', label: 'IP address', placeholder: '8.8.8.8' }],
        run: (v) => api('reverse', v),
        render: (r) => (
            <Rows
                rows={[
                    ['IP address', <Mono>{r.ip}</Mono>],
                    ['Hostname (PTR)', r.hostname ?? <span className="faint">No PTR record</span>],
                    [
                        'Forward check',
                        r.hostname ? (
                            <Status level={r.confirmed ? 'ok' : 'warning'}>{r.confirmed ? 'Hostname points back to this IP' : 'Hostname does not point back'}</Status>
                        ) : (
                            '—'
                        ),
                    ],
                ]}
            />
        ),
    },
    {
        id: 'proxy',
        fields: [],
        run: () => api('proxy', {}),
        render: (r) => {
            const headers = Object.entries(r.headers as Record<string, string>);
            return (
                <>
                    <div className="out-summary out-summary-big">
                        <Status level={r.detected ? 'warning' : 'ok'}>{r.detected ? 'Proxy detected' : 'No proxy detected'}</Status>
                        <span>
                            Our server sees you as <Mono>{r.ip}</Mono>
                            {r.hostname && <> ({r.hostname})</>}
                        </span>
                    </div>
                    <Table head={['Header', 'Value']} rows={headers.map(([k, v]) => [k, <Mono>{v}</Mono>])} empty="Your requests carry no proxy headers." />
                    {r.hostnameHint && <p className="out-empty">Your address’s hostname looks like a proxy or VPN.</p>}
                </>
            );
        },
    },
    {
        id: 'bandwidth',
        fields: [],
        render: (r) => (
            <>
                <div className="out-speed">
                    <span className="out-speed-value">{r.mbps.toFixed(1)}</span>
                    <span className="out-speed-unit">Mbit/s download</span>
                </div>
                <Rows
                    rows={[
                        ['Data received', `${(r.bytes / 1024 / 1024).toFixed(1)} MB in ${r.secs.toFixed(2)} s`],
                        ['Round trip to our server', ms(r.latency)],
                    ]}
                />
            </>
        ),
    },
    {
        id: 'subnet',
        fields: [{ name: 'cidr', label: 'Address and mask', placeholder: '192.168.1.10/24 or 192.168.1.10 255.255.255.0' }],
        run: async (v) => ({ rows: subnet(v.cidr) }),
        render: (r) => <Rows rows={r.rows.map((x: Result) => [x.label, x.mono ? <Mono>{x.value}</Mono> : x.value])} />,
    },
    {
        id: 'mask',
        fields: [
            { name: 'first', label: 'First address', placeholder: '192.168.0.0' },
            { name: 'last', label: 'Last address', placeholder: '192.168.3.255' },
        ],
        run: async (v) => rangeToMasks(v.first, v.last),
        render: (r) => (
            <>
                <Rows
                    rows={[
                        ['Smallest network that holds the range', <Mono>{r.cover.cidr}</Mono>],
                        ['Its mask', <Mono>{r.cover.mask}</Mono>],
                        ['Addresses in it', r.cover.size.toLocaleString('en')],
                        ['Exact match', <Status level={r.exact ? 'ok' : 'neutral'}>{r.exact ? 'The range is exactly one network' : 'The range needs several networks'}</Status>],
                    ]}
                />
                {!r.exact && (
                    <Table
                        head={['Network', 'Mask', 'Addresses']}
                        rows={r.blocks.map((b: Result) => [<Mono>{b.cidr}</Mono>, <Mono>{b.mask}</Mono>, b.size.toLocaleString('en')])}
                        empty=""
                    />
                )}
            </>
        ),
    },

    {
        id: 'dns',
        fields: [
            { name: 'name', label: 'Domain or hostname', placeholder: 'example.com' },
            { name: 'type', label: 'Record', placeholder: '', options: ['ALL', 'A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA', 'SRV'], width: 'narrow' },
        ],
        run: (v) => api('dns', v),
        render: (r) => (
            <Table
                head={['Type', 'TTL', 'Value']}
                rows={r.records.map((x: Result) => [x.type, x.ttl, <Mono>{x.value}</Mono>])}
                empty={`No ${r.type === 'ALL' ? '' : `${r.type} `}records for ${r.name}.`}
            />
        ),
    },
    {
        id: 'mx',
        fields: [{ name: 'domain', label: 'Domain', placeholder: 'example.com' }],
        run: (v) => api('mx', v),
        render: (r) => (
            <Table
                head={['Priority', 'Mail server', 'Addresses', 'TTL']}
                rows={r.records.map((x: Result) => [x.priority, x.host, <Mono>{x.ips.join(', ') || 'Does not resolve'}</Mono>, x.ttl])}
                empty={`${r.domain} has no MX records, so it cannot receive email.`}
            />
        ),
    },
    {
        id: 'ns',
        fields: [{ name: 'domain', label: 'Domain', placeholder: 'example.com' }],
        run: (v) => api('ns', v),
        render: (r) => (
            <>
                <Table
                    head={['Name server', 'Addresses', 'TTL']}
                    rows={r.records.map((x: Result) => [x.host, <Mono>{x.ips.join(', ') || 'Does not resolve'}</Mono>, x.ttl])}
                    empty={`No NS records for ${r.domain}.`}
                />
                {r.soa && (
                    <Rows
                        rows={[
                            ['Primary server', r.soa.primary],
                            ['Contact', r.soa.contact],
                            ['Serial', <Mono>{r.soa.serial}</Mono>],
                            ['Refresh / retry / expire', `${r.soa.refresh} / ${r.soa.retry} / ${r.soa.expire} s`],
                        ]}
                    />
                )}
            </>
        ),
    },
    {
        id: 'spf',
        fields: [{ name: 'domain', label: 'Domain', placeholder: 'example.com' }],
        run: (v) => api('spf', v),
        render: (r) => (
            <>
                {r.record && <Record_ text={r.record} />}
                <Notes notes={r.notes} />
            </>
        ),
    },
    {
        id: 'dmarc',
        fields: [{ name: 'domain', label: 'Domain', placeholder: 'example.com' }],
        run: (v) => api('dmarc', v),
        render: (r) => (
            <>
                {r.record && <Record_ text={r.record} />}
                <Notes notes={r.notes} />
                {r.record && <Rows rows={Object.entries(r.tags as Record<string, string>).map(([k, v]) => [k, <Mono>{v}</Mono>])} />}
            </>
        ),
    },
    {
        id: 'dkim',
        fields: [
            { name: 'domain', label: 'Domain', placeholder: 'example.com' },
            { name: 'selector', label: 'Selector', placeholder: 'default', width: 'narrow' },
        ],
        run: (v) => api('dkim', v),
        render: (r) =>
            !r.record ? (
                <p className="out-empty">
                    No DKIM key at <Mono>{r.name}</Mono>. Check the selector: it is the <Mono>s=</Mono> value in a message’s DKIM-Signature header.
                </p>
            ) : (
                <>
                    <Record_ text={r.record} />
                    <Rows
                        rows={[
                            ['Record', <Mono>{r.name}</Mono>],
                            ['Key type', r.tags.k ?? 'rsa'],
                            [
                                'Key',
                                r.tags.p === '' ? (
                                    <Status level="warning">Revoked (empty key)</Status>
                                ) : r.bits ? (
                                    <Status level={r.bits >= 2048 ? 'ok' : r.bits >= 1024 ? 'warning' : 'error'}>{r.bits}-bit</Status>
                                ) : (
                                    'Present'
                                ),
                            ],
                        ]}
                    />
                </>
            ),
    },
    {
        id: 'smtp',
        fields: [{ name: 'host', label: 'Domain or mail server', placeholder: 'example.com' }],
        run: (v) => api('smtp', v),
        render: (r) =>
            !r.connected ? (
                <div className="out-summary out-summary-big">
                    <Status level="error">No connection</Status>
                    <span>
                        <Target host={r.server} ip={r.ip} />: {r.error}
                    </span>
                </div>
            ) : (
                <>
                    <div className="out-summary out-summary-big">
                        <Status level="ok">Connected</Status>
                        <span>
                            <Target host={r.server} ip={r.ip} /> answered in {r.ms} ms
                        </span>
                    </div>
                    <Rows
                        rows={[
                            ['Banner', <Mono>{r.banner}</Mono>],
                            ['STARTTLS', <Status level={r.starttls ? 'ok' : 'warning'}>{r.starttls ? 'Offered' : 'Not offered'}</Status>],
                            ['Extensions', r.capabilities.join(', ') || '—'],
                        ]}
                    />
                </>
            ),
    },
    {
        id: 'whois',
        fields: [{ name: 'query', label: 'Domain or IP', placeholder: 'example.com' }],
        run: (v) => api('whois', v),
        render: (r) =>
            r.kind === 'domain' ? (
                <>
                    <Rows
                        rows={[
                            ['Domain', r.name],
                            ['Registered', date(r.events.registration)],
                            ['Expires', date(r.events.expiration)],
                            ['Last changed', date(r.events['last changed'])],
                            ['Status', r.status.join(', ') || '—'],
                            ['Name servers', r.nameservers.join(', ') || '—'],
                            ['DNSSEC', r.dnssec == null ? '—' : r.dnssec ? 'Signed' : 'Not signed'],
                            ['Source', r.source],
                        ]}
                    />
                    <Contacts contacts={r.contacts} />
                </>
            ) : (
                <>
                    <Rows
                        rows={[
                            ['Network', r.name],
                            ['Range', <Mono>{r.range}</Mono>],
                            ['Handle', r.handle],
                            ['Type', r.type],
                            ['Country', r.country],
                            ['Registered', date(r.events.registration)],
                            ['Source', r.source],
                        ]}
                    />
                    <Contacts contacts={r.contacts} />
                </>
            ),
    },
    {
        id: 'blacklist',
        fields: [{ name: 'host', label: 'IP, mail server or domain', placeholder: 'mail.example.com' }],
        run: (v) => api('blacklist', v),
        note: 'Checks the common IP blacklists, plus the domain blacklists when you enter a domain. Takes a few seconds.',
        render: (r) => <Blacklists r={r} />,
    },
];

const TOOLS: Tool[] = TOOL_LIST.map((meta) => ({ ...SPECS.find((s) => s.id === meta.id)!, ...meta }));

const PORT_STATE = {
    open: { level: 'ok', label: 'Open' },
    closed: { level: 'error', label: 'Closed' },
    filtered: { level: 'warning', label: 'Filtered' },
} as const;

function OnePort({ r }: { r: Result }) {
    const st = PORT_STATE[r.state as keyof typeof PORT_STATE];
    return (
        <div className="out-summary out-summary-big">
            <Status level={st.level}>{st.label}</Status>
            <span>
                TCP port <strong>{r.port}</strong>
                {PORT_NAMES.has(r.port) && <> ({PORT_NAMES.get(r.port)})</>} on <Target host={r.host} ip={r.ip} />
                {r.state === 'open' && ` answered in ${ms(r.ms)}`}
                {r.state === 'closed' && ' refused the connection'}
                {r.state === 'filtered' && ' did not answer (a firewall may be dropping it)'}
            </span>
        </div>
    );
}

function AllPorts({ r }: { r: Result }) {
    const open = r.results.filter((x: Result) => x.state === 'open');
    return (
        <>
            <div className="out-summary out-summary-big">
                <Status level={open.length ? 'ok' : 'neutral'}>
                    {open.length} open of {r.results.length}
                </Status>
                <span>
                    Common ports on <Target host={r.host} ip={r.ip} />
                </span>
            </div>
            <Table
                head={['Port', 'Service', 'State', 'Time']}
                rows={r.results.map((x: Result) => {
                    const st = PORT_STATE[x.state as keyof typeof PORT_STATE];
                    return [<Mono>{x.port}</Mono>, PORT_NAMES.get(x.port) ?? '—', <Status level={st.level}>{st.label}</Status>, ms(x.ms)];
                })}
                empty=""
                compact
            />
            <p className="tool-note">Closed: the host refused the connection. Filtered: no answer within 4 seconds, usually a firewall.</p>
        </>
    );
}

const LIST_ORDER = { listed: 0, unknown: 1, clean: 2 } as const;

// Lists put their lookup or delisting page in the reason text; make those addresses clickable.
function Linkified({ text }: { text: string }) {
    return (
        <>
            {text.split(/(https?:\/\/[^\s"<>]+)/).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="out-link">
                        {part.replace(/^https?:\/\//, '').slice(0, 48)}
                        {part.length > 56 ? '…' : ''}
                    </a>
                ) : (
                    part
                ),
            )}
        </>
    );
}

function ListTable({ title, rows }: { title: string; rows: Result[] }) {
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => LIST_ORDER[a.state as keyof typeof LIST_ORDER] - LIST_ORDER[b.state as keyof typeof LIST_ORDER]);
    return (
        <div className="out-group">
            <h3 className="out-group-title">
                {title} <span className="faint">({rows.length})</span>
            </h3>
            <Table
                head={['List', 'Result', 'Details']}
                rows={sorted.map((x) => [
                    x.list,
                    <Status level={x.state === 'listed' ? 'error' : x.state === 'clean' ? 'ok' : 'neutral'}>
                        {x.state === 'listed' ? 'Listed' : x.state === 'clean' ? 'Clean' : 'No answer'}
                    </Status>,
                    x.reason ? <Linkified text={x.reason} /> : x.state === 'listed' ? `Code ${x.codes.join(', ')}` : '',
                ])}
                empty=""
                stack
            />
        </div>
    );
}

function Blacklists({ r }: { r: Result }) {
    const count = (state: string) => r.results.filter((x: Result) => x.state === state).length;
    const listed = count('listed');
    const ipRows = r.results.filter((x: Result) => x.kind === 'ip');
    const domainRows = r.results.filter((x: Result) => x.kind === 'domain');
    return (
        <>
            <div className="out-summary out-summary-big">
                <Status level={listed ? 'error' : 'ok'}>{listed ? `Listed on ${listed}` : 'Not listed'}</Status>
                <span>
                    {r.domain && <>{r.domain} </>}
                    {r.ip && <Mono>{r.ip}</Mono>} checked against {r.results.length} lists
                </span>
            </div>
            <div className="out-counts">
                <span>
                    <strong>{listed}</strong> listed
                </span>
                <span>
                    <strong>{count('clean')}</strong> clean
                </span>
                <span>
                    <strong>{count('unknown')}</strong> no answer
                </span>
            </div>
            <ListTable title={r.ip ? `IP blacklists for ${r.ip}` : 'IP blacklists'} rows={ipRows} />
            <ListTable title={`Domain blacklists for ${r.domain}`} rows={domainRows} />
        </>
    );
}

// Well-known TCP ports, with the ones ISPs reach for on MikroTik routers. UDP services (DNS over UDP, RADIUS, SNMP) cannot be tested with a TCP connect.
const COMMON_PORTS: { group: string; ports: [number, string][] }[] = [
    { group: 'Web', ports: [[80, 'HTTP'], [443, 'HTTPS'], [8080, 'HTTP alt'], [8443, 'HTTPS alt']] },
    { group: 'Email', ports: [[25, 'SMTP'], [465, 'SMTPS'], [587, 'Submission'], [110, 'POP3'], [995, 'POP3S'], [143, 'IMAP'], [993, 'IMAPS']] },
    { group: 'Remote access', ports: [[22, 'SSH'], [23, 'Telnet'], [3389, 'RDP'], [5900, 'VNC']] },
    { group: 'MikroTik', ports: [[8291, 'Winbox'], [8728, 'RouterOS API'], [8729, 'API over TLS']] },
    { group: 'Files and DNS', ports: [[21, 'FTP'], [53, 'DNS (TCP)'], [445, 'SMB']] },
    { group: 'Databases', ports: [[3306, 'MySQL / MariaDB'], [5432, 'PostgreSQL'], [6379, 'Redis'], [27017, 'MongoDB']] },
    { group: 'VPN', ports: [[1723, 'PPTP'], [1194, 'OpenVPN (TCP)']] },
];

const PORT_NAMES = new Map(COMMON_PORTS.flatMap((g) => g.ports));

function CommonPorts({
    current,
    disabled,
    onPick,
    onCheckAll,
}: {
    current?: string;
    disabled: boolean;
    onPick: (port: number) => void;
    onCheckAll: () => void;
}) {
    const count = COMMON_PORTS.reduce((n, g) => n + g.ports.length, 0);
    return (
        <div className="common-ports">
            <div className="common-ports-head">
                <h3 className="common-ports-title">Common ports</h3>
                <button type="button" className="btn btn-sm" disabled={disabled} onClick={onCheckAll}>
                    <Icon name="grid" />
                    Check all {count} ports
                </button>
            </div>
            <div className="common-ports-groups">
                {COMMON_PORTS.map((g) => (
                    <div className="common-ports-group" key={g.group}>
                        <span className="common-ports-label">{g.group}</span>
                        <div className="common-ports-list">
                            {g.ports.map(([port, name]) => (
                                <button
                                    type="button"
                                    key={port}
                                    className="port-chip"
                                    aria-pressed={current === String(port)}
                                    disabled={disabled}
                                    onClick={() => onPick(port)}
                                    title={`Check port ${port} (${name})`}
                                >
                                    <span className="port-chip-num">{port}</span>
                                    <span>{name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ToolPanel({ tool }: { tool: Tool }) {
    const [values, setValues] = useState<Record<string, string>>({});
    const [state, setState] = useState<{ status: 'idle' | 'running' | 'done' | 'error'; result?: Result; error?: string }>({ status: 'idle' });
    const [progress, setProgress] = useState<{ mbps: number; pct: number } | null>(null);
    const firstInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setValues(Object.fromEntries(tool.fields.map((f) => [f.name, f.options ? f.options[0] : ''])));
        setState({ status: 'idle' });
        setProgress(null);
    }, [tool.id]);

    const run = async (values: Record<string, string>) => {
        const missing = tool.fields.find((f) => !f.options && !values[f.name]?.trim());
        if (missing) {
            setState({ status: 'error', error: `Enter the ${missing.label.toLowerCase()}.` });
            firstInput.current?.focus();
            return;
        }
        setState({ status: 'running' });
        try {
            const result =
                tool.id === 'bandwidth'
                    ? await measureBandwidth((mbps, pct) => setProgress({ mbps, pct }))
                    : await tool.run!(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])));
            setState({ status: 'done', result });
        } catch (err) {
            setState({ status: 'error', error: err instanceof Error ? err.message : 'Something went wrong.' });
        }
        setProgress(null);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        run(values);
    };

    // Checks every common port on the host in one request.
    const checkAll = async () => {
        if (!values.host?.trim()) {
            setState({ status: 'error', error: 'Enter the host or IP first.' });
            firstInput.current?.focus();
            return;
        }
        setState({ status: 'running' });
        try {
            setState({ status: 'done', result: await api('ports', { host: values.host.trim() }) });
        } catch (err) {
            setState({ status: 'error', error: err instanceof Error ? err.message : 'Something went wrong.' });
        }
    };

    // Picking a common port fills it in and checks it right away.
    const pickPort = (port: number) => {
        const next = { ...values, port: String(port) };
        setValues(next);
        run(next);
    };

    const running = state.status === 'running';
    return (
        <section className="tool-panel" aria-labelledby="tool-title" aria-busy={running}>
            <header className="tool-head">
                <span className="tool-icon">
                    <Icon name={tool.icon} />
                </span>
                <div>
                    <h2 id="tool-title" className="h3">
                        {tool.name}
                    </h2>
                    <p>{tool.blurb}.</p>
                </div>
            </header>
            <form className="tool-form" onSubmit={submit} noValidate>
                {tool.fields.map((f, i) => (
                    <label key={f.name} className={f.width === 'narrow' ? 'field field-narrow' : 'field'}>
                        <span>{f.label}</span>
                        {f.options ? (
                            <select value={values[f.name] ?? f.options[0]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                                {f.options.map((o) => (
                                    <option key={o}>{o}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                ref={i === 0 ? firstInput : undefined}
                                value={values[f.name] ?? ''}
                                placeholder={f.placeholder}
                                inputMode={f.name === 'port' ? 'numeric' : undefined}
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                aria-invalid={state.status === 'error' && !values[f.name]?.trim() ? true : undefined}
                                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                            />
                        )}
                    </label>
                ))}
                <button className="btn btn-primary tool-run" type="submit" disabled={running}>
                    {running ? <span className="spinner" aria-hidden="true" /> : null}
                    {running ? 'Running…' : tool.fields.length ? 'Run' : tool.id === 'bandwidth' ? 'Start test' : 'Check my connection'}
                </button>
            </form>
            {tool.note && <p className="tool-note">{tool.note}</p>}
            {tool.id === 'port' && <CommonPorts current={values.port} disabled={running} onPick={pickPort} onCheckAll={checkAll} />}

            <div className="tool-output" role="status" aria-live="polite">
                {running && progress && (
                    <div className="out-speed">
                        <span className="out-speed-value">{progress.mbps.toFixed(1)}</span>
                        <span className="out-speed-unit">Mbit/s, {Math.round(progress.pct)}%</span>
                    </div>
                )}
                {running && !progress && <p className="out-empty">Working on it…</p>}
                {state.status === 'error' && (
                    <p className="out-error">
                        <Icon name="close" />
                        {state.error}
                    </p>
                )}
                {state.status === 'done' && state.result && tool.render(state.result)}
                {state.status === 'idle' && (
                    <p className="out-empty">
                        {tool.fields.length ? 'Results appear here.' : tool.id === 'bandwidth' ? 'Downloads test data from our server and measures how fast it arrives.' : 'Shows the address and headers our server sees from you.'}
                    </p>
                )}
            </div>
        </section>
    );
}

function MyIp() {
    const [me, setMe] = useState<Result | null>(null);
    useEffect(() => {
        api('myip', {}).then(setMe, () => setMe(null));
    }, []);
    if (!me) return null;
    return (
        <p className="tools-myip">
            Your IP address <Mono>{me.ip}</Mono>
            {me.hostname && <span className="faint"> · {me.hostname}</span>}
        </p>
    );
}

const HERO: Record<ToolGroup, { title: string; lead: string }> = {
    network: {
        title: 'Network tools.',
        lead: 'Ping or trace a host from our server, test a port, measure your download speed, or work out a subnet. Free, no sign-up.',
    },
    email: {
        title: 'DNS & Email tools.',
        lead: 'Look up DNS records and check a domain’s email setup: MX, SPF, DMARC, DKIM, its mail server and blacklists. Free, no sign-up.',
    },
};

export default function Tools({ group }: { group: ToolGroup }) {
    const { root } = useSite();
    const tools = TOOLS.filter((t) => t.group === group);
    const other: ToolGroup = group === 'network' ? 'email' : 'network';
    const fromHash = () => tools.find((t) => `#${t.id}` === window.location.hash) ?? tools[0];
    const [tool, setTool] = useState<Tool>(fromHash);

    useEffect(() => {
        const onHash = () => setTool(fromHash());
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);

    const pick = (t: Tool) => {
        history.replaceState(null, '', `#${t.id}`);
        setTool(t);
    };

    return (
        <>
            <section className="stage tools-hero" aria-labelledby="hero-title">
                <div className="container tools-hero-row">
                    <div>
                        <h1 id="hero-title" className="display">
                            {HERO[group].title}
                        </h1>
                        <p className="lead">{HERO[group].lead}</p>
                    </div>
                    <MyIp />
                </div>
            </section>
            <section className="section section-bg tools-section">
                <div className="container tools-layout">
                    <nav className="tools-nav" aria-label={TOOL_PAGES[group].title}>
                        <ul className="tools-list">
                            {tools.map((t) => (
                                <li key={t.id}>
                                    <a
                                        href={`#${t.id}`}
                                        aria-current={t.id === tool.id ? 'true' : undefined}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            pick(t);
                                        }}
                                    >
                                        <Icon name={t.icon} />
                                        <span>{t.name}</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                        <a className="tools-other" href={`${root}${TOOL_PAGES[other].path}`}>
                            <Icon name={TOOL_PAGES[other].icon} />
                            <span>
                                <strong>{TOOL_PAGES[other].title}</strong>
                                <span>{TOOL_PAGES[other].blurb}</span>
                            </span>
                            <Icon name="arrow" />
                        </a>
                    </nav>
                    <ToolPanel tool={tool} />
                </div>
                <p className="container tools-fineprint small faint">
                    {group === 'network'
                        ? 'Ping, traceroute and port checks run from our server and only reach public addresses. Each visitor has a limit of a few tests a minute. The calculators run in your browser.'
                        : 'Lookups run from our server. SMTP checks only connect to public addresses, and each visitor has a limit of a few tests a minute.'}{' '}
                    Built by PingOmni, makers of <a href={`${root}radiusone/`}>RadiusOne</a>.
                </p>
            </section>
        </>
    );
}
