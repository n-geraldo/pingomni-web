import type { ReactNode } from 'react';
import { api, ToolError, type Result } from '../lib/api';
import { dnsFrom, locationsFor, type DnsProbe } from '../lib/globalping';
import {
    blacklistSummary,
    DKIM_TAGS,
    DMARC_TAGS,
    duration,
    eppMeaning,
    LIST_STATE,
    nsVerdicts,
    outcomeVerdict,
    propagationVerdict,
    groupAnswers,
    spfTermMeaning,
    type ListState,
    type NsCheck,
    type Outcome,
    type Verdict,
} from '../lib/interpret';
import { fromField } from './network';
import type { Field, ToolSpec } from './types';
import { Abbr, Certificate, Checks, date, Explain, Mono, Place, RecordText, Rows, Status, Summary, Table, Target, type Next } from './ui';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const DOMAIN_FIELD: Field = { name: 'domain', label: 'Domain', placeholder: 'example.com', hint: 'Just the domain: no https:// or email address.' };

const runsOnServerDns = () => `Runs from our server, through its DNS resolver (which forwards to Cloudflare 1.1.1.1).`;

const RESOLVER_LABEL: Record<string, string> = {
    system: 'Our server’s resolver',
    cloudflare: 'Cloudflare 1.1.1.1',
    google: 'Google 8.8.8.8',
    quad9: 'Quad9 9.9.9.9',
    authoritative: 'The domain’s own name server',
};
const RESOLVER_IP: Record<string, string> = { cloudflare: '1.1.1.1', google: '8.8.8.8', quad9: '9.9.9.9' };

const emailNext = (domain: string, skip: string): Next[] =>
    [
        { tool: 'mx', label: 'See which servers receive its mail (MX)', values: { domain } },
        { tool: 'spf', label: 'Check its SPF record', values: { domain } },
        { tool: 'dmarc', label: 'Check its DMARC policy', values: { domain } },
        { tool: 'dkim', label: 'Find and check its DKIM keys', values: { domain } },
        { tool: 'smtp', label: 'Test its mail server and its TLS', values: { host: domain } },
        { tool: 'mailpolicy', label: 'Check MTA-STS, TLS-RPT and BIMI', values: { domain } },
    ].filter((n) => n.tool !== skip);

/** A record row: name, TTL, type, value. */
const recordRows = (records: Result[]) =>
    records.map((x) => [<Mono>{x.name}</Mono>, x.ttl, x.type, <Mono>{x.value}</Mono>]);

const RECORD_HEAD = ['Name', <Abbr short="TTL" long="Time to live: how many seconds resolvers may cache this answer" />, 'Type', 'Value'];

/** The lookup's own outcome, as a short line under a summary. */
const LookupLine = ({ l }: { l: Result }) => (
    <p className="tool-note">
        Answered by <Mono>{l.server ?? '—'}</Mono> in {l.ms ?? '—'} ms with status <Mono>{l.status}</Mono>
        {l.authenticated && ', DNSSEC-validated by the resolver (AD flag)'}
        {l.authoritative && ', authoritative answer'}.
    </p>
);

// ---------------------------------------------------------------------------
// DNS lookup and propagation
// ---------------------------------------------------------------------------

function DnsServer({ r }: { r: Result }) {
    const lookups = r.lookups as Result[];
    if (lookups.length === 1) {
        const l = lookups[0];
        const v = outcomeVerdict(l.outcome as Outcome, r.name, l.type, l.records.filter((x: Result) => x.type === l.type).length);
        return (
            <>
                <Summary verdict={v} />
                <LookupLine l={l} />
                {l.records.length > 0 && <Table head={RECORD_HEAD} rows={recordRows(l.records)} empty="" caption={`${l.type} records`} />}
                {l.records.some((x: Result) => x.type === 'CNAME') && <p className="tool-note">The name is an alias (CNAME); the answer follows it to the final name.</p>}
            </>
        );
    }
    const found = lookups.filter((l) => l.outcome === 'found');
    const failed = lookups.filter((l) => !['found', 'nodata', 'nxdomain'].includes(l.outcome));
    const nx = lookups.every((l) => l.outcome === 'nxdomain');
    return (
        <>
            <Summary
                verdict={
                    nx
                        ? outcomeVerdict('nxdomain', r.name, 'any')
                        : {
                              level: failed.length ? 'neutral' : 'pass',
                              label: `${found.length} of ${lookups.length} types found`,
                              title: `${r.name} has ${found.map((l) => l.type).join(', ') || 'no'} records${failed.length ? `; ${failed.map((l) => l.type).join(', ')} lookups failed` : ''}.`,
                          }
                }
            />
            <Table
                head={['Type', 'Result', ...RECORD_HEAD.slice(0, 2), 'Value']}
                rows={lookups.flatMap((l) => {
                    const own = l.records.filter((x: Result) => x.type === l.type);
                    if (!own.length) {
                        const v = outcomeVerdict(l.outcome, r.name, l.type);
                        return [[l.type, <Status level={v.level === 'pass' ? 'neutral' : v.level}>{v.label}</Status>, '', '', '']];
                    }
                    return own.map((x: Result, i: number) => [i ? '' : l.type, i ? '' : <Status level="pass">Found</Status>, <Mono>{x.name}</Mono>, x.ttl, <Mono>{x.value}</Mono>]);
                })}
                empty=""
                caption="Records by type"
            />
            <p className="tool-note">“All” asks for the common types one by one. It does not list every record a zone holds; DNS has no way to ask for that.</p>
        </>
    );
}

function DnsWorld({ r }: { r: Result }) {
    const probes = r.probes as DnsProbe[];
    const answers = (p: DnsProbe) => p.answers.filter((a) => a.type === r.type).map((a) => a.value);
    const verdict = propagationVerdict(probes.map((p) => ({ place: `${p.city}, ${p.country}`, answers: answers(p), code: p.code, failed: p.status !== 'finished' })));
    const groups = groupAnswers(probes.map((p) => ({ place: `${p.city}, ${p.country}`, answers: answers(p), code: p.code, failed: p.status !== 'finished' })));
    return (
        <>
            <Summary verdict={verdict} />
            {groups.length > 1 && (
                <div className="out-group">
                    <h3 className="out-group-title">Answers seen</h3>
                    <ul className="out-answer-groups">
                        {groups.map((g, i) => (
                            <li key={i}>
                                <span className="out-answers">
                                    {g.answers.map((a) => (
                                        <Mono key={a}>{a}</Mono>
                                    ))}
                                </span>
                                <span className="faint">
                                    {g.places.length} {g.places.length === 1 ? 'location' : 'locations'}: {g.places.join('; ')}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <Table
                head={['Location', 'Resolver', 'Status', 'Answer', <Abbr short="TTL" long="Seconds this resolver may still cache the answer" />, 'Time']}
                rows={probes.map((p) => [
                    <Place p={p} />,
                    p.resolver === 'private' ? <span className="faint">Probe’s own resolver</span> : <Mono>{p.resolver ?? '—'}</Mono>,
                    p.status !== 'finished' ? <Status level="failed">Probe failed</Status> : <Mono>{p.code ?? '—'}</Mono>,
                    answers(p).length ? (
                        <span className="out-answers">
                            {[...answers(p)].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((a, i) => (
                                <Mono key={i}>{a}</Mono>
                            ))}
                        </span>
                    ) : (
                        <span className="faint">No {r.type} records</span>
                    ),
                    p.answers.find((a) => a.type === r.type)?.ttl ?? '—',
                    p.ms == null ? '—' : `${p.ms} ms`,
                ])}
                empty="No locations answered."
                caption="Answers by location"
            />
            {r.partial && <p className="tool-note">Some probes had not finished after 45 seconds.</p>}
        </>
    );
}

const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA', 'SRV', 'PTR', 'DS', 'DNSKEY'];

const dns: ToolSpec = {
    id: 'dns',
    action: 'Check DNS',
    bestFor: 'Inspecting a name’s records, or comparing answers across locations after a change.',
    fields: [
        { name: 'name', label: 'Domain or hostname', placeholder: 'example.com', hint: 'For PTR, an IP address also works.' },
        {
            name: 'type',
            label: 'Record type',
            options: [{ value: 'A', label: 'A (IPv4 address)' }, { value: 'ALL', label: 'All common types' }, ...DNS_TYPES.slice(1).map((t) => ({ value: t, label: t }))],
            width: 'medium',
        },
        fromField('Look up from'),
        {
            name: 'resolver',
            label: 'Resolver',
            options: Object.entries(RESOLVER_LABEL).map(([value, label]) => ({ value, label })),
            width: 'medium',
            advanced: true,
            hint: 'Which DNS server answers. “The domain’s own name server” skips caches and shows what the zone itself publishes (our server only).',
        },
    ],
    runsOn: (v) =>
        locationsFor(v.from)
            ? `Runs on Globalping probes (${v.from}), started from your browser. Each probe asks ${v.resolver && RESOLVER_IP[v.resolver] ? RESOLVER_LABEL[v.resolver] : 'its own resolver'}.`
            : `Runs from our server, asking ${RESOLVER_LABEL[v.resolver || 'system'].replace(/^(The|Our) /, (m) => m.toLowerCase())}.`,
    duration: 'usually 1–10 seconds',
    run: async (v) => {
        const locations = locationsFor(v.from);
        if (!locations) return api('dns', { name: v.name, type: v.type, resolver: v.resolver || 'system' });
        if (v.type === 'ALL') throw new ToolError('Pick one record type to compare it across locations.', 'invalid');
        if (v.resolver === 'authoritative') throw new ToolError('Asking the domain’s own name server works from our server only. Choose “Our server” or another resolver.', 'invalid');
        try {
            return { ...(await dnsFrom(v.name, v.type, locations, RESOLVER_IP[v.resolver])), count: locations.reduce((n, l) => n + l.limit, 0) };
        } catch (err) {
            throw new ToolError(err instanceof Error ? err.message : 'The test failed.', /allowance/.test(String(err)) ? 'limited' : 'failed');
        }
    },
    render: (r) => (
        <>
            {r.via === 'globalping' ? <DnsWorld r={r} /> : <DnsServer r={r} />}
            {r.authority && (
                <p className="tool-note">
                    Asked {r.authority.server} (<Mono>{r.authority.ip}</Mono>), a name server for the zone {r.authority.zone}, without recursion.
                </p>
            )}
            <Explain>
                <p>
                    <strong>No records</strong> means the name exists but has nothing of this type. <strong>NXDOMAIN</strong> means the name does not exist
                    at all. <strong>SERVFAIL</strong> means the resolver could not get an answer, often because the domain’s name servers are down or its
                    DNSSEC signatures are broken; it says nothing about whether the record exists.
                </p>
                <p>
                    TTL is how long resolvers may keep an answer. After a change, a resolver can serve the old answer until the TTL it cached runs out,
                    which is why different places can see different answers for a while.
                </p>
            </Explain>
        </>
    ),
    raw: (r) => (r.lookups ?? []).map((l: Result) => l.raw).join('\n\n'),
    next: (r, v) => {
        const name = r.name as string;
        const host = name.replace(/\.$/, '');
        return [
            { tool: 'ns', label: `Check the name servers and SOA of ${host}`, values: { domain: host } },
            { tool: 'whois', label: `Look up its registration`, values: { query: host } },
            ...(v.type === 'MX' ? [{ tool: 'smtp', label: 'Test its mail server', values: { host } }] : []),
            ...(['A', 'AAAA', 'ALL', 'CNAME'].includes(v.type) ? [{ tool: 'port', label: `Check whether ${host} answers on HTTPS (443)`, values: { host, port: '443' } }] : []),
        ];
    },
    target: (v) => v.name,
};

// ---------------------------------------------------------------------------
// MX
// ---------------------------------------------------------------------------

function mxProblems(x: Result): string[] {
    const p: string[] = [];
    if (x.isIp) p.push('Points to an IP address; an MX must name a host.');
    if (x.cname) p.push(`Is an alias (CNAME to ${x.cname}); RFC 5321 says an MX must not point to an alias, though many senders still follow it.`);
    if (x.outcome !== 'found' && !x.isIp) p.push(x.outcome === 'nxdomain' ? 'This name does not exist.' : x.outcome === 'nodata' ? 'Has no A or AAAA address.' : 'Its address lookup failed.');
    if (x.private) p.push('Resolves to a private address that senders on the internet cannot reach.');
    return p;
}

const mx: ToolSpec = {
    id: 'mx',
    action: 'Check MX',
    bestFor: 'Seeing which servers receive a domain’s email, in what order.',
    fields: [DOMAIN_FIELD],
    runsOn: runsOnServerDns,
    run: (v) => api('mx', { domain: v.domain }),
    render: (r) => {
        const o = r.lookup.outcome as Outcome;
        const recs = r.records as Result[];
        const problems = recs.flatMap(mxProblems);
        let verdict: Verdict;
        if (r.nullMx) verdict = { level: 'neutral', label: 'Null MX', title: `${r.domain} says it does not accept email (null MX, RFC 7505).`, detail: 'Senders should bounce mail to this domain right away.' };
        else if (o === 'found')
            verdict = problems.length
                ? { level: 'issue', label: `${recs.length} MX, ${problems.length} problem${problems.length > 1 ? 's' : ''}`, title: `${r.domain} lists ${recs.length} mail server${recs.length > 1 ? 's' : ''}, with problems marked below.` }
                : { level: 'pass', label: `${recs.length} MX`, title: `${r.domain} lists ${recs.length} mail server${recs.length > 1 ? 's' : ''}, and each resolves to an address.` };
        else if (o === 'nodata')
            verdict = {
                level: 'neutral',
                label: 'No MX records',
                title: `${r.domain} has no MX records.`,
                detail: 'Senders then try the domain’s own address (A/AAAA) as a fallback (“implicit MX”). If the domain should receive mail, publish MX records.',
            };
        else verdict = outcomeVerdict(o, r.domain, 'MX');
        return (
            <>
                <Summary verdict={verdict} />
                {!r.nullMx && recs.length > 0 && (
                    <Table
                        head={[<Abbr short="Priority" long="Lower numbers are tried first; equal numbers share the load" />, 'Mail server', 'Addresses', 'TTL', 'Notes']}
                        rows={recs.map((x) => [
                            x.priority,
                            <Mono>{x.host}</Mono>,
                            x.ips.length ? <Mono>{x.ips.join(', ')}</Mono> : <span className="faint">None</span>,
                            x.ttl,
                            mxProblems(x).join(' ') || <span className="faint">—</span>,
                        ])}
                        empty=""
                        caption="Mail servers"
                    />
                )}
                <LookupLine l={r.lookup} />
                <Explain>
                    <p>
                        MX records name the servers that receive email for the domain. Senders try the lowest priority number first and move to the
                        next when it does not answer. This shows the published routing only; it does not test whether the servers accept mail.
                    </p>
                </Explain>
            </>
        );
    },
    raw: (r) => r.lookup?.raw ?? '',
    next: (r) => [
        ...(r.records[0]?.host ? [{ tool: 'blacklist', label: `Check ${r.records[0].host} against reputation lists`, values: { host: r.records[0].host } }] : []),
        ...emailNext(r.domain, 'mx'),
    ],
    target: (v) => v.domain,
};

// ---------------------------------------------------------------------------
// NS and SOA
// ---------------------------------------------------------------------------

const NS_STATE: Record<string, [Verdict['level'], string]> = {
    authoritative: ['pass', 'Authoritative'],
    not_authoritative: ['issue', 'Not authoritative'],
    timeout: ['issue', 'No answer'],
    error: ['issue', 'Error'],
    skipped: ['neutral', 'Not queried'],
};

const ns: ToolSpec = {
    id: 'ns',
    action: 'Check name servers',
    bestFor: 'Checking which servers are authoritative for a domain and whether they agree.',
    fields: [DOMAIN_FIELD],
    runsOn: () => `Runs from our server: looks up the NS records, then asks each name server for the zone’s SOA directly.`,
    duration: 'usually 2–6 seconds',
    run: (v) => api('ns', { domain: v.domain }),
    render: (r) => {
        const o = r.lookup.outcome as Outcome;
        const recs = r.records as Result[];
        const checks = nsVerdicts(recs as NsCheck[]);
        return (
            <>
                <Summary
                    verdict={
                        o === 'found'
                            ? { level: checks.some((c) => c.level === 'issue') ? 'issue' : 'pass', label: `${recs.length} name servers`, title: `${r.domain} is served by ${recs.length} name server${recs.length > 1 ? 's' : ''}.` }
                            : o === 'nodata'
                              ? { level: 'neutral', label: 'No NS records', title: `${r.domain} has no NS records of its own.`, detail: 'It is probably a name inside a larger zone, not a zone itself. Check its parent domain.' }
                              : outcomeVerdict(o, r.domain, 'NS')
                    }
                />
                {checks.length > 0 && (
                    <ul className="out-notes">
                        {checks.map((c) => (
                            <li key={c.title}>
                                <Status level={c.level}>{c.label}</Status>
                                <span>
                                    {c.title} {c.detail && <span className="faint">{c.detail}</span>}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                {recs.length > 0 && (
                    <Table
                        head={['Name server', 'Addresses', 'Its answer', <Abbr short="SOA serial" long="Version number of the zone this server holds" />, 'Time']}
                        rows={recs.map((x) => {
                            const st = NS_STATE[x.check?.state ?? 'skipped'];
                            return [
                                <Mono>{x.host}</Mono>,
                                x.ips.length ? <Mono>{x.ips.join(', ')}</Mono> : <span className="faint">Does not resolve</span>,
                                <span title={x.check?.note}>
                                    <Status level={st[0]}>{st[1]}</Status>
                                </span>,
                                x.check?.serial ?? '—',
                                x.check?.ms != null ? `${x.check.ms} ms` : '—',
                            ];
                        })}
                        empty=""
                        caption="Name servers"
                    />
                )}
                {r.soa && (
                    <div className="out-group">
                        <h3 className="out-group-title">Start of authority (SOA)</h3>
                        <Rows
                            rows={[
                                ['Primary name server', <Mono>{r.soa.primary}</Mono>],
                                ['Contact', r.soa.contact],
                                [<Abbr short="Serial" long="Zone version; secondaries copy the zone when it grows" />, <Mono>{r.soa.serial}</Mono>],
                                ['Refresh', <>{duration(r.soa.refresh)} <span className="faint">· how often secondary servers check for changes</span></>],
                                ['Retry', <>{duration(r.soa.retry)} <span className="faint">· wait before retrying a failed check</span></>],
                                ['Expire', <>{duration(r.soa.expire)} <span className="faint">· secondaries stop answering if they cannot reach the primary this long</span></>],
                                ['Negative caching', <>{duration(r.soa.minimum)} <span className="faint">· how long “does not exist” answers are cached</span></>],
                            ]}
                        />
                    </div>
                )}
                <Explain>
                    <p>
                        NS records say which servers hold the domain’s DNS. We ask each one directly, without recursion, so each must answer from its own
                        copy of the zone. The SOA serial is the zone’s version number: servers run by one provider normally share it, while different
                        providers often number independently.
                    </p>
                    <p>We query each server over IPv4 only, and only at public addresses.</p>
                </Explain>
            </>
        );
    },
    raw: (r) => [r.lookup?.raw, r.soaLookup?.raw].filter(Boolean).join('\n\n'),
    next: (r) => [
        { tool: 'dns', label: `Look up ${r.domain}’s records at its own name server`, values: { name: r.domain, type: 'A', resolver: 'authoritative' } },
        { tool: 'whois', label: 'Compare with the name servers at the registry', values: { query: r.domain } },
        { tool: 'mx', label: 'Check its mail servers (MX)', values: { domain: r.domain } },
    ],
    target: (v) => v.domain,
};

// ---------------------------------------------------------------------------
// DNSSEC check
// ---------------------------------------------------------------------------

function Dnssec({ r }: { r: Result }) {
    const issues = (r.checks as Result[]).filter((c) => c.level === 'issue');
    const verdict: Verdict = !r.signed
        ? { level: 'neutral', label: 'Not signed', title: `${r.domain} does not use DNSSEC.`, detail: r.checks[0]?.text }
        : issues.length
          ? { level: 'issue', label: r.bogus ? 'Broken' : `${issues.length} ${issues.length === 1 ? 'problem' : 'problems'}`, title: r.bogus ? `DNSSEC for ${r.domain} is broken: validating resolvers cannot resolve it.` : `DNSSEC for ${r.domain} has ${issues.length === 1 ? 'a problem' : 'problems'}.`, detail: issues[0].text }
          : { level: 'pass', label: 'Secure', title: `${r.domain} is signed and validates: its answers cannot be forged.` };
    // The chain as three links: parent DS, zone keys, signatures.
    const links: [string, ReactNode, boolean][] = [
        ['DS at the parent', r.ds.length ? r.ds.map((d: Result) => `tag ${d.tag}`).join(', ') : 'None', r.ds.some((d: Result) => r.keys.some((k: Result) => k.tag === d.tag))],
        ['DNSKEY in the zone', r.keys.length ? r.keys.map((k: Result) => `${k.role} ${k.tag}`).join(', ') : 'None', r.keys.length > 0],
        ['Signed answers', r.signatures.length ? `by key ${[...new Set(r.signatures.map((x: Result) => x.tag))].join(', ')}` : 'None', r.signatures.length > 0],
        ['Validates', r.validated ? 'Yes' : r.bogus ? 'No: SERVFAIL' : 'No', r.validated],
    ];
    return (
        <>
            <Summary verdict={verdict} />
            {r.signed && (
                <ol className="out-trust" aria-label="Chain of trust">
                    {links.map(([label, value, ok]) => (
                        <li key={label} data-ok={ok || undefined}>
                            <span className="out-trust-label">{label}</span>
                            <strong>{value}</strong>
                        </li>
                    ))}
                </ol>
            )}
            <Checks checks={r.checks} />
            {r.ds.length > 0 && (
                <div className="out-group">
                    <h3 className="out-group-title">DS records at the parent</h3>
                    <Table
                        head={['Key tag', 'Algorithm', 'Digest', 'Matches a key']}
                        rows={r.ds.map((d: Result) => [
                            <Mono>{d.tag}</Mono>,
                            `${d.algorithm} ${d.algorithmName ? `(${d.algorithmName})` : ''}`,
                            <span>
                                {d.digestName ?? d.digestType} <Mono>{d.digest.slice(0, 16)}…</Mono>
                            </span>,
                            r.keys.some((k: Result) => k.tag === d.tag) ? <Status level="pass">Yes</Status> : <Status level="issue">No</Status>,
                        ])}
                        empty=""
                        compact
                        caption="DS records"
                    />
                </div>
            )}
            {r.keys.length > 0 && (
                <div className="out-group">
                    <h3 className="out-group-title">Keys in the zone (DNSKEY)</h3>
                    <Table
                        head={['Key tag', 'Role', 'Algorithm', 'Flags']}
                        rows={r.keys.map((k: Result) => [<Mono>{k.tag}</Mono>, k.role === 'KSK' ? 'Key-signing key (KSK)' : 'Zone-signing key (ZSK)', `${k.algorithm} ${k.algorithmName ? `(${k.algorithmName})` : ''}`, <Mono>{k.flags}</Mono>])}
                        empty=""
                        compact
                        caption="DNSKEY records"
                    />
                </div>
            )}
            {r.signatures.length > 0 && (
                <div className="out-group">
                    <h3 className="out-group-title">Signatures on the SOA record (RRSIG)</h3>
                    <Table
                        head={['Signed by key', 'Algorithm', 'Valid from', 'Valid until']}
                        rows={r.signatures.map((x: Result) => [<Mono>{x.tag}</Mono>, x.algorithm, date(x.inception), date(x.expires)])}
                        empty=""
                        compact
                        caption="RRSIG records"
                    />
                </div>
            )}
        </>
    );
}

const dnssec: ToolSpec = {
    id: 'dnssec',
    action: 'Check DNSSEC',
    bestFor: 'Checking that a domain’s DNSSEC chain of trust is complete and validates, or finding out why it breaks.',
    fields: [DOMAIN_FIELD],
    runsOn: () => 'Runs from our server: reads the DS record at the parent, the zone’s DNSKEY and signatures, and asks a validating resolver (1.1.1.1) whether the answers validate.',
    duration: 'usually 1–3 seconds',
    run: (v) => api('dnssec', { domain: v.domain }),
    render: (r) => (
        <>
            <Dnssec r={r} />
            <Explain>
                <p>
                    DNSSEC is a chain: the parent zone (like .com) publishes a DS record that fingerprints the zone’s key-signing key; that key signs the
                    zone’s other keys; those sign every answer. A validating resolver follows the chain and refuses answers it cannot verify.
                </p>
                <p>
                    A broken chain is worse than none: resolvers that validate (most ISPs, 1.1.1.1, 8.8.8.8, 9.9.9.9) answer SERVFAIL and the domain
                    disappears for their users. The usual cause is a key rollover where the DS at the registrar was not updated.
                </p>
            </Explain>
        </>
    ),
    next: (r) => [
        { tool: 'ns', label: `Check that the name servers of ${r.domain} agree`, values: { domain: r.domain } },
        { tool: 'dns', label: `Look up records of ${r.domain}`, values: { name: r.domain } },
        { tool: 'whois', label: `See the registrar of ${r.domain}`, values: { query: r.domain } },
    ],
    target: (v) => v.domain,
};

// ---------------------------------------------------------------------------
// SPF
// ---------------------------------------------------------------------------

type SpfNode = { domain: string; record: string | null; lookups: number; problem: string | null; children: { via: string; node: SpfNode }[] };

function SpfTree({ node, via }: { node: SpfNode; via?: string }) {
    return (
        <li>
            <span className="spf-node">
                {via && <span className="faint">{via}: </span>}
                <Mono>{node.domain}</Mono>
                <span className="faint">
                    {' '}
                    · {node.lookups} lookup{node.lookups === 1 ? '' : 's'}
                </span>
                {node.problem && <Status level="issue">{node.problem}</Status>}
            </span>
            {node.children.length > 0 && (
                <ul>
                    {node.children.map((c, i) => (
                        <SpfTree key={i} node={c.node} via={c.via} />
                    ))}
                </ul>
            )}
        </li>
    );
}

const spf: ToolSpec = {
    id: 'spf',
    action: 'Check SPF',
    bestFor: 'Inspecting which servers a domain authorises to send its mail.',
    fields: [DOMAIN_FIELD],
    runsOn: () => `Runs from our server: reads the TXT records, then follows each include the way a receiver would.`,
    run: (v) => api('spf', { domain: v.domain }),
    render: (r) => (
        <>
            {r.record && <RecordText text={r.record} />}
            {r.records.length > 1 && r.records.slice(1).map((t: string) => <RecordText key={t} text={t} />)}
            <Checks checks={r.checks} />
            {r.terms.length > 0 && (
                <Table
                    head={['Term', 'What it does', 'DNS lookup', 'Note']}
                    rows={r.terms.map((t: Result) => [<Mono>{t.text}</Mono>, spfTermMeaning(t as { name: string; qualifier: string; value: string | null }), t.lookup ? 'Yes' : '—', t.problem ? <Status level="issue">{t.problem}</Status> : ''])}
                    empty=""
                    caption="SPF terms"
                />
            )}
            {r.tree && r.tree.children.length > 0 && (
                <div className="out-group">
                    <h3 className="out-group-title">Include tree ({r.lookups} lookups in total)</h3>
                    <ul className="spf-tree">
                        <SpfTree node={r.tree} />
                    </ul>
                </div>
            )}
            <Explain>
                <p>
                    This reads the published SPF record: whether there is exactly one, whether it is written correctly, and whether a receiver can
                    evaluate it within SPF’s limits (10 DNS lookups, 2 that find nothing). It does not test a particular sending server, and a valid
                    record does not by itself get mail delivered: receivers also weigh DKIM, DMARC and reputation.
                </p>
            </Explain>
        </>
    ),
    raw: (r) => r.lookup?.raw ?? '',
    next: (r) => emailNext(r.domain, 'spf'),
    target: (v) => v.domain,
};

// ---------------------------------------------------------------------------
// DMARC
// ---------------------------------------------------------------------------

const dmarc: ToolSpec = {
    id: 'dmarc',
    action: 'Check DMARC',
    bestFor: 'Inspecting what a domain asks receivers to do with mail that fails authentication.',
    fields: [DOMAIN_FIELD],
    runsOn: () => `Runs from our server: reads the TXT record at _dmarc.<domain>.`,
    run: (v) => api('dmarc', { domain: v.domain }),
    render: (r) => (
        <>
            {r.record && <RecordText text={r.record} />}
            <Checks checks={r.checks} />
            {r.parent && <RecordText text={`_dmarc.${r.parent.domain}: ${r.parent.record}`} />}
            {r.record && (
                <Table
                    head={['Tag', 'Value', 'Meaning']}
                    rows={Object.entries(r.tags as Record<string, string>).map(([k, v]) => [<Mono>{k}</Mono>, <Mono>{v}</Mono>, DMARC_TAGS[k] ?? 'Not a standard DMARC tag'])}
                    empty=""
                    caption="DMARC tags"
                />
            )}
            <Explain>
                <p>
                    DMARC tells receivers what to do with mail that claims to be from this domain but passes neither an aligned SPF nor an aligned DKIM
                    check, and where to send reports. It is a request: each receiver decides how to apply it. A strict policy does not guarantee that
                    legitimate mail is delivered, and this check does not show whether your own mail passes.
                </p>
            </Explain>
        </>
    ),
    raw: (r) => r.lookup?.raw ?? '',
    next: (r) => emailNext(r.domain, 'dmarc'),
    target: (v) => v.domain,
};

// ---------------------------------------------------------------------------
// DKIM
// ---------------------------------------------------------------------------

// Keep in step with DKIM_SELECTORS in api/index.php.
const DKIM_DISCOVERY_COUNT = 45;

const COMMON_SELECTORS = ['google', 'selector1', 'selector2', 'k1', 's1', 'default', 'dkim', 'mail'];

const dkim: ToolSpec = {
    id: 'dkim',
    action: 'Check DKIM key',
    bestFor: 'Finding a domain’s DKIM keys and checking them, with or without knowing the selector.',
    fields: [
        DOMAIN_FIELD,
        {
            name: 'selector',
            label: 'Selector',
            placeholder: 'selector1',
            width: 'medium',
            optional: true,
            hint: (
                <>
                    Optional: leave it empty to try {DKIM_DISCOVERY_COUNT} common selectors. It is <code>s=</code> in a message’s DKIM-Signature header. Common ones:{' '}
                    {COMMON_SELECTORS.map((s, i) => (
                        <span key={s}>
                            {i > 0 && ', '}
                            <code>{s}</code>
                        </span>
                    ))}
                    .
                </>
            ),
        },
    ],
    runsOn: (v) =>
        v.selector?.trim()
            ? `Runs from our server: reads the TXT record at ${v.selector.trim()}._domainkey.<domain>.`
            : `Runs from our server: looks up ${DKIM_DISCOVERY_COUNT} common selectors at once and checks the first that holds a key.`,
    run: (v) => api('dkim', { domain: v.domain, selector: v.selector ?? '' }),
    render: (r) => (
        <>
            {r.discovered?.length > 0 && (
                <div className="out-group">
                    <h3 className="out-group-title">
                        Keys found <span className="faint">(tried {r.tried.length} common selectors)</span>
                    </h3>
                    <ul className="out-notes">
                        {r.discovered.map((d: Result) => (
                            <li key={d.selector}>
                                <Status level={d.revoked ? 'neutral' : 'pass'}>{d.revoked ? 'Revoked' : d.keyType.toUpperCase()}</Status>
                                <span>
                                    <Mono>{d.selector}</Mono>
                                    {d.selector === r.selector && <span className="faint"> (checked below)</span>}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {r.record && <RecordText text={r.record} />}
            <Checks checks={r.checks} />
            <Rows
                rows={[
                    ['Record name', r.name ? <Mono>{r.name}</Mono> : '—'],
                    ...(r.cname ? [['Alias of', <Mono>{r.cname}</Mono>] as [string, ReactNode]] : []),
                    ...(r.record ? [['Key', r.tags.p === '' ? 'Revoked (empty)' : `${r.keyType?.toUpperCase()}${r.bits ? `, ${r.bits} bits` : ''}`] as [string, string]] : []),
                ]}
            />
            {r.record && (
                <Table
                    head={['Tag', 'Value', 'Meaning']}
                    rows={Object.entries(r.tags as Record<string, string>).map(([k, v]) => [
                        <Mono>{k}</Mono>,
                        <Mono>{k === 'p' && v.length > 48 ? `${v.slice(0, 44)}…` : v}</Mono>,
                        DKIM_TAGS[k] ?? 'Not a standard DKIM tag',
                    ])}
                    empty=""
                    caption="DKIM tags"
                />
            )}
            <Explain>
                <p>
                    Senders sign each message with a private key; receivers find the public key at <Mono>selector._domainkey.domain</Mono>, which is why the
                    selector is needed: a domain can publish many keys and DNS cannot list them. This checks that the key is published and readable. It
                    cannot check a message’s signature: for that, look at the “dkim=” result in a received message’s Authentication-Results header.
                </p>
            </Explain>
        </>
    ),
    raw: (r) => r.lookup?.raw ?? '',
    next: (r) => emailNext(r.domain, 'dkim'),
    target: (v) => v.domain,
};

// ---------------------------------------------------------------------------
// SMTP
// ---------------------------------------------------------------------------

function Smtp({ r }: { r: Result }) {
    if (r.nullMx) {
        return <Summary verdict={{ level: 'neutral', label: 'Null MX', title: `${r.input} says it does not accept email (null MX), so we did not connect.` }} />;
    }
    const tested =
        r.mode === 'mx'
            ? `the preferred MX of ${r.input} (lowest preference number)`
            : r.mode === 'implicit'
              ? `${r.input} itself (it has no MX records, so senders fall back to its address)`
              : r.server;
    let verdict: Verdict;
    if (!r.connected) {
        verdict = {
            level: 'neutral',
            label: r.state === 'refused' ? 'Refused' : r.state === 'timeout' ? 'No response' : 'No connection',
            title: `${r.server} did not accept a connection on port 25.`,
            detail:
                r.state === 'refused'
                    ? 'The host answered but nothing accepts connections on port 25.'
                    : 'No answer within 8 seconds. A firewall on either side can cause this, including outbound filtering on the network our server uses, so it is not proof that the mail server is down.',
        };
    } else if (r.bannerCode === 220) {
        const issues = (r.checks ?? []).filter((c: Result) => c.level === 'issue');
        verdict = issues.length
            ? { level: 'issue', label: `${issues.length} ${issues.length === 1 ? 'problem' : 'problems'}`, title: `${r.server} answered on port 25 in ${r.ms} ms, but ${issues.length === 1 ? 'one check failed' : `${issues.length} checks failed`}.`, detail: issues[0].text }
            : { level: 'pass', label: 'Healthy', title: `${r.server} answered on port 25 in ${r.ms} ms${r.tls ? ` and encrypts with ${r.tls.protocol}` : ''}.` };
    } else {
        verdict = {
            level: 'issue',
            label: r.bannerCode ? `Code ${r.bannerCode}` : 'No greeting',
            title: r.bannerCode ? `${r.server} accepted the connection but greeted with ${r.bannerCode} instead of 220.` : `${r.server} accepted the connection but sent no greeting.`,
            detail: r.bannerCode === 554 ? '554 at the greeting means the server refuses to talk to our address, often a block of our network rather than of everyone.' : undefined,
        };
    }
    return (
        <>
            <Summary verdict={verdict} />
            <Rows
                rows={[
                    ['Tested', <>{tested}</>],
                    ['Mail server', <Target host={r.server} ip={r.ip} />],
                    ...(r.connected
                        ? ([
                              ['Greeting (banner)', <Mono>{r.banner ?? '—'}</Mono>],
                              [<Abbr short="STARTTLS" long="Whether the server offers to encrypt the session" />, r.tls ? `Works (${r.tls.protocol})` : r.starttls ? 'Offered, but failed' : 'Not offered'],
                              ['Extensions (EHLO)', r.capabilities.length ? r.capabilities.join(', ') : '—'],
                          ] as [ReactNode, ReactNode][])
                        : ([['Error', r.error]] as [ReactNode, ReactNode][])),
                ]}
            />
            {r.checks?.length > 0 && <Checks checks={r.checks} />}
            {r.tls && <Certificate tls={r.tls} />}
            {r.mx?.length > 1 && (
                <p className="tool-note">
                    Not tested: {r.mx.slice(1).map((m: Result) => `${m.host} (priority ${m.priority})`).join(', ')}. Enter one of them to test it.
                </p>
            )}
            <Explain>
                <p>
                    We open a connection to port 25, read the greeting and send EHLO to see the extensions offered. When the server offers STARTTLS
                    we start encryption, inspect its certificate and send EHLO again, then QUIT. No mail is sent, so this shows that the server is
                    reachable and how it encrypts, not that a mailbox exists or that mail would reach the inbox.
                </p>
                <p>
                    Senders encrypt opportunistically: most deliver over TLS even when the certificate is not trusted. A trusted certificate that
                    matches the server name matters when the receiving domain publishes MTA-STS or DANE, which tell senders to insist on it.
                </p>
            </Explain>
        </>
    );
}

const smtp: ToolSpec = {
    id: 'smtp',
    action: 'Test SMTP',
    bestFor: 'Checking that a domain’s mail server answers on port 25, encrypts with STARTTLS and has a valid certificate.',
    fields: [{ name: 'host', label: 'Domain or mail server', placeholder: 'example.com', hint: 'A domain tests its first MX; a hostname or IP is tested directly.' }],
    runsOn: () => `Runs from our server: connects to port 25, reads the greeting, sends EHLO, starts TLS when offered and checks the certificate. No email is sent.`,
    duration: 'up to 20 seconds',
    run: (v) => api('smtp', { host: v.host }),
    render: (r) => <Smtp r={r} />,
    raw: (r) => (r.transcript ?? []).map((t: Result) => (t.dir === 'note' ? `-- ${t.text}` : `${t.dir === 'in' ? 'S:' : 'C:'} ${t.text.replace(/\n/g, '\nS: ')}`)).join('\n'),
    next: (r) =>
        r.server
            ? [
                  { tool: 'blacklist', label: `Check ${r.server} against reputation lists`, values: { host: r.ip ?? r.server } },
                  { tool: 'reverse', label: `Check the reverse DNS of ${r.ip}`, values: { ip: r.ip } },
                  ...(r.mode !== 'host' ? emailNext(r.input, 'smtp').slice(1, 3) : []),
              ]
            : [],
    target: (v) => v.host,
};

// ---------------------------------------------------------------------------
// Registration (RDAP)
// ---------------------------------------------------------------------------

function Contacts({ contacts }: { contacts: Result[] }) {
    const shown = contacts.filter((c) => c.fn || c.org || c.email || c.tel || c.address);
    if (!shown.length) return <p className="out-empty">No contact details are published; most registries hide them for privacy.</p>;
    return (
        <Table
            head={['Role', 'Name', 'Email', 'Phone', 'Address']}
            rows={shown.map((c) => [c.roles.join(', ') || '—', c.fn ?? c.org ?? '—', c.email ?? '—', c.tel ?? '—', c.address ?? '—'])}
            empty=""
            caption="Contacts"
        />
    );
}

const Statuses = ({ list }: { list: string[] }) =>
    list.length ? (
        <ul className="out-statuses">
            {list.map((s) => (
                <li key={s}>
                    <Mono>{s}</Mono>
                    {eppMeaning(s) && <span className="faint"> · {eppMeaning(s)}</span>}
                </li>
            ))}
        </ul>
    ) : (
        <>—</>
    );

function Whois({ r }: { r: Result }) {
    if (!r.found) {
        return (
            <Summary
                verdict={
                    r.supported === false
                        ? {
                              level: 'neutral',
                              label: 'No RDAP service',
                              title: `The registry for .${r.tld} does not publish registration data over RDAP.`,
                              detail: 'Check the registry’s own website or WHOIS service for this domain.',
                          }
                        : {
                              level: 'neutral',
                              label: 'Not found',
                              title: `${r.source ?? 'The registry'} has no registration record for ${r.query}.`,
                              detail: r.kind === 'domain' ? 'The domain is probably not registered, or the registry has not published it yet.' : undefined,
                          }
                }
            />
        );
    }
    const redacted = r.redacted as string[];
    if (r.kind === 'ip') {
        return (
            <>
                <Summary verdict={{ level: 'neutral', label: 'Found', title: `${r.query} belongs to ${r.name ?? 'a registered network'}${r.country ? ` (${r.country})` : ''}.` }} />
                <Rows
                    rows={[
                        ['Network name', r.name],
                        ['Range', <Mono>{r.range}</Mono>],
                        ...(r.cidr ? ([['CIDR', <Mono>{r.cidr}</Mono>]] as [ReactNode, ReactNode][]) : []),
                        ['Handle', r.handle],
                        ['Type', r.type],
                        ['Country', r.country],
                        ['Registered', date(r.events.registration)],
                        ['Last changed', date(r.events['last changed'])],
                        ['Source', r.source],
                    ]}
                />
                <Contacts contacts={r.contacts} />
            </>
        );
    }
    const expires = r.events.expiration ? new Date(r.events.expiration) : null;
    const days = expires ? Math.round((expires.getTime() - Date.now()) / 86400000) : null;
    return (
        <>
            <Summary
                verdict={{
                    level: days !== null && days < 0 ? 'issue' : 'neutral',
                    label: 'Registered',
                    title: `${r.name} is registered${r.registrar?.name ? ` through ${r.registrar.name}` : ''}${days !== null ? `; ${days >= 0 ? `expires in ${days} days` : `expired ${-days} days ago`}` : ''}.`,
                }}
            />
            <Rows
                rows={[
                    ['Domain', r.name],
                    ['Registrar', r.registrar ? <>{r.registrar.name ?? '—'}{r.registrar.ianaId && <span className="faint"> · IANA ID {r.registrar.ianaId}</span>}</> : <span className="faint">Not published</span>],
                    ['Registered', date(r.events.registration)],
                    ['Expires', date(r.events.expiration)],
                    ['Last changed', date(r.events['last changed'])],
                    ['Status', <Statuses list={r.status} />],
                    ['Name servers', r.nameservers.length ? r.nameservers.map((n: string) => <Mono key={n}>{n} </Mono>) : '—'],
                    ['DNSSEC', r.dnssec == null ? <span className="faint">Not published</span> : r.dnssec ? 'Signed (delegation has DS records)' : 'Not signed'],
                    ['Source', r.source],
                ]}
            />
            {redacted.length > 0 && <p className="tool-note">Hidden by the registry: {redacted.join('; ')}. This is normal for privacy and is not an error.</p>}
            <Contacts contacts={r.contacts} />
        </>
    );
}

const whois: ToolSpec = {
    id: 'whois',
    action: 'Look up registration',
    bestFor: 'Seeing the public registration record of a domain or IP network.',
    fields: [{ name: 'query', label: 'Domain or IP address', placeholder: 'example.com' }],
    runsOn: () => `Runs from our server: asks the registry’s RDAP service (found through rdap.org and IANA).`,
    run: (v) => api('whois', { query: v.query }),
    render: (r) => (
        <>
            <Whois r={r} />
            <Explain title="About this data">
                <p>
                    RDAP is the structured successor to WHOIS. Registries decide what they publish: most hide personal contact details, and some
                    country-code registries do not offer RDAP at all. Missing fields are therefore not errors.
                </p>
            </Explain>
        </>
    ),
    next: (r) =>
        r.kind === 'ip'
            ? [
                  { tool: 'reverse', label: `Reverse lookup of ${r.query}`, values: { ip: r.query } },
                  { tool: 'blacklist', label: `Check ${r.query} against reputation lists`, values: { host: r.query } },
              ]
            : [
                  { tool: 'ns', label: 'Check that the name servers answer', values: { domain: r.query } },
                  { tool: 'dns', label: `Look up ${r.query}’s DNS records`, values: { name: r.query, type: 'ALL' } },
              ],
    target: (v) => v.query,
};

// ---------------------------------------------------------------------------
// MTA-STS, TLS-RPT and BIMI
// ---------------------------------------------------------------------------

const mailpolicy: ToolSpec = {
    id: 'mailpolicy',
    action: 'Check policies',
    bestFor: 'Checking whether a domain makes senders use TLS (MTA-STS), collects TLS failure reports (TLS-RPT), and shows a brand logo (BIMI).',
    fields: [DOMAIN_FIELD],
    runsOn: () => 'Runs from our server: reads the TXT records at _mta-sts, _smtp._tls and default._bimi, and fetches the MTA-STS policy over HTTPS the way senders do.',
    duration: 'usually 1–5 seconds',
    run: (v) => api('mailpolicy', { domain: v.domain }),
    render: (r) => {
        const issues = (r.checks as Result[]).filter((c) => c.level === 'issue');
        const mode = r.mtaSts?.policy?.mode;
        const verdict: Verdict = issues.length
            ? { level: 'issue', label: `${issues.length} ${issues.length === 1 ? 'problem' : 'problems'}`, title: `${r.domain} has ${issues.length === 1 ? 'a problem' : 'problems'} in its mail policies.`, detail: issues[0].text }
            : mode === 'enforce'
              ? { level: 'pass', label: 'Enforced', title: `Mail to ${r.domain} must travel over TLS with a valid certificate.` }
              : { level: 'neutral', label: r.mtaSts ? `MTA-STS ${mode ?? 'set'}` : 'No MTA-STS', title: r.mtaSts ? `${r.domain} publishes MTA-STS in ${mode} mode.` : `${r.domain} does not require senders to use TLS.` };
        return (
            <>
                <Summary verdict={verdict} />
                <Rows
                    rows={[
                        ['MTA-STS', r.mtaSts ? <Mono>{r.mtaSts.record}</Mono> : 'Not published'],
                        ['TLS-RPT', r.tlsRpt ? <Mono>{r.tlsRpt.record}</Mono> : 'Not published'],
                        ['BIMI', r.bimi ? <Mono>{r.bimi.record}</Mono> : 'Not published'],
                        ['MX hosts', r.mx.length ? r.mx.join(', ') : '—'],
                    ]}
                />
                <Checks checks={r.checks} />
                {r.mtaSts?.policy?.raw && (
                    <details className="out-raw" open>
                        <summary>Policy file at https://mta-sts.{r.domain}/.well-known/mta-sts.txt</summary>
                        <pre className="out-console">{r.mtaSts.policy.raw}</pre>
                    </details>
                )}
                <Explain>
                    <p>
                        Without MTA-STS, senders try TLS but fall back to plain text when it fails, and an attacker on the path can make it fail. With
                        MTA-STS in enforce mode, senders that support it (Gmail, Microsoft and others) deliver only over TLS to an MX listed in the
                        policy with a valid certificate. Run the SMTP check on each MX to confirm their certificates.
                    </p>
                    <p>BIMI is optional branding. It only works when DMARC is enforced, because inboxes show the logo only on authenticated mail.</p>
                </Explain>
            </>
        );
    },
    next: (r) => [
        ...(r.mx[0] ? [{ tool: 'smtp', label: `Check the certificate on ${r.mx[0]}`, values: { host: r.mx[0] } }] : []),
        { tool: 'dmarc', label: `Check the DMARC policy of ${r.domain}`, values: { domain: r.domain } },
    ],
    target: (v) => v.domain,
};

// ---------------------------------------------------------------------------
// Blacklists
// ---------------------------------------------------------------------------

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

const LIST_ORDER: Record<ListState, number> = { listed: 0, not_listed: 3, blocked: 1, unavailable: 1, invalid: 2 };

function ListTable({ title, rows }: { title: string; rows: Result[] }) {
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => LIST_ORDER[a.state as ListState] - LIST_ORDER[b.state as ListState]);
    return (
        <div className="out-group">
            <h3 className="out-group-title">
                {title} <span className="faint">({rows.length})</span>
            </h3>
            <Table
                head={['List', 'Result', 'Details']}
                rows={sorted.map((x) => {
                    const st = LIST_STATE[x.state as ListState];
                    return [
                        <span>
                            {x.name} <span className="faint">{x.list}</span>
                        </span>,
                        <Status level={st.level}>{st.label}</Status>,
                        <span>
                            {x.reason ? <Linkified text={x.reason} /> : x.state === 'listed' ? `Return code ${x.codes.join(', ')}` : ''}
                            {x.note && <span className="faint"> {x.note}</span>}
                            {x.state === 'listed' && x.info && (
                                <>
                                    {' '}
                                    <a href={x.info} target="_blank" rel="noopener noreferrer nofollow" className="out-link">
                                        Lookup and removal
                                    </a>
                                </>
                            )}
                        </span>,
                    ];
                })}
                empty=""
                stack
                caption={title}
            />
        </div>
    );
}

function Blacklists({ r }: { r: Result }) {
    const results = r.results as Result[];
    const ipRows = results.filter((x) => x.kind === 'ip');
    const domainRows = results.filter((x) => x.kind === 'domain');
    const s = blacklistSummary(results as { state: ListState; name: string }[]);
    return (
        <>
            <Summary verdict={s.verdict}>
                {s.skipped.length > 0 && (
                    <p>
                        Not checked: {s.skipped.map((x) => `${x.name} (${LIST_STATE[x.state].label.toLowerCase()})`).join(', ')}.
                    </p>
                )}
            </Summary>
            {r.domain && r.ip && (
                <p className="tool-note">
                    IP lists were checked for <Mono>{r.ip}</Mono>, the IPv4 address {r.domain} resolves to. If mail for this domain is sent from other servers,
                    check their addresses too.
                </p>
            )}
            {r.domain && !r.ip && <p className="tool-note">{r.domain} has no IPv4 address, so only the domain lists were checked.</p>}
            <ListTable title={r.ip ? `IP lists for ${r.ip}` : 'IP lists'} rows={ipRows} />
            <ListTable title={`Domain lists for ${r.domain}`} rows={domainRows} />
            <Explain>
                <p>
                    Listed: the list returned a listing code for this address or domain. Refused us: the list does not answer queries from our server
                    (Spamhaus, SURBL and URIBL do not serve public DNS resolvers). Unavailable: the list did not answer or failed its own test query.
                    Unreliable: the list gave answers that do not match its documented behaviour, so they are ignored.
                </p>
                <p>
                    Results cover only the lists shown. Each mail provider uses its own filters and reputation data, so being on none of these lists
                    does not guarantee delivery, and a listing on a minor list may have little effect.
                </p>
            </Explain>
        </>
    );
}

const blacklist: ToolSpec = {
    id: 'blacklist',
    action: 'Check reputation lists',
    bestFor: 'Checking whether a mail server’s IP or a domain is on public spam lists (DNSBLs).',
    fields: [{ name: 'host', label: 'IPv4 address, mail server or domain', placeholder: 'mail.example.com', hint: 'A name is checked by its IPv4 address; a domain is also checked against domain lists.' }],
    runsOn: () => `Runs from our server: one DNS query per list, after checking each list answers its own test entries correctly.`,
    duration: 'usually 3–8 seconds',
    run: (v) => api('blacklist', { host: v.host }),
    render: (r) => <Blacklists r={r} />,
    next: (r) =>
        [
            ...(r.ip ? [{ tool: 'reverse', label: `Check the reverse DNS of ${r.ip}`, values: { ip: r.ip } }] : []),
            ...(r.domain ? [{ tool: 'mx', label: `Check ${r.domain}’s mail servers`, values: { domain: r.domain } }] : []),
            ...(r.ip ? [{ tool: 'whois', label: `Who is ${r.ip} registered to?`, values: { query: r.ip } }] : []),
        ] as Next[],
    target: (v) => v.host,
};

export const EMAIL_SPECS: ToolSpec[] = [dns, mx, ns, dnssec, spf, dmarc, dkim, smtp, mailpolicy, whois, blacklist];

