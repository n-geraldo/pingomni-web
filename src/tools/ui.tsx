import { useState, type ReactNode } from 'react';
import Icon from '../Icon';
import { copyText } from '../lib/copy';
import type { Level, Verdict } from '../lib/interpret';
import type { Result } from '../lib/api';
import { TOOL_PAGES } from '../lib/toolList';
import { useSite } from '../shared/Layout';

// Building blocks every tool's result is made of: a verdict first, then the evidence in rows and tables,
// then the raw output and where to go next.

export type Values = Record<string, string>;

/** A step into another tool, carrying the target with it. */
export type Next = { tool: string; label: string; values: Partial<Values> };

export const ms = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)} ms`);
export const date = (v?: string) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const BADGE: Record<Level, string> = { pass: 'badge-success', issue: 'badge-warning', failed: 'badge-danger', neutral: 'badge-neutral' };

/** A badge always carries words, so the result never depends on colour alone. */
export function Status({ level, children }: { level: Level; children: ReactNode }) {
    return <span className={`badge ${BADGE[level]}`}>{children}</span>;
}

/** The answer in one line, then what it means. */
export function Summary({ verdict, children }: { verdict: Verdict; children?: ReactNode }) {
    return (
        <div className="out-verdict" data-level={verdict.level}>
            <div className="out-verdict-head">
                <Status level={verdict.level}>{verdict.label}</Status>
                <p className="out-verdict-title">{verdict.title}</p>
            </div>
            {(verdict.detail || children) && (
                <div className="out-verdict-detail">
                    {verdict.detail && <p>{verdict.detail}</p>}
                    {children}
                </div>
            )}
        </div>
    );
}

export function Rows({ rows }: { rows: [ReactNode, ReactNode][] }) {
    return (
        <dl className="out-rows">
            {rows.map(([k, v], i) => (
                <div key={i}>
                    <dt>{k}</dt>
                    <dd>{v ?? '—'}</dd>
                </div>
            ))}
        </dl>
    );
}

export function Table({
    head,
    rows,
    empty,
    compact = false,
    stack = false,
    caption,
}: {
    head: ReactNode[];
    rows: ReactNode[][];
    empty: string;
    compact?: boolean;
    stack?: boolean;
    caption?: string;
}) {
    if (!rows.length) return <p className="out-empty">{empty}</p>;
    return (
        <div className="out-table-wrap" tabIndex={0} role="region" aria-label={caption ?? 'Results table'}>
            <table className={['out-table', compact && 'out-table-compact', stack && 'out-table-stack'].filter(Boolean).join(' ')}>
                {caption && <caption className="sr-only">{caption}</caption>}
                <thead>
                    <tr>
                        {head.map((h, i) => (
                            <th key={i} scope="col">
                                {h}
                            </th>
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

export const Mono = ({ children }: { children: ReactNode }) => <code className="out-mono">{children}</code>;

/** "example.com 93.184.216.34", or just the address when that is what was entered. */
export const Target = ({ host, ip }: { host: string; ip?: string | null }) =>
    !ip || host === ip ? <Mono>{host}</Mono> : (
        <>
            {host} <Mono>{ip}</Mono>
        </>
    );

export const RecordText = ({ text }: { text: string }) => <pre className="out-record">{text}</pre>;

/** A column heading with its abbreviation spelled out on hover and for screen readers. */
export const Abbr = ({ short, long }: { short: string; long: string }) => <abbr title={long}>{short}</abbr>;

export type Check = { area?: string; level: 'pass' | 'issue' | 'failed' | 'inconclusive' | 'info'; text: string };

const CHECK_LABEL: Record<Check['level'], [Level, string]> = {
    pass: ['pass', 'Passed'],
    issue: ['issue', 'Issue'],
    failed: ['failed', 'Check failed'],
    inconclusive: ['neutral', 'Inconclusive'],
    info: ['neutral', 'Note'],
};

const AREA_TITLE: Record<string, string> = {
    presence: 'Is it published?',
    syntax: 'Is it written correctly?',
    policy: 'What it asks receivers to do',
    evaluation: 'Can receivers evaluate it?',
    key: 'The key',
};

/** Checks grouped by what they test, so "published", "valid" and "fully evaluated" never blur together. */
export function Checks({ checks }: { checks: Check[] }) {
    const areas = [...new Set(checks.map((c) => c.area ?? ''))];
    return (
        <div className="out-checks">
            {areas.map((area) => (
                <div className="out-check-group" key={area}>
                    {area && <h3 className="out-group-title">{AREA_TITLE[area] ?? area}</h3>}
                    <ul className="out-notes">
                        {checks
                            .filter((c) => (c.area ?? '') === area)
                            .map((c) => (
                                <li key={c.text}>
                                    <Status level={CHECK_LABEL[c.level][0]}>{CHECK_LABEL[c.level][1]}</Status>
                                    <span>{c.text}</span>
                                </li>
                            ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

/** A plain-language explanation that stays out of the way until asked for. */
export function Explain({ title = 'How to read this result', children }: { title?: string; children: ReactNode }) {
    return (
        <details className="out-explain">
            <summary>{title}</summary>
            <div className="out-explain-body">{children}</div>
        </details>
    );
}

/** The command output the result was read from. */
export function Raw({ text, title = 'Raw output' }: { text: string; title?: string }) {
    if (!text.trim()) return null;
    return (
        <details className="out-raw">
            <summary>{title}</summary>
            <pre className="out-console">{text}</pre>
        </details>
    );
}

export function CopyButton({ text, label = 'Copy', className = 'btn btn-sm' }: { text: string; label?: string; className?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <>
            <button
                type="button"
                className={className}
                onClick={async () => {
                    if (await copyText(text)) {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1600);
                    }
                }}
            >
                <Icon name={copied ? 'check' : 'copy'} />
                {copied ? 'Copied' : label}
            </button>
            <span className="sr-only" role="status">
                {copied ? 'Copied to clipboard' : ''}
            </span>
        </>
    );
}

/** A value with a small copy button beside it. */
export function Copyable({ value, mono = true }: { value: string; mono?: boolean }) {
    return (
        <span className="out-copyable">
            {mono ? <Mono>{value}</Mono> : value}
            <CopyButton text={value} label="" className="copy-mini" />
        </span>
    );
}

/** When, from where and how the test ran. */
export function Meta({ r, at }: { r: Result; at: Date }) {
    const when = r.measuredAt ? new Date(r.measuredAt) : at;
    const from =
        r.via === 'globalping'
            ? `Globalping probes${r.count ? ` in ${r.count} locations` : ''}, requested by your browser`
            : r.via === 'browser'
              ? 'Your browser'
              : r.via === 'ripestat'
                ? 'RIPE NCC’s RIS route collectors (through RIPEstat), looked up by our server'
                : `Our server${r.origin?.location ? ` in ${r.origin.location}` : ''}`;
    return (
        <dl className="out-meta">
            <div>
                <dt>Measured</dt>
                <dd>
                    <time dateTime={when.toISOString()}>{when.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })}</time>
                </dd>
            </div>
            <div>
                <dt>From</dt>
                <dd>{from}</dd>
            </div>
            {r.settings && (
                <div>
                    <dt>Settings</dt>
                    <dd>{r.settings}</dd>
                </div>
            )}
        </dl>
    );
}

export function NextSteps({ steps, hrefFor }: { steps: Next[]; hrefFor: (n: Next) => string }) {
    if (!steps.length) return null;
    return (
        <nav className="out-next" aria-label="Next checks">
            <h3 className="out-group-title">What to check next</h3>
            <ul>
                {steps.map((s) => (
                    <li key={s.tool + s.label}>
                        <a href={hrefFor(s)} className="next-link">
                            <span>{s.label}</span>
                            <Icon name="arrow" />
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

export const Place = ({ p }: { p: { city: string; country: string } }) => (
    <span className="out-place">
        <strong>{p.city}</strong> <span className="faint">{p.country}</span>
    </span>
);

/** A link that opens a BGP tool with its form filled in (nothing runs until the visitor presses the button). */
function useBgpHref() {
    const { root } = useSite();
    return (tool: string, values: Values) => `${root}${TOOL_PAGES.bgp.path}#${tool}?${new URLSearchParams(values)}`;
}

/** "AS15169", linked to the AS lookup, with the holder's name on hover when it is known. */
export function AsLink({ asn, name }: { asn: number; name?: string | null }) {
    const href = useBgpHref();
    return (
        <a className="out-as" href={href('asn', { asn: `AS${asn}` })} title={name ?? undefined}>
            AS{asn}
        </a>
    );
}

export function PrefixLink({ prefix }: { prefix: string }) {
    const href = useBgpHref();
    return (
        <a className="out-mono out-prefix" href={href('prefix', { resource: prefix })}>
            {prefix}
        </a>
    );
}

/** The networks a route crosses, in order: AS3269 → AS6762 → AS15169. */
export function AsPath({ path, names = {} }: { path: number[]; names?: Record<string, { name: string } | undefined> }) {
    return (
        <span className="out-aspath">
            {path.map((asn, i) => (
                <span key={i}>
                    {i > 0 && (
                        <span className="out-aspath-arrow" aria-hidden="true">
                            →
                        </span>
                    )}
                    <AsLink asn={asn} name={names[asn]?.name} />
                </span>
            ))}
        </span>
    );
}
