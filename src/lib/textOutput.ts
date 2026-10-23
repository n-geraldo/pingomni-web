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

const outcomeText: Record<string, string> = {
    nodata: 'no records of this type (NOERROR, empty answer)',
    nxdomain: 'NXDOMAIN: the name does not exist',
    servfail: 'SERVFAIL: the resolver could not get an answer',
    refused: 'REFUSED',
    timeout: 'no answer (timed out)',
    error: 'lookup failed',
};

/** dig-style answer lines for our server's lookups, with the status when there are none. */
const lookupText = (name: string, l: R) =>
    l.records.length
        ? columns(l.records.map((x: R) => [`${x.name}.`, x.ttl, 'IN', x.type, x.value]), [1])
        : `; ${name} ${l.type}: ${outcomeText[l.outcome] ?? l.status}`;

const checksText = (checks: R[]) => checks.map((c) => `[${c.level}] ${c.text}`).join('\n');

const LIST_TEXT: Record<string, string> = { listed: 'LISTED', not_listed: 'not listed', blocked: 'refused us', unavailable: 'unavailable', invalid: 'unreliable' };

const TEXT: Record<string, (r: R) => string> = {
    ping: (r) => (r.probes ? perProbe(r.probes) : r.raw ?? ''),

    traceroute: (r) =>
        r.traces
            ? perProbe(r.traces)
            : [
                  `traceroute to ${r.host} (${r.ip}), ${r.hops.length} hops`,
                  ...r.hops.map((h: R) =>
                      h.address
                          ? `${String(h.hop).padStart(2)}  ${h.name ? `${h.name} (${h.address})` : h.address}${h.asn ? `  [AS${h.asn}]` : ''}  ${n(h.avg, 3)} ms`
                          : `${String(h.hop).padStart(2)}  * * *`,
                  ),
              ].join('\n'),

    mtr: (r) =>
        r.runs[0]?.place
            ? r.runs.map((run: R) => `${probeTitle(run.place)}\n${run.place.raw || mtrReport(r.target, run.hops)}`).join('\n\n')
            : `Start: ${r.measuredAt ?? new Date().toISOString()}\n${mtrReport('pingomni-server', r.runs[0].hops)}`,

    dns: (r) =>
        r.probes
            ? perProbe(r.probes)
            : r.lookups.map((l: R) => lookupText(r.name, l)).join('\n'),

    port: (r) =>
        r.results
            ? [`Common ports on ${r.host} (${r.ip})`, '', columns([['PORT', 'RESULT', 'TIME'], ...r.results.map((x: R) => [`${x.port}/tcp`, x.state === 'open' ? 'connected' : x.state === 'closed' ? 'refused' : x.state === 'filtered' ? 'no response' : `error: ${x.error}`, x.ms == null ? '' : `${x.ms} ms`])])].join('\n')
            : `${r.host} (${r.ip}) port ${r.port}/tcp: ${r.state === 'open' ? `connected in ${r.ms} ms` : r.state === 'closed' ? 'connection refused' : r.state === 'filtered' ? 'no response within 4 s' : `error: ${r.error}`}`,

    reverse: (r) =>
        [
            r.names.length ? r.names.map((name: string) => `${r.arpa}.  IN  PTR  ${name}.`).join('\n') : `; ${r.arpa}: ${outcomeText[r.lookup.outcome] ?? r.lookup.status}`,
            ...r.forward.map((f: R) => `; ${f.name} -> ${f.addresses.join(', ') || '(no address)'}: ${f.matches ? 'matches' : 'does not match'} ${r.ip}`),
        ].join('\n'),

    proxy: (r) =>
        [`Your IP: ${r.ip}${r.hostname ? ` (${r.hostname})` : ''}`, `Proxy-related headers: ${Object.keys(r.headers).length ? 'found' : 'none'}`, ...Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`)].join('\n'),

    bandwidth: (r) => `Download: ${r.mbps.toFixed(1)} Mbit/s (${(r.bytes / 1048576).toFixed(1)} MB in ${r.secs.toFixed(2)} s, ${(r.used / 1048576).toFixed(1)} MB used in total)\nRound trip: ${n(r.latency)} ms`,

    mx: (r) =>
        r.nullMx
            ? `${r.domain}.  IN  MX  0 .   ; null MX: accepts no mail`
            : r.records.length
              ? columns(r.records.map((x: R) => [`${r.domain}.`, x.ttl, 'IN', 'MX', x.priority, `${x.host}.`, x.ips.join(', ')]), [1, 4])
              : `; ${r.domain} MX: ${outcomeText[r.lookup.outcome] ?? r.lookup.status}`,

    ns: (r) =>
        [
            ...r.records.map((x: R) => `${r.domain}.  ${x.ttl}  IN  NS  ${x.host}.  ${x.ips.join(', ')}${x.check?.serial != null ? `  ; serial ${x.check.serial}` : x.check ? `  ; ${x.check.state}` : ''}`),
            ...(r.soa ? [`${r.domain}.  IN  SOA  ${r.soa.primary}. ${r.soa.contact} ${r.soa.serial} ${r.soa.refresh} ${r.soa.retry} ${r.soa.expire} ${r.soa.minimum}`] : []),
        ].join('\n') || `; ${r.domain} NS: ${outcomeText[r.lookup.outcome] ?? r.lookup.status}`,

    spf: (r) => [...r.records.map((t: string) => `${r.domain}.  IN  TXT  "${t}"`), ...(r.records.length ? [] : [`; no SPF record for ${r.domain}`]), '', checksText(r.checks)].join('\n'),

    dmarc: (r) => [r.record ? `_dmarc.${r.domain}.  IN  TXT  "${r.record}"` : `; no DMARC record at _dmarc.${r.domain}`, '', checksText(r.checks)].join('\n'),

    dkim: (r) =>
        [
            ...(r.discovered?.length ? [`; keys found: ${r.discovered.map((d: R) => `${d.selector}${d.revoked ? ' (revoked)' : ''}`).join(', ')}`] : []),
            r.record ? `${r.name}.  IN  TXT  "${r.record}"` : r.name ? `; no DKIM key at ${r.name}` : `; no key under ${r.tried?.length ?? 'the'} common selectors`,
            '',
            checksText(r.checks),
        ].join('\n'),

    smtp: (r) =>
        r.nullMx
            ? `${r.input} has a null MX: it accepts no mail`
            : r.connected
              ? [
                    `Connected to ${r.server} (${r.ip}):25 in ${r.ms} ms`,
                    ...r.transcript.map((t: R) => (t.dir === 'note' ? `-- ${t.text}` : `${t.dir === 'in' ? 'S:' : 'C:'} ${t.text.replace(/\n/g, '\nS: ')}`)),
                    ...(r.checks?.length ? ['', checksText(r.checks)] : []),
                ].join('\n')
              : `Could not connect to ${r.server} (${r.ip}):25: ${r.error}`,

    whois: (r) =>
        !r.found
            ? r.supported === false
                ? `; the .${r.tld} registry does not offer RDAP`
                : `; no registration record for ${r.query} (${r.source ?? 'RDAP'})`
            : [
                  ...Object.entries(
                      r.kind === 'domain'
                          ? { Domain: r.name, Registrar: r.registrar?.name, Status: r.status.join(', '), Registered: r.events.registration, Expires: r.events.expiration, 'Last changed': r.events['last changed'], 'Name servers': r.nameservers.join(', '), Source: r.source }
                          : { Network: r.name, Range: r.range, Handle: r.handle, Type: r.type, Country: r.country, Registered: r.events.registration, Source: r.source },
                  )
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${`${k}:`.padEnd(14)}${v}`),
                  ...r.contacts
                      .filter((c: R) => c.fn || c.org || c.email)
                      .map((c: R) => `${`${c.roles.join(', ') || 'contact'}:`.padEnd(14)}${[c.fn ?? c.org, c.email, c.tel, c.address].filter(Boolean).join(' | ')}`),
                  ...(r.redacted.length ? [`${'Hidden:'.padEnd(14)}${r.redacted.join('; ')}`] : []),
              ].join('\n'),

    blacklist: (r) =>
        [
            `Checked ${[r.domain, r.ip].filter(Boolean).join(' / ')} against ${r.results.length} lists`,
            '',
            columns(r.results.map((x: R) => [x.list, LIST_TEXT[x.state] ?? x.state, x.reason ?? ''])),
        ].join('\n'),

    asn: (r) =>
        r.special
            ? `AS${r.asn}: ${r.special}`
            : [
                  ...Object.entries({
                      'aut-num:': `AS${r.asn}`,
                      'holder:': r.holder,
                      'announced:': r.announced ? 'yes' : 'no',
                      'prefixes:': `${r.prefixes.v4} IPv4, ${r.prefixes.v6} IPv6`,
                      'registry:': r.block?.desc,
                      'peeringdb:': r.peeringdb && [r.peeringdb.name, r.peeringdb.type, r.peeringdb.policy && `policy ${r.peeringdb.policy}`, r.peeringdb.irrAsSet].filter(Boolean).join(', '),
                  })
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k.padEnd(12)}${v}`),
                  ...(r.neighbours
                      ? [
                            '',
                            '; upstreams and peers (left of this AS in RIS paths)',
                            ...r.neighbours.left.map((n: R) => `AS${n.asn}  ${n.name ?? ''}`.trimEnd()),
                            '; customers (right of this AS in RIS paths)',
                            ...r.neighbours.right.map((n: R) => `AS${n.asn}  ${n.name ?? ''}`.trimEnd()),
                        ]
                      : []),
                  ...(r.prefixes.list.length ? ['', '; announced prefixes', ...r.prefixes.list] : []),
              ].join('\n'),

    prefix: (r) =>
        !r.announced
            ? `; ${r.query}: not in the global routing table (no RIS collector sees a route)`
            : [
                  ...Object.entries({
                      'route:': r.prefix,
                      'origin:': r.origins.map((o: R) => `AS${o.asn}${o.holder ? ` (${o.holder})` : ''}`).join(', '),
                      'rpki:': r.rpki.map((x: R) => `AS${x.asn} ${x.status ?? 'not checked'}`).join(', '),
                      'visibility:': r.visibility && `${r.visibility.seeing}/${r.visibility.total} RIS peers`,
                      'first seen:': r.firstSeen && `${r.firstSeen.time.slice(0, 10)} from AS${r.firstSeen.origin}`,
                      'covered by:': r.lessSpecifics.map((l: R) => `${l.prefix} (AS${l.origin})`).join(', '),
                  })
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k.padEnd(12)}${v}`),
                  ...(r.paths
                      ? [
                            '',
                            `; ${r.paths.unique} distinct AS paths from ${r.paths.total} RIS peers; most common:`,
                            columns(r.paths.top.map((p: R) => [p.path.join(' '), `${p.peers} peers`])),
                            '',
                            '; upstreams of the origin',
                            ...r.paths.upstreams.map((u: R) => `AS${u.asn}  ${u.paths} paths  ${u.name ?? ''}`.trimEnd()),
                        ]
                      : []),
              ].join('\n'),

    dnssec: (r) =>
        [
            ...r.ds.map((d: R) => `${r.domain}.  IN  DS  ${d.tag} ${d.algorithm} ${d.digestType} ${d.digest}`),
            ...r.keys.map((k: R) => `${r.domain}.  IN  DNSKEY  ${k.flags} 3 ${k.algorithm} ( ... ) ; ${k.role} key id = ${k.tag}`),
            ...r.signatures.map((x: R) => `${r.domain}.  IN  RRSIG  ${x.covers} ${x.algorithm} key id = ${x.tag}, valid ${(x.inception ?? '').slice(0, 10)} to ${(x.expires ?? '').slice(0, 10)}`),
            ...(r.signed ? [] : [`; ${r.domain} is not signed`]),
            '',
            checksText(r.checks),
        ].join('\n'),

    mailpolicy: (r) =>
        [
            r.mtaSts ? `_mta-sts.${r.domain}.  IN  TXT  "${r.mtaSts.record}"` : `; no MTA-STS record`,
            r.tlsRpt ? `_smtp._tls.${r.domain}.  IN  TXT  "${r.tlsRpt.record}"` : `; no TLS-RPT record`,
            r.bimi ? `default._bimi.${r.domain}.  IN  TXT  "${r.bimi.record}"` : `; no BIMI record`,
            ...(r.mtaSts?.policy?.raw ? ['', `; https://mta-sts.${r.domain}/.well-known/mta-sts.txt`, r.mtaSts.policy.raw] : []),
            '',
            checksText(r.checks),
        ].join('\n'),

    tls: (r) =>
        r.handshake
            ? [
                  `; ${r.host}:${r.port} (${r.ip}), ${r.tls.protocol} ${r.tls.cipher}`,
                  `; TLS versions: ${r.versions.map((v: R) => `${v.version} ${v.supported ? 'on' : 'off'}`).join(', ')}`,
                  ...r.tls.chain.map((c: R, i: number) => `${i === 0 ? 'cert' : `chain ${i}`}: ${c.subject ?? '?'}  issuer: ${c.issuerCn ?? c.issuer ?? '?'}  until ${(c.notAfter ?? '').slice(0, 10)}`),
                  '',
                  checksText(r.checks),
              ].join('\n')
            : `; ${r.host}:${r.port}: ${r.checks[0].text}`,

    announce: (r) =>
        [
            `; ${r.prefix}${r.expected ? `, expected origin AS${r.expected}` : ''}`,
            `; announced by: ${r.origins.length ? r.origins.map((o: R) => `AS${o.asn}${o.name ? ` (${o.name})` : ''}`).join(', ') : 'nobody'}`,
            ...(r.visibility ? [`; visibility: ${r.visibility.seeing}/${r.visibility.total} full-table RIS peers`] : []),
            '',
            checksText(r.checks),
            ...(r.visibility?.collectors.some((c: R) => c.notSeeing.length)
                ? ['', '; peers without a route', columns(r.visibility.collectors.flatMap((c: R) => c.notSeeing.map((p: R) => [c.rrc, p.ip, `AS${p.asn}`, p.name ?? ''])))]
                : []),
        ].join('\n'),

    lg: (r) =>
        r.collectors.length
            ? r.collectors
                  .map((c: R) =>
                      [
                          `### ${c.rrc} ${c.location}`,
                          columns([['PEER', 'AS PATH', 'NEXT HOP', 'COMMUNITIES'], ...c.peers.map((p: R) => [p.peer, p.path.join(' '), p.nextHop, p.communities])]),
                      ].join('\n'),
                  )
                  .join('\n\n')
            : `; no RIS collector has a route to ${r.query}`,
};

export const toText = (tool: string, result: R): string => (TEXT[tool]?.(result) ?? JSON.stringify(result, null, 2)).trim();
