import { useState, type FormEvent, type ReactNode } from 'react';
import Icon from '../Icon';
import { formatIp, parseNetwork, parseRange, PREFIXES, rangeToMasks, split, subnet, type SubnetInfo } from '../lib/ipcalc';
import { CopyButton, Copyable, Mono, Rows, Status, Table, type Values } from './ui';

// The subnet calculator: four modes over the same IPv4 maths, all in the browser.

type Mode = 'cidr' | 'range' | 'split' | 'prefixes';

const MODES: { id: Mode; label: string; about: string }[] = [
    { id: 'cidr', label: 'Address and mask', about: 'Network, broadcast, host range and counts for an address and mask.' },
    { id: 'range', label: 'Range to CIDR', about: 'The CIDR blocks that exactly cover a range of addresses, and the one prefix that contains it.' },
    { id: 'split', label: 'Split a network', about: 'Divide a network into equal smaller subnets.' },
    { id: 'prefixes', label: 'Prefix reference', about: 'Every prefix length with its netmask, wildcard and size.' },
];

const CIDR_EXAMPLES: [string, string][] = [
    ['192.168.1.10/24', 'Home LAN'],
    ['10.20.30.40 255.255.252.0', 'Netmask form'],
    ['172.16.0.0/12', 'Private block'],
    ['100.64.0.1/10', 'CGNAT'],
    ['203.0.113.8/31', 'Point-to-point /31'],
    ['198.51.100.7/32', 'Single address'],
];

function Examples({ items, onPick }: { items: [string, string][]; onPick: (text: string) => void }) {
    return (
        <div className="subnet-examples">
            <span className="subnet-examples-label">Examples</span>
            {items.map(([text, about]) => (
                <button type="button" key={text} className="example-chip" onClick={() => onPick(text)}>
                    <span className="example-chip-text">{text}</span>
                    <span className="example-chip-about">{about}</span>
                </button>
            ))}
        </div>
    );
}

function ErrorLine({ text }: { text: string }) {
    return (
        <p className="out-error" role="alert">
            <Icon name="close" />
            {text}
        </p>
    );
}

const attempt = <T,>(fn: () => T): { ok: T } | { error: string } => {
    try {
        return { ok: fn() };
    } catch (err) {
        return { error: err instanceof Error ? err.message : 'That could not be calculated.' };
    }
};

// ---------------------------------------------------------------------------
// Address and mask
// ---------------------------------------------------------------------------

const COPYABLE = new Set(['Network', 'Netmask', 'Wildcard', 'Broadcast', 'First host', 'Last host']);

function CidrResult({ r, onSplit }: { r: SubnetInfo; onSplit: (cidr: string) => void }) {
    const text = r.rows.map((x) => `${x.label}: ${x.value}`).join('\n');
    return (
        <>
            <div className="out-bar">
                <p className="out-summary">
                    <strong>{r.cidr}</strong>
                    <span className="faint">
                        {r.shape === 'single' ? 'a single address' : r.shape === 'p2p' ? 'a point-to-point link' : `${r.rows.find((x) => x.label === 'Usable hosts')?.value} usable hosts`}
                    </span>
                </p>
                <CopyButton text={text} label="Copy all" />
            </div>
            {r.assumed && <p className="tool-note">No mask was given, so the address is treated as a single /32.</p>}
            {r.hostBitsSet && (
                <p className="tool-note">
                    {r.ip} is a host address inside <Mono>{r.cidr}</Mono>; the network starts at <Mono>{r.cidr.split('/')[0]}</Mono>.
                </p>
            )}
            {r.shape === 'p2p' && <p className="tool-note">A /31 has no network or broadcast address: both addresses are usable on a point-to-point link (RFC 3021).</p>}
            <Rows rows={r.rows.map((x) => [x.label, x.mono && COPYABLE.has(x.label) ? <Copyable value={x.value} /> : x.mono ? <Mono>{x.value}</Mono> : x.value])} />
            {r.prefix < 32 && (
                <button type="button" className="btn btn-sm subnet-to-split" onClick={() => onSplit(r.cidr)}>
                    <Icon name="grid" />
                    Split {r.cidr} into smaller networks
                </button>
            )}
        </>
    );
}

function CidrMode({ initial, onSplit }: { initial: string; onSplit: (cidr: string) => void }) {
    const [input, setInput] = useState(initial);
    const [shown, setShown] = useState(initial);
    const calc = (text: string) => {
        setInput(text);
        setShown(text);
    };
    const range = parseRange(shown);
    const result = shown.trim() ? attempt(() => subnet(shown)) : null;
    return (
        <>
            <form
                className="tool-form"
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    calc(input);
                }}
                noValidate
            >
                <label className="field">
                    <span>IPv4 address and mask</span>
                    <input
                        value={input}
                        placeholder="192.168.1.10/24"
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        aria-describedby="cidr-hint"
                        aria-invalid={result && 'error' in result ? true : undefined}
                        onChange={(e) => setInput(e.target.value)}
                    />
                    <small id="cidr-hint" className="field-hint">
                        Write the mask as a prefix (/24) or a netmask (255.255.255.0).
                    </small>
                </label>
                <button className="btn btn-primary tool-run" type="submit">
                    Calculate
                </button>
            </form>
            <Examples items={CIDR_EXAMPLES} onPick={calc} />
            <div className="tool-output" aria-live="polite">
                {!result && <p className="out-empty">Enter an address with a mask to see its network, broadcast and host range.</p>}
                {range && <p className="tool-note">That looks like a range. Use the “Range to CIDR” mode to convert it.</p>}
                {result && !range && ('error' in result ? <ErrorLine text={result.error} /> : <CidrResult r={result.ok} onSplit={onSplit} />)}
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// Range to CIDR
// ---------------------------------------------------------------------------

function RangeMode({ initial }: { initial: [string, string] }) {
    const [first, setFirst] = useState(initial[0]);
    const [last, setLast] = useState(initial[1]);
    const [shown, setShown] = useState<[string, string]>(initial);
    const result = shown[0].trim() && shown[1].trim() ? attempt(() => rangeToMasks(shown[0], shown[1])) : null;
    return (
        <>
            <form
                className="tool-form"
                onSubmit={(e) => {
                    e.preventDefault();
                    setShown([first, last]);
                }}
                noValidate
            >
                <label className="field">
                    <span>First address</span>
                    <input value={first} placeholder="192.168.0.0" autoComplete="off" spellCheck={false} onChange={(e) => setFirst(e.target.value)} />
                </label>
                <label className="field">
                    <span>Last address</span>
                    <input value={last} placeholder="192.168.3.255" autoComplete="off" spellCheck={false} onChange={(e) => setLast(e.target.value)} />
                </label>
                <button className="btn btn-primary tool-run" type="submit">
                    Convert
                </button>
            </form>
            <Examples
                items={[
                    ['192.168.0.0 - 192.168.3.255', 'Exactly one network'],
                    ['10.0.0.5 - 10.0.0.20', 'Needs several blocks'],
                ]}
                onPick={(t) => {
                    const [a, b] = parseRange(t)!;
                    setFirst(a);
                    setLast(b);
                    setShown([a, b]);
                }}
            />
            <div className="tool-output" aria-live="polite">
                {!result && <p className="out-empty">Enter the first and last IPv4 address of a range.</p>}
                {result && 'error' in result && <ErrorLine text={result.error} />}
                {result && 'ok' in result && (
                    <>
                        <p className="out-summary">
                            <Status level={result.ok.exact ? 'pass' : 'neutral'}>{result.ok.exact ? 'Exactly one CIDR' : `${result.ok.blocks.length}${result.ok.truncated ? '+' : ''} CIDR blocks`}</Status>
                            <span>
                                {result.ok.first} to {result.ok.last}: {result.ok.count.toLocaleString('en')} addresses
                            </span>
                        </p>
                        <div className="out-group">
                            <h3 className="out-group-title">Exact representation</h3>
                            <p className="tool-note">These blocks together contain exactly the range, nothing more.</p>
                            <Table
                                head={['CIDR', 'Netmask', 'Addresses']}
                                rows={result.ok.blocks.map((b) => [<Copyable value={b.cidr} />, <Mono>{b.mask}</Mono>, b.size.toLocaleString('en')])}
                                empty=""
                                caption="Exact CIDR blocks"
                            />
                            {result.ok.truncated && <p className="tool-note">Showing the first 128 blocks.</p>}
                            <div>
                                <CopyButton text={result.ok.blocks.map((b) => b.cidr).join('\n')} label="Copy blocks" />
                            </div>
                        </div>
                        {!result.ok.exact && (
                            <div className="out-group">
                                <h3 className="out-group-title">Smallest single prefix that contains it</h3>
                                <Rows
                                    rows={[
                                        ['Covering prefix', <Copyable value={result.ok.cover.cidr} />],
                                        ['Netmask', <Mono>{result.ok.cover.mask}</Mono>],
                                        ['Addresses in it', result.ok.cover.size.toLocaleString('en')],
                                        ['Outside your range', <strong>{result.ok.extra.toLocaleString('en')} extra addresses</strong>],
                                    ]}
                                />
                                <p className="tool-note">Use the covering prefix only where including those extra addresses is acceptable, such as a broad firewall rule.</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

function SplitMode({ initial }: { initial: string }) {
    const [input, setInput] = useState(initial);
    const [shown, setShown] = useState(initial);
    const parsed = shown.trim() ? attempt(() => parseNetwork(shown)) : null;
    const [into, setInto] = useState<number | null>(null);
    const net = parsed && 'ok' in parsed ? parsed.ok : null;
    const target = net ? Math.min(32, Math.max(into ?? net.prefix + 1, net.prefix + 1)) : 0;
    const pieces = net && net.prefix < 32 ? split(net.network, net.prefix, target) : null;
    return (
        <>
            <form
                className="tool-form"
                onSubmit={(e) => {
                    e.preventDefault();
                    setShown(input);
                    setInto(null);
                }}
                noValidate
            >
                <label className="field">
                    <span>Network to split</span>
                    <input value={input} placeholder="10.0.0.0/22" autoComplete="off" spellCheck={false} onChange={(e) => setInput(e.target.value)} />
                </label>
                <button className="btn btn-primary tool-run" type="submit">
                    Show subnets
                </button>
            </form>
            <div className="tool-output" aria-live="polite">
                {!parsed && <p className="out-empty">Enter a network with its prefix, like 10.0.0.0/22.</p>}
                {parsed && 'error' in parsed && <ErrorLine text={parsed.error} />}
                {net && net.prefix === 32 && <p className="out-empty">A /32 is a single address and cannot be split.</p>}
                {net && pieces && (
                    <div className="subnet-split">
                        {net.hostBitsSet && (
                            <p className="tool-note">
                                Using the network <Mono>{formatIp(net.network)}/{net.prefix}</Mono> that contains the address you entered.
                            </p>
                        )}
                        <div className="subnet-split-head">
                            <h3 className="subnet-split-title">
                                {formatIp(net.network)}/{net.prefix} into
                            </h3>
                            <label className="subnet-split-pick">
                                <span>Subnet size</span>
                                <select value={target} onChange={(e) => setInto(Number(e.target.value))}>
                                    {PREFIXES.filter((p) => p.prefix > net.prefix)
                                        .reverse()
                                        .map((p) => (
                                            <option key={p.prefix} value={p.prefix}>
                                                {(2 ** (p.prefix - net.prefix)).toLocaleString('en')} × /{p.prefix} ({p.hosts.toLocaleString('en')} usable each)
                                            </option>
                                        ))}
                                </select>
                            </label>
                        </div>
                        <Table
                            head={['#', 'Network', 'First host', 'Last host', 'Broadcast', 'Usable']}
                            rows={pieces.pieces.map((x, i) => [i + 1, <Mono>{x.cidr}</Mono>, <Mono>{x.first}</Mono>, <Mono>{x.last}</Mono>, <Mono>{x.broadcast}</Mono>, x.hosts.toLocaleString('en')])}
                            empty=""
                            compact
                            caption="Subnets"
                        />
                        <div className="out-bar">
                            <p className="tool-note">
                                {pieces.count > pieces.pieces.length
                                    ? `Showing the first ${pieces.pieces.length.toLocaleString('en')} of ${pieces.count.toLocaleString('en')} subnets.`
                                    : `${pieces.count.toLocaleString('en')} subnets.`}
                                {target === 31 && ' /31 subnets have no broadcast address (RFC 3021).'}
                            </p>
                            <CopyButton text={pieces.pieces.map((p) => p.cidr).join('\n')} label="Copy list" />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// Prefix reference
// ---------------------------------------------------------------------------

function PrefixMode({ onPick }: { onPick: (prefix: number) => void }) {
    const [all, setAll] = useState(false);
    const rows = all ? PREFIXES : PREFIXES.filter((p) => p.prefix >= 16);
    return (
        <div className="prefix-map">
            <p className="prefix-map-hint">Usable hosts excludes the network and broadcast addresses, except for /31 (2 usable) and /32 (1).</p>
            <div className="out-table-wrap" tabIndex={0} role="region" aria-label="Prefix reference">
                <table className="out-table out-table-compact prefix-table">
                    <thead>
                        <tr>
                            <th scope="col">Prefix</th>
                            <th scope="col">Netmask</th>
                            <th scope="col">Wildcard</th>
                            <th scope="col" className="num">
                                Addresses
                            </th>
                            <th scope="col" className="num">
                                Usable hosts
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((p) => (
                            <tr key={p.prefix}>
                                <td>
                                    <button type="button" className="prefix-pick" onClick={() => onPick(p.prefix)} title={`Use /${p.prefix} in the address and mask mode`}>
                                        /{p.prefix}
                                    </button>
                                </td>
                                <td>
                                    <Mono>{p.mask}</Mono>
                                </td>
                                <td>
                                    <Mono>{p.wildcard}</Mono>
                                </td>
                                <td className="num">{p.total.toLocaleString('en')}</td>
                                <td className="num">{p.hosts.toLocaleString('en')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button type="button" className="btn btn-sm prefix-map-more" onClick={() => setAll(!all)}>
                {all ? 'Show /32 to /16 only' : 'Show /15 to /0'}
            </button>
        </div>
    );
}

// ---------------------------------------------------------------------------

export function SubnetCalculator({ initial }: { initial: Values }) {
    const start = initial.cidr ?? '';
    const startRange = parseRange(start);
    const [mode, setMode] = useState<Mode>((initial.mode as Mode) || (startRange ? 'range' : 'cidr'));
    // Each mode keeps its own input; switching modes can carry a value across (Split this network, Use /24).
    const [seed, setSeed] = useState({ cidr: startRange ? '' : start, range: startRange ?? (['', ''] as [string, string]), split: '', n: 0 });
    const go = (m: Mode, patch: Partial<typeof seed> = {}) => {
        setSeed((s) => ({ ...s, ...patch, n: s.n + 1 }));
        setMode(m);
    };
    const panels: Record<Mode, ReactNode> = {
        cidr: <CidrMode key={`c${seed.n}`} initial={seed.cidr} onSplit={(cidr) => go('split', { split: cidr })} />,
        range: <RangeMode key={`r${seed.n}`} initial={seed.range} />,
        split: <SplitMode key={`s${seed.n}`} initial={seed.split} />,
        prefixes: (
            <PrefixMode
                onPick={(prefix) => {
                    const address = seed.cidr.trim().split(/[\s/]/)[0] || '192.168.1.0';
                    go('cidr', { cidr: `${address}/${prefix}` });
                }}
            />
        ),
    };
    return (
        <div className="subnet-calc">
            <div className="subnet-modes" role="tablist" aria-label="Calculator mode">
                {MODES.map((m) => (
                    <button type="button" role="tab" key={m.id} aria-selected={mode === m.id} className="subnet-mode" onClick={() => setMode(m.id)}>
                        {m.label}
                    </button>
                ))}
            </div>
            <p className="tool-note subnet-mode-about">
                {MODES.find((m) => m.id === mode)!.about} <span className="faint">IPv4 only; runs in your browser.</span>
            </p>
            <div role="tabpanel">{panels[mode]}</div>
        </div>
    );
}
