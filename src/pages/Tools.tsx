import { useEffect, useRef, useState, type FormEvent } from 'react';
import Icon from '../Icon';
import { api, ToolError, type Result } from '../lib/api';
import { toText } from '../lib/textOutput';
import { TOOL_LIST, TOOL_PAGES, type ToolGroup } from '../lib/toolList';
import { useSite } from '../shared/Layout';
import { BGP_SPECS } from '../tools/bgp';
import { EMAIL_SPECS } from '../tools/email';
import { NETWORK_SPECS } from '../tools/network';
import { CommonPorts } from '../tools/ports';
import { SubnetCalculator } from '../tools/subnet';
import type { Field, Progress, ToolSpec } from '../tools/types';
import { CopyButton, Meta, Mono, NextSteps, Raw, type Next, type Values } from '../tools/ui';

// ---------------------------------------------------------------------------
// The tools: three groups, each tool a form that runs on our server (/api/), on Globalping probes, or in the browser.
// Every tool says what it is for, where it runs, and after a run: what was found, the evidence, and what to check next.
// ---------------------------------------------------------------------------

const subnetSpec: ToolSpec = {
    id: 'subnet',
    action: 'Calculate',
    bestFor: 'Planning address ranges: network boundaries, masks, ranges to CIDR, and splitting.',
    fields: [],
    runsOn: () => 'Runs in your browser; nothing is sent anywhere.',
    custom: (initial) => <SubnetCalculator initial={initial} />,
};

type Tool = ToolSpec & (typeof TOOL_LIST)[number];

const SPECS = [...NETWORK_SPECS, subnetSpec, ...EMAIL_SPECS, ...BGP_SPECS];
const TOOLS: Tool[] = TOOL_LIST.map((meta) => ({ ...SPECS.find((s) => s.id === meta.id)!, ...meta }));

/** "#mx?domain=example.com" as the tool and the values to fill in. #mask is the old address of the subnet calculator. */
function parseHash(hash: string): { id: string; values: Values } {
    const [id, query = ''] = hash.replace(/^#/, '').split('?');
    return { id: id === 'mask' ? 'subnet' : id, values: Object.fromEntries(new URLSearchParams(query)) };
}

/** A link to a tool with its form filled in, on this page or the other tools page. Nothing runs until the visitor asks. */
function toolHref(next: Next, group: ToolGroup, root: string): string {
    const meta = TOOL_LIST.find((t) => t.id === next.tool)!;
    const query = new URLSearchParams(Object.entries(next.values).filter((e): e is [string, string] => !!e[1])).toString();
    const hash = `#${next.tool}${query ? `?${query}` : ''}`;
    return meta.group === group ? hash : `${root}${TOOL_PAGES[meta.group].path}${hash}`;
}

const defaults = (fields: Field[]) => Object.fromEntries(fields.map((f) => [f.name, f.options ? f.options[0].value : '']));

type RunState =
    | { status: 'idle' }
    | { status: 'running'; started: number; progress?: Progress }
    | { status: 'done'; result: Result; at: Date; values: Values }
    | { status: 'error'; error: ToolError; field?: string };

type View = 'table' | 'text';

function savedView(): View {
    try {
        return localStorage.getItem('pingomni-tools-view') === 'text' ? 'text' : 'table';
    } catch {
        return 'table';
    }
}

// Every result can be read as tables or as command-line text with a Copy button; the choice is remembered.
function ResultView({ tool, result, at, values, hrefFor }: { tool: Tool; result: Result; at: Date; values: Values; hrefFor: (n: Next) => string }) {
    const [view, setView] = useState<View>(savedView);
    const choose = (v: View) => {
        setView(v);
        try {
            localStorage.setItem('pingomni-tools-view', v);
        } catch {
            // Private mode: the choice lasts for this page only.
        }
    };
    const text = toText(tool.id, result);
    const raw = tool.raw?.(result) ?? '';
    return (
        <>
            <div className="out-bar">
                <div className="out-view" role="group" aria-label="Show results as">
                    <button type="button" aria-pressed={view === 'table'} onClick={() => choose('table')}>
                        <Icon name="grid" />
                        Summary
                    </button>
                    <button type="button" aria-pressed={view === 'text'} onClick={() => choose('text')}>
                        <Icon name="code" />
                        Text
                    </button>
                </div>
                <CopyButton text={text} className="btn btn-sm out-copy" />
            </div>
            <Meta r={result} at={at} />
            {view === 'text' ? <pre className="out-console">{text}</pre> : tool.render!(result, values)}
            {view === 'table' && raw && <Raw text={raw} />}
            <NextSteps steps={tool.next?.(result, values) ?? []} hrefFor={hrefFor} />
        </>
    );
}

function Countdown({ seconds, onDone }: { seconds: number; onDone: () => void }) {
    const [left, setLeft] = useState(seconds);
    useEffect(() => {
        if (left <= 0) {
            onDone();
            return;
        }
        const t = window.setTimeout(() => setLeft(left - 1), 1000);
        return () => window.clearTimeout(t);
    }, [left]);
    return left > 0 ? <> You can try again in {left} s.</> : null;
}

function Elapsed({ since }: { since: number }) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(t);
    }, []);
    return <>{Math.max(0, Math.round((now - since) / 1000))} s</>;
}

const ERROR_TITLE: Record<ToolError['kind'], string> = {
    invalid: 'Check the input',
    limited: 'Please wait',
    timeout: 'The test timed out',
    failed: 'The test could not finish',
};

function ToolPanel({ tool, initial, hrefFor, onTarget }: { tool: Tool; initial: Values; hrefFor: (n: Next) => string; onTarget: (t: string) => void }) {
    const [values, setValues] = useState<Values>(() => ({ ...defaults(tool.fields), ...initial }));
    const [state, setState] = useState<RunState>({ status: 'idle' });
    const [waiting, setWaiting] = useState(false);
    const inputs = useRef<Record<string, HTMLInputElement | null>>({});
    const output = useRef<HTMLDivElement>(null);

    const visible = tool.fields.filter((f) => !f.showIf || f.showIf(values));
    const main = visible.filter((f) => !f.advanced);
    const advanced = visible.filter((f) => f.advanced);
    const advancedChanged = advanced.some((f) => (values[f.name] ?? '') !== (defaults([f])[f.name] ?? ''));

    const run = async (vals: Values) => {
        const trimmed = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v.trim()]));
        const missing = visible.find((f) => !f.options && !f.optional && !trimmed[f.name]);
        if (missing) {
            setState({ status: 'error', error: new ToolError(`Enter the ${missing.label.toLowerCase()}${missing.placeholder ? `, for example ${missing.placeholder}` : ''}.`, 'invalid'), field: missing.name });
            inputs.current[missing.name]?.focus();
            return;
        }
        const started = Date.now();
        setState({ status: 'running', started });
        try {
            const result = await tool.run!(trimmed, (progress) => setState({ status: 'running', started, progress }));
            setState({ status: 'done', result, at: new Date(), values: trimmed });
            if (tool.target?.(trimmed)) onTarget(tool.target(trimmed));
        } catch (err) {
            const error = err instanceof ToolError ? err : new ToolError(err instanceof Error ? err.message : 'Something went wrong.');
            setState({ status: 'error', error });
            if (error.kind === 'limited' && error.retryAfter) setWaiting(true);
        }
        output.current?.focus({ preventScroll: true });
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        run(values);
    };

    // Port check extras: picking a common port fills it in and checks it; "check all" checks the fixed list.
    const pickPort = (port: number) => {
        const next = { ...values, port: String(port) };
        setValues(next);
        run(next);
    };
    const checkAll = async () => {
        const host = values.host?.trim();
        if (!host) {
            setState({ status: 'error', error: new ToolError('Enter the hostname or IP address first.', 'invalid'), field: 'host' });
            inputs.current.host?.focus();
            return;
        }
        const started = Date.now();
        setState({ status: 'running', started });
        try {
            setState({ status: 'done', result: await api('ports', { host }), at: new Date(), values: { host } });
            onTarget(host);
        } catch (err) {
            const error = err instanceof ToolError ? err : new ToolError('Something went wrong.');
            setState({ status: 'error', error });
            if (error.kind === 'limited' && error.retryAfter) setWaiting(true);
        }
    };

    const running = state.status === 'running';
    const field = (f: Field) => {
        const id = `f-${tool.id}-${f.name}`;
        const invalid = state.status === 'error' && state.field === f.name;
        return (
            <div key={f.name} className={f.width ? `field field-${f.width}` : 'field'}>
                <label htmlFor={id}>{f.label}</label>
                {f.options ? (
                    <select id={id} value={values[f.name] ?? f.options[0].value} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} aria-describedby={f.hint ? `${id}-hint` : undefined}>
                        {f.options.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input
                        id={id}
                        ref={(el) => {
                            inputs.current[f.name] = el;
                        }}
                        value={values[f.name] ?? ''}
                        placeholder={f.placeholder}
                        inputMode={f.numeric ? 'numeric' : undefined}
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        aria-invalid={invalid ? true : undefined}
                        aria-describedby={[f.hint && `${id}-hint`, invalid && `${tool.id}-error`].filter(Boolean).join(' ') || undefined}
                        onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    />
                )}
                {f.hint && (
                    <small id={`${id}-hint`} className="field-hint">
                        {f.hint}
                    </small>
                )}
            </div>
        );
    };

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
                    <p>
                        <strong className="tool-bestfor">Best for:</strong> {tool.bestFor}
                    </p>
                </div>
            </header>

            {tool.custom ? (
                tool.custom(initial)
            ) : (
                <>
                    <form className="tool-form" onSubmit={submit} noValidate>
                        {main.map(field)}
                        <button className="btn btn-primary tool-run" type="submit" disabled={running || waiting}>
                            {running ? <span className="spinner" aria-hidden="true" /> : null}
                            {running ? 'Running…' : tool.action}
                        </button>
                    </form>
                    {advanced.length > 0 && (
                        <details className="tool-advanced" open={advancedChanged || undefined}>
                            <summary>More options</summary>
                            <div className="tool-form">{advanced.map(field)}</div>
                        </details>
                    )}
                    <p className="tool-runs-on">
                        <Icon name={tool.runsOn(values).startsWith('Runs in your browser') ? 'phone' : tool.runsOn(values).includes('Globalping') ? 'signal' : 'server'} />
                        {tool.runsOn(values)}
                    </p>
                    {tool.id === 'port' && <CommonPorts current={values.port} disabled={running || waiting} onPick={pickPort} onCheckAll={checkAll} />}

                    <div className="tool-output" ref={output} tabIndex={-1} aria-live="polite">
                        {running && (
                            <div className="out-running">
                                {state.progress?.value ? (
                                    <div className="out-speed">
                                        <span className="out-speed-value">{state.progress.value.split(' ')[0]}</span>
                                        <span className="out-speed-unit">
                                            {state.progress.value.split(' ').slice(1).join(' ')}
                                            {state.progress.pct != null && `, ${Math.round(state.progress.pct)}%`}
                                        </span>
                                    </div>
                                ) : null}
                                <p className="out-empty">
                                    <span className="spinner spinner-dark" aria-hidden="true" /> {state.progress?.text ?? 'Running the test…'}{' '}
                                    <span className="faint">
                                        <Elapsed since={state.started} />
                                        {tool.duration && ` · ${tool.duration}`}
                                    </span>
                                </p>
                            </div>
                        )}
                        {state.status === 'error' && (
                            <div className={`out-error out-error-${state.error.kind}`} id={`${tool.id}-error`} role="alert">
                                <Icon name={state.error.kind === 'limited' ? 'refresh' : 'close'} />
                                <div>
                                    <strong>{ERROR_TITLE[state.error.kind]}</strong>
                                    <p>
                                        {state.error.message}
                                        {waiting && state.error.retryAfter && <Countdown seconds={state.error.retryAfter} onDone={() => setWaiting(false)} />}
                                    </p>
                                </div>
                            </div>
                        )}
                        {state.status === 'done' && <ResultView tool={tool} result={state.result} at={state.at} values={state.values} hrefFor={hrefFor} />}
                        {state.status === 'idle' && (tool.idle ?? <p className="out-empty">Results appear here after you press {tool.action}.</p>)}
                    </div>
                </>
            )}
        </section>
    );
}

// Four common investigations, each a short path through the tools. Links fill in the last target; nothing runs by itself.
const WORKFLOWS: { title: string; when: string; steps: { tool: string; field: string; extra?: Values; why: string }[] }[] = [
    {
        title: 'A website or service is unreachable',
        when: 'Connectivity',
        steps: [
            { tool: 'ping', field: 'host', why: 'Does the host answer at all, and how fast?' },
            { tool: 'traceroute', field: 'host', why: 'Where along the path do responses stop?' },
            { tool: 'mtr', field: 'host', why: 'Is there loss that carries through to the destination?' },
            { tool: 'port', field: 'host', extra: { port: '443' }, why: 'Is the service’s own TCP port reachable?' },
        ],
    },
    {
        title: 'A domain does not resolve correctly',
        when: 'Domain and DNS',
        steps: [
            { tool: 'dns', field: 'name', why: 'What do resolvers answer, and with which status?' },
            { tool: 'ns', field: 'domain', why: 'Do all name servers answer and agree?' },
            { tool: 'whois', field: 'query', why: 'Is it registered, active, and delegated to those servers?' },
            { tool: 'port', field: 'host', extra: { port: '443' }, why: 'Does the address it resolves to accept connections?' },
        ],
    },
    {
        title: 'Email is not arriving or lands in spam',
        when: 'Email',
        steps: [
            { tool: 'mx', field: 'domain', why: 'Which servers receive the domain’s mail?' },
            { tool: 'spf', field: 'domain', why: 'Which servers may send as the domain?' },
            { tool: 'dmarc', field: 'domain', why: 'What happens to mail that fails?' },
            { tool: 'dkim', field: 'domain', why: 'Is the signing key published? (needs a selector)' },
            { tool: 'smtp', field: 'host', why: 'Does the mail server answer on port 25?' },
            { tool: 'blacklist', field: 'host', why: 'Is the sending server on spam lists?' },
        ],
    },
    {
        title: 'A network is unreachable from some places',
        when: 'Routing',
        steps: [
            { tool: 'prefix', field: 'resource', why: 'Is it announced, by which AS, and does RPKI allow it?' },
            { tool: 'lg', field: 'resource', why: 'Which paths do networks around the world take to it?' },
            { tool: 'traceroute', field: 'host', why: 'Which networks does traffic cross from here?' },
            { tool: 'whois', field: 'query', why: 'Who is the address space registered to?' },
        ],
    },
];

function Workflows({ target, hrefFor }: { target: string; hrefFor: (n: Next) => string }) {
    const isIp = /^[\d.]+$|:/.test(target);
    return (
        <section className="workflows" aria-labelledby="workflows-title">
            <div className="workflows-head">
                <h2 id="workflows-title" className="h3">
                    Troubleshooting step by step
                </h2>
                <p className="faint">
                    {target ? (
                        <>
                            Links below carry <Mono>{target}</Mono> into each tool. Nothing runs until you press its button.
                        </>
                    ) : (
                        'Run any tool and these links carry its target along. Nothing runs until you press a tool’s button.'
                    )}
                </p>
            </div>
            <div className="workflows-grid">
                {WORKFLOWS.map((w) => (
                    <div className="workflow" key={w.title}>
                        <span className="workflow-kind">{w.when}</span>
                        <h3 className="workflow-title">{w.title}</h3>
                        <ol className="workflow-steps">
                            {w.steps.map((s) => {
                                const meta = TOOL_LIST.find((t) => t.id === s.tool)!;
                                const carry = target && !(isIp && ['domain', 'name'].includes(s.field) && s.tool !== 'dns');
                                return (
                                    <li key={s.tool}>
                                        <a href={hrefFor({ tool: s.tool, label: meta.name, values: carry ? { [s.field]: target, ...s.extra } : { ...s.extra } })}>{meta.name}</a>
                                        <span className="faint">{s.why}</span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                ))}
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
        lead: 'Ping, trace or run MTR to a host from our server or from other countries, test a TCP port, measure your download speed, or plan a subnet. Free, no sign-up.',
    },
    email: {
        title: 'DNS & Email tools.',
        lead: 'Look up DNS records and compare them across locations, and check a domain’s email setup: MX, SPF, DMARC, DKIM, its mail server, registration and spam lists. Free, no sign-up.',
    },
    bgp: {
        title: 'BGP & ASN tools.',
        lead: 'Look up an autonomous system, find which network announces an address and whether RPKI validates it, and see the BGP paths networks around the world use to reach it. Free, no sign-up.',
    },
};

export default function Tools({ group }: { group: ToolGroup }) {
    const { root } = useSite();
    const tools = TOOLS.filter((t) => t.group === group);
    // The pre-rendered page shows the first tool; the one in the address (#mx?domain=…) is picked once the page runs.
    const [current, setCurrent] = useState<{ tool: Tool; initial: Values; n: number }>({ tool: tools[0], initial: {}, n: 0 });
    const [target, setTarget] = useState('');

    useEffect(() => {
        const onHash = () => {
            const { id, values } = parseHash(window.location.hash);
            const tool = tools.find((t) => t.id === id);
            setCurrent((c) => ({ tool: tool ?? tools[0], initial: tool ? values : {}, n: c.n + 1 }));
            if (tool && Object.keys(values).length) document.getElementById('tool-card')?.scrollIntoView({ block: 'start' });
        };
        onHash();
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);

    const pick = (t: Tool) => {
        history.replaceState(null, '', `#${t.id}`);
        setCurrent((c) => ({ tool: t, initial: {}, n: c.n + 1 }));
    };
    const hrefFor = (n: Next) => toolHref(n, group, root);

    return (
        <>
            <section className="stage tools-hero" aria-labelledby="hero-title">
                <div className="container tools-hero-inner">
                    <MyIp />
                    <h1 id="hero-title" className="display">
                        {HERO[group].title}
                    </h1>
                    <p className="lead">{HERO[group].lead}</p>
                </div>
            </section>

            <section className="tools-main">
                <div className="container tools-stack">
                    <div className="tool-card" id="tool-card">
                        <div className="tool-tabs" role="tablist" aria-label={TOOL_PAGES[group].title}>
                            {tools.map((t) => (
                                <button
                                    type="button"
                                    role="tab"
                                    key={t.id}
                                    aria-selected={t.id === current.tool.id}
                                    aria-controls="tool-panel"
                                    className="tool-tab"
                                    title={t.blurb}
                                    onClick={() => pick(t)}
                                >
                                    <Icon name={t.icon} />
                                    {t.name}
                                </button>
                            ))}
                        </div>
                        <div id="tool-panel" role="tabpanel">
                            <ToolPanel key={`${current.tool.id}-${current.n}`} tool={current.tool} initial={current.initial} hrefFor={hrefFor} onTarget={setTarget} />
                        </div>
                    </div>

                    <Workflows target={target} hrefFor={hrefFor} />

                    <p className="tools-fineprint small faint">
                        {group === 'network'
                            ? 'Tests from our server only reach public addresses, and each visitor can run a few a minute. Tests from other countries run on Globalping, a free network of probes, and count against your connection’s hourly Globalping allowance. The subnet calculator runs in your browser.'
                            : group === 'email'
                              ? 'Lookups run from our server. Connections (SMTP, name server checks) only go to public addresses, and each visitor can run a few tests a minute. DNS comparisons from other countries run on Globalping.'
                              : 'Routing data comes from RIPEstat (RIPE NCC’s Routing Information Service), network details from PeeringDB and AS names from Team Cymru. Answers are kept for up to 5 minutes, so a route that just changed can take that long to show.'}{' '}
                        Built by PingOmni, makers of <a href={`${root}radiusone/`}>RadiusOne</a>.
                    </p>
                </div>
            </section>
        </>
    );
}
