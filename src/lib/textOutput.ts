// Plain-text, command-line style versions of every tool's result, for the Text view and its Copy button.
// Results from Globalping probes carry the probe's real command output; our server's results are formatted here.

type R = Record<string, any>;

const n = (v: number | null | undefined, digits = 1) => (v == null ? '???' : v.toFixed(digits));

/** Lines up columns: every cell padded to the widest in its column. */
function columns(rows: (string | number)[][], right: number[] = []): string {
    const cells = rows.map((r) => r.map((c) => String(c ?? '')));
    const widths = cells[0].map((_, i) => Math.max(...cells.map((r) => (r[i] ?? '').length)));
    return cells
        .map((r) => r.map((c, i) => (right.includes(i) ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ').trimEnd())
        .join('\n');
}

const probeTitle = (p: R) => `### ${p.city}, ${p.country} (${p.network}, AS${p.asn})`;

/** One block per Globalping probe, each with its own command output. */
const perProbe = (list: R[]) => list.map((p) => `${probeTitle(p)}\n${p.raw || '(no output)'}`).join('\n\n');

function mtrReport(host: string, hops: R[]): string {
    const head = ['HOST: ' + host, 'Loss%', 'Snt', 'Avg', 'Best', 'Wrst', 'StDev'];
    const rows = hops.map((h, i) => [
        `${String(i + 1).padStart(3)}.|-- ${h.address ? (h.name ? `${h.name} (${h.address})` : h.address) : '???'}${h.asn ? `  AS${h.asn}` : ''}`,
        `${h.address ? h.loss.toFixed(1) : '100.0'}%`,
        h.sent,
        n(h.avg),
        n(h.best),
        n(h.worst),
        n(h.stdev),
    ]);
    return columns([head, ...rows], [1, 2, 3, 4, 5, 6]);
}

const TEXT: Record<string, (r: R) => string> = {
    ping: (r) => (r.probes ? perProbe(r.probes) : r.raw ?? ''),

    traceroute: (r) =>
        r.traces
            ? perProbe(r.traces)
            : [
                  `traceroute to ${r.host} (${r.ip}), ${r.hops.length} hops`,
                  ...r.hops.map((h: R) =>
                      h.host
                          ? `${String(h.hop).padStart(2)}  ${h.name && h.name !== h.host ? `${h.name} (${h.host})` : h.host}  ${n(h.avg, 3)} ms`
                          : `${String(h.hop).padStart(2)}  * * *`,
                  ),
              ].join('\n'),

    mtr: (r) =>
        r.runs[0]?.place
            ? r.runs.map((run: R) => `${probeTitle(run.place)}\n${run.place.raw || mtrReport(r.target, run.hops)}`).join('\n\n')
            : `Start: ${new Date().toISOString()}\n${mtrReport('pingomni-server', r.runs[0].hops)}`,

    dns: (r) =>
        r.lookups
            ? perProbe(r.lookups)
            : r.records.length
              ? columns(
                    [...r.records]
                        .sort((a: R, b: R) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value, 'en', { numeric: true }))
                        .map((x: R) => [`${r.name}.`, x.ttl, 'IN', x.type, x.value]),
                    [1],
                )
              : `; no ${r.type === 'ALL' ? '' : `${r.type} `}records for ${r.name}`,

    port: (r) =>
        r.results
            ? [`Common ports on ${r.host} (${r.ip})`, '', columns([['PORT', 'STATE', 'TIME'], ...r.results.map((x: R) => [`${x.port}/tcp`, x.state, x.ms == null ? '' : `${x.ms} ms`])])].join('\n')
            : `${r.host} (${r.ip}) port ${r.port}/tcp is ${r.state}${r.ms != null && r.state === 'open' ? ` (${r.ms} ms)` : ''}`,

    reverse: (r) => `${r.ip.split('.').reverse().join('.')}.in-addr.arpa  PTR  ${r.hostname ?? '(none)'}${r.hostname ? `\nforward check: ${r.confirmed ? 'matches' : 'does not match'}` : ''}`,

    proxy: (r) =>
        [`Your IP: ${r.ip}${r.hostname ? ` (${r.hostname})` : ''}`, `Proxy detected: ${r.detected ? 'yes' : 'no'}`, ...Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`)].join('\n'),

    bandwidth: (r) => `Download: ${r.mbps.toFixed(1)} Mbit/s (${(r.bytes / 1048576).toFixed(1)} MB in ${r.secs.toFixed(2)} s)\nRound trip: ${n(r.latency)} ms`,

    subnet: (r) => columns(r.rows.map((x: R) => [`${x.label}:`, x.value])),

    mask: (r) =>
        [
            `Smallest network: ${r.cover.cidr}  mask ${r.cover.mask}  (${r.cover.size} addresses)`,
            ...(r.exact ? [] : ['', 'Exact cover:', columns(r.blocks.map((b: R) => [b.cidr, b.mask, b.size]), [2])]),
        ].join('\n'),

    mx: (r) => (r.records.length ? columns(r.records.map((x: R) => [`${r.domain}.`, x.ttl, 'IN', 'MX', x.priority, `${x.host}.`, x.ips.join(', ')]), [1, 4]) : `; ${r.domain} has no MX records`),

    ns: (r) =>
        [
            ...r.records.map((x: R) => `${r.domain}.  ${x.ttl}  IN  NS  ${x.host}.  ${x.ips.join(', ')}`),
            ...(r.soa ? [`${r.domain}.  IN  SOA  ${r.soa.primary}. ${r.soa.contact}. ${r.soa.serial} ${r.soa.refresh} ${r.soa.retry} ${r.soa.expire} ${r.soa.minimum}`] : []),
        ].join('\n'),

    spf: (r) => [r.record ? `${r.domain}.  IN  TXT  "${r.record}"` : `; no SPF record for ${r.domain}`, '', ...r.notes.map((x: R) => `[${x.level}] ${x.text}`)].join('\n'),

    dmarc: (r) => [r.record ? `_dmarc.${r.domain}.  IN  TXT  "${r.record}"` : `; no DMARC record for ${r.domain}`, '', ...r.notes.map((x: R) => `[${x.level}] ${x.text}`)].join('\n'),

    dkim: (r) => (r.record ? `${r.name}.  IN  TXT  "${r.record}"${r.bits ? `\n; ${r.bits}-bit key` : ''}` : `; no DKIM key at ${r.name}`),

    smtp: (r) =>
        r.connected
            ? [`Connected to ${r.server} (${r.ip}):25 in ${r.ms} ms`, `< ${r.banner}`, '> EHLO tools.pingomni.com', ...r.capabilities.map((c: string) => `< 250 ${c}`), '> QUIT'].join('\n')
            : `Could not connect to ${r.server} (${r.ip}):25 — ${r.error}`,

    whois: (r) =>
        [
            ...Object.entries(
                r.kind === 'domain'
                    ? { Domain: r.name, Status: r.status.join(', '), Registered: r.events.registration, Expires: r.events.expiration, 'Last changed': r.events['last changed'], 'Name servers': r.nameservers.join(', '), Source: r.source }
                    : { Network: r.name, Range: r.range, Handle: r.handle, Type: r.type, Country: r.country, Registered: r.events.registration, Source: r.source },
            )
                .filter(([, v]) => v)
                .map(([k, v]) => `${`${k}:`.padEnd(14)}${v}`),
            ...r.contacts
                .filter((c: R) => c.fn || c.org || c.email)
                .map((c: R) => `${`${c.roles.join(', ') || 'contact'}:`.padEnd(14)}${[c.fn ?? c.org, c.email, c.tel, c.address].filter(Boolean).join(' | ')}`),
        ].join('\n'),

    blacklist: (r) =>
        [
            `Checked ${[r.domain, r.ip].filter(Boolean).join(' / ')} against ${r.results.length} lists`,
            '',
            columns(r.results.map((x: R) => [x.list, x.state === 'listed' ? 'LISTED' : x.state === 'clean' ? 'ok' : 'no answer', x.reason ?? ''])),
        ].join('\n'),
};

export const toText = (tool: string, result: R): string => (TEXT[tool]?.(result) ?? JSON.stringify(result, null, 2)).trim();
