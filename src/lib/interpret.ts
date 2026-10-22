// What the tools' results mean, in plain words: verdicts, explanations and summaries computed from the raw
// measurements. Pure functions, no React, so they can be tested on their own (tests/interpret.test.ts).

/** pass: the check passed. issue: a problem was found. failed: the test itself could not run. neutral: a fact, or inconclusive. */
export type Level = 'pass' | 'issue' | 'failed' | 'neutral';

export type Verdict = { level: Level; label: string; title: string; detail?: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Ping
// ---------------------------------------------------------------------------

export function pingVerdict(sent: number, received: number): Verdict {
    const loss = sent ? Math.round(((sent - received) / sent) * 100) : 100;
    if (received === sent && sent > 0) {
        return { level: 'pass', label: `${received} of ${sent} replies`, title: 'The host answered every ping.' };
    }
    if (received > 0) {
        return {
            level: 'issue',
            label: `${loss}% loss`,
            title: `${received} of ${sent} pings were answered.`,
            detail: 'Some packets were lost. A few lost pings can be the host limiting ICMP replies; run an MTR to see whether loss continues along the route.',
        };
    }
    return {
        level: 'neutral',
        label: 'No replies',
        title: 'The host did not answer ping.',
        detail: 'Many servers and firewalls block ping (ICMP), so this does not prove the host or website is down. Check a TCP port the service uses, or run a traceroute to see where responses stop.',
    };
}

// ---------------------------------------------------------------------------
// Traceroute and MTR
// ---------------------------------------------------------------------------

export type Hop = { address: string | null; loss: number; sent?: number; avg: number | null };

export function traceVerdict(hops: Hop[], reached: boolean): Verdict {
    const answered = hops.filter((h) => h.address);
    const silent = hops.length - answered.length;
    const last = answered[answered.length - 1];
    const silentNote = silent
        ? ` ${plural(silent, 'hop')} did not answer; routers often ignore trace probes while still forwarding traffic, so that alone is not a fault.`
        : '';
    if (reached) {
        return { level: 'pass', label: 'Destination reached', title: `The destination answered after ${plural(hops.length, 'hop')}.`, detail: silentNote.trim() || undefined };
    }
    return {
        level: 'neutral',
        label: 'Destination did not answer',
        title: last ? `Responses stop after hop ${hops.indexOf(last) + 1} (${last.address}).` : 'No hop answered.',
        detail: `The destination, or a firewall in front of it, may simply drop trace probes. If the service itself works, this is expected; a TCP trace to the service’s port often gets further.${silentNote}`,
    };
}

/**
 * Reads an MTR run the way an engineer would: loss only counts if it carries on to the destination.
 * Loss on a middle hop that later hops do not show is that router rate-limiting its own replies.
 */
export function mtrVerdict(hops: Hop[]): Verdict & { from?: number } {
    const sent = Math.max(0, ...hops.map((h) => h.sent ?? 0));
    const sample = sent ? ` Each hop got ${plural(sent, 'probe')}, so one lost probe shows as ${Math.round(100 / sent)}% loss; a short sample like this is a hint, not proof. Run it again to confirm.` : '';
    const last = hops[hops.length - 1];
    if (!last || !last.address) {
        return {
            level: 'neutral',
            label: 'Destination did not answer',
            title: 'The destination did not answer MTR probes, so loss to it cannot be measured.',
            detail: `It may drop ICMP; try the TCP option.${sample}`,
        };
    }
    const middleLoss = hops.slice(0, -1).filter((h) => h.address && h.loss > 0);
    if (last.loss === 0) {
        return {
            level: 'pass',
            label: 'No loss at destination',
            title: 'Every probe to the destination was answered.',
            detail: middleLoss.length
                ? `Hop${middleLoss.length > 1 ? 's' : ''} ${middleLoss.map((h) => hops.indexOf(h) + 1).join(', ')} show loss that does not continue to the destination. That is usually those routers limiting their replies (ICMP rate limiting), not loss of real traffic.`
                : undefined,
        };
    }
    // The first hop from which every answering hop to the end shows loss.
    let from = hops.length - 1;
    while (from > 0 && (!hops[from - 1].address || hops[from - 1].loss > 0)) from--;
    while (from < hops.length - 1 && !hops[from].address) from++;
    return {
        level: 'issue',
        label: `${Math.round(last.loss)}% loss at destination`,
        title: from < hops.length - 1 ? `Loss starts around hop ${from + 1} (${hops[from].address}) and continues to the destination.` : 'Only the destination shows loss.',
        detail: (from < hops.length - 1
            ? 'Loss that persists from one hop to the end points to trouble at or after that hop.'
            : 'The destination itself may be limiting its replies, or be overloaded.') + sample,
        from,
    };
}

// ---------------------------------------------------------------------------
// Port check
// ---------------------------------------------------------------------------

export type PortState = 'open' | 'closed' | 'filtered' | 'error';

export const PORT_STATE: Record<PortState, { level: Level; label: string; meaning: string }> = {
    open: { level: 'pass', label: 'Connected', meaning: 'Something accepted the TCP connection. That shows the port is reachable, not that the application behind it works.' },
    closed: { level: 'neutral', label: 'Refused', meaning: 'The host answered and refused the connection: nothing listens on this port, or a firewall rejects it.' },
    filtered: {
        level: 'neutral',
        label: 'No response',
        meaning: 'No answer before the timeout. A firewall may be dropping the connection, or the host or route may be down; a timeout alone does not say which.',
    },
    error: { level: 'failed', label: 'Error', meaning: 'Our server could not attempt the connection.' },
};

// ---------------------------------------------------------------------------
// DNS
// ---------------------------------------------------------------------------

export type Outcome = 'found' | 'nodata' | 'nxdomain' | 'servfail' | 'refused' | 'timeout' | 'error';

export function outcomeVerdict(outcome: Outcome, name: string, type: string, count = 0): Verdict {
    switch (outcome) {
        case 'found':
            return { level: 'pass', label: plural(count, 'record'), title: `${name} has ${plural(count, `${type} record`)}.` };
        case 'nodata':
            return { level: 'neutral', label: 'No records', title: `${name} exists, but has no ${type} records.` };
        case 'nxdomain':
            return { level: 'issue', label: 'NXDOMAIN', title: `${name} does not exist in DNS.`, detail: 'NXDOMAIN means the name is not in its zone at all, not just missing this record type. Check the spelling, or whether the record was created.' };
        case 'servfail':
            return {
                level: 'failed',
                label: 'SERVFAIL',
                title: 'The resolver could not get an answer.',
                detail: 'SERVFAIL usually means the domain’s name servers are unreachable or broken, or its DNSSEC signatures do not validate. It says nothing about whether the record exists.',
            };
        case 'refused':
            return { level: 'failed', label: 'REFUSED', title: 'The DNS server refused to answer this query.' };
        case 'timeout':
            return { level: 'failed', label: 'Timed out', title: 'No DNS answer arrived in time.', detail: 'Try again, or ask another resolver.' };
        default:
            return { level: 'failed', label: 'Lookup failed', title: 'The lookup could not be completed.' };
    }
}

export type ProbeAnswer = { place: string; answers: string[]; code: string | null; failed?: boolean };

/** Groups locations that got the same answer set, most common first, then the ones that got no usable answer. */
export function groupAnswers(probes: ProbeAnswer[]): { answers: string[]; places: string[] }[] {
    const groups = new Map<string, { answers: string[]; places: string[] }>();
    for (const p of probes) {
        if (p.failed || !p.answers.length) continue;
        const answers = [...p.answers].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
        const key = answers.join('\n');
        if (!groups.has(key)) groups.set(key, { answers, places: [] });
        groups.get(key)!.places.push(p.place);
    }
    return [...groups.values()].sort((a, b) => b.places.length - a.places.length);
}

export function propagationVerdict(probes: ProbeAnswer[]): Verdict {
    const groups = groupAnswers(probes);
    const answered = groups.reduce((n, g) => n + g.places.length, 0);
    const failed = probes.filter((p) => p.failed).length;
    const empty = probes.length - answered - failed;
    const sample = `This compares ${plural(probes.length, 'location')}; it is a sample, not proof that every resolver in the world sees the same.`;
    if (!answered) {
        return { level: failed === probes.length ? 'failed' : 'neutral', label: failed === probes.length ? 'No results' : 'No records', title: 'No location returned records.', detail: sample };
    }
    if (groups.length === 1 && !empty && !failed) {
        return { level: 'pass', label: 'Same answer', title: `All ${plural(answered, 'location')} got the same answer.`, detail: sample };
    }
    if (groups.length === 1) {
        return {
            level: 'neutral',
            label: 'Partly answered',
            title: `${plural(answered, 'location')} got the same answer; ${empty + failed} got none.`,
            detail: `Locations with no answer may have a cached negative answer (NXDOMAIN or no data) from before the record existed, or failed to resolve. ${sample}`,
        };
    }
    return {
        level: 'neutral',
        label: `${groups.length} different answers`,
        title: `Locations returned ${groups.length} different answers.`,
        detail: `Differences can mean a change has not reached every resolver yet (old answers expire with their TTL), or that the domain answers by location on purpose, as CDNs and large sites do. ${sample}`,
    };
}

/** "86400" as "1 day", "300" as "5 min". */
export function duration(seconds: number | null | undefined): string {
    if (seconds == null) return '—';
    const units: [number, string][] = [
        [86400 * 7, 'week'],
        [86400, 'day'],
        [3600, 'h'],
        [60, 'min'],
    ];
    for (const [size, name] of units) {
        if (seconds >= size && seconds % size === 0) {
            const n = seconds / size;
            return name === 'h' || name === 'min' ? `${n} ${name}` : plural(n, name);
        }
    }
    if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
    return `${seconds} s`;
}

// ---------------------------------------------------------------------------
// Name servers
// ---------------------------------------------------------------------------

export type NsCheck = { host: string; check: { state: string; serial: number | null } | null };

/** The part of a name server's name that names its operator: ns1.cloudflare.com → cloudflare.com. */
const operatorOf = (host: string) => host.split('.').slice(-2).join('.');

export function nsVerdicts(records: NsCheck[]): Verdict[] {
    const out: Verdict[] = [];
    if (!records.length) return out;
    if (records.length < 2) {
        out.push({ level: 'issue', label: 'Single server', title: 'Only one name server is listed. If it fails, the domain stops resolving; RFC 1034 asks for at least two.' });
    }
    const checked = records.filter((r) => r.check && ['authoritative', 'not_authoritative', 'timeout', 'error'].includes(r.check.state));
    const auth = checked.filter((r) => r.check!.state === 'authoritative');
    const bad = checked.filter((r) => r.check!.state !== 'authoritative');
    if (bad.length) {
        out.push({
            level: 'issue',
            label: `${bad.length} not answering`,
            title: `${bad.map((r) => r.host).join(', ')} did not give an authoritative answer for the zone.`,
            detail: 'A listed name server that does not serve the zone (a “lame delegation”) slows down or breaks lookups for some visitors.',
        });
    } else if (auth.length) {
        out.push({ level: 'pass', label: 'All answered', title: `All ${plural(auth.length, 'name server')} we queried answered authoritatively.` });
    }
    const serials = new Map<number, string[]>();
    for (const r of auth) {
        const s = r.check!.serial!;
        serials.set(s, [...(serials.get(s) ?? []), r.host]);
    }
    if (serials.size > 1) {
        // Different operators keep their own serial numbers; differences within one operator mean a stale copy.
        const perOperator = new Map<string, Set<number>>();
        for (const r of auth) {
            const op = operatorOf(r.host);
            perOperator.set(op, (perOperator.get(op) ?? new Set()).add(r.check!.serial!));
        }
        const stale = [...perOperator.values()].some((s) => s.size > 1);
        out.push(
            stale
                ? {
                      level: 'issue',
                      label: 'Serials differ',
                      title: 'Name servers of the same operator return different SOA serials.',
                      detail: 'One of them may not have received the latest version of the zone yet. Check again in a few minutes.',
                  }
                : {
                      level: 'neutral',
                      label: 'Serials differ',
                      title: 'The SOA serial differs between DNS operators.',
                      detail: 'With more than one DNS provider this is normal: each keeps its own serial number. Compare the records themselves to make sure both serve the same data.',
                  },
        );
    } else if (serials.size === 1 && auth.length > 1) {
        out.push({ level: 'pass', label: 'Serials match', title: `Every name server returns serial ${[...serials.keys()][0]}.` });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Email authentication
// ---------------------------------------------------------------------------

const QUALIFIER: Record<string, string> = { '+': 'Pass', '-': 'Fail', '~': 'Soft fail', '?': 'Neutral' };

/** What an SPF term does, in a sentence. */
export function spfTermMeaning(t: { name: string; qualifier: string; value: string | null }): string {
    const q = QUALIFIER[t.qualifier] ?? '';
    const on = (what: string) => (t.qualifier === '+' ? `Allows ${what}` : `${q} for ${what}`);
    const domain = t.value ? t.value.split('/')[0] : 'this domain';
    switch (t.name) {
        case 'all':
            return `${q} for every server not matched earlier`;
        case 'ip4':
        case 'ip6':
            return on(t.value ?? 'these addresses');
        case 'a':
            return on(`the A/AAAA addresses of ${domain}`);
        case 'mx':
            return on(`the mail servers (MX) of ${domain}`);
        case 'include':
            return on(`whatever ${t.value} allows in its own SPF`);
        case 'exists':
            return on(`senders for which ${t.value} resolves`);
        case 'ptr':
            return on('senders whose reverse DNS ends in this domain');
        case 'redirect':
            return `Use ${t.value}’s SPF policy when nothing here matches`;
        case 'exp':
            return `Explanation text for rejected mail, from ${t.value}`;
        default:
            return 'Not recognised';
    }
}

export const DMARC_TAGS: Record<string, string> = {
    v: 'Version: must be DMARC1',
    p: 'Policy for mail that fails DMARC: none (report only), quarantine (treat as suspicious) or reject',
    sp: 'Policy for subdomains (defaults to p)',
    np: 'Policy for subdomains that do not exist',
    pct: 'Share of failing mail the policy applies to (default 100)',
    rua: 'Where receivers send daily aggregate reports',
    ruf: 'Where receivers send failure reports (few send them)',
    adkim: 'DKIM alignment: r (relaxed, subdomains match) or s (strict, exact domain)',
    aspf: 'SPF alignment: r (relaxed) or s (strict)',
    fo: 'When to send failure reports',
    rf: 'Format of failure reports',
    ri: 'Requested seconds between aggregate reports',
};

export const DKIM_TAGS: Record<string, string> = {
    v: 'Version: DKIM1',
    k: 'Key type (rsa by default, or ed25519)',
    p: 'The public key; empty means revoked',
    t: 'Flags: y = testing, s = no subdomains',
    h: 'Hash algorithms the key may be used with',
    s: 'Service types the key may be used for',
    n: 'Notes for people',
};

// ---------------------------------------------------------------------------
// Registration (RDAP)
// ---------------------------------------------------------------------------

/** What the common EPP status codes mean (RDAP spells them "client transfer prohibited"). */
export function eppMeaning(status: string): string | null {
    const s = status.toLowerCase().replace(/\s+/g, '');
    const map: Record<string, string> = {
        active: 'Normal state; no restrictions',
        ok: 'Normal state; no restrictions',
        clienttransferprohibited: 'Transfer lock set by the registrar (common protection)',
        servertransferprohibited: 'Transfer lock set by the registry',
        clientdeleteprohibited: 'Registrar blocks deletion',
        serverdeleteprohibited: 'Registry blocks deletion',
        clientupdateprohibited: 'Registrar blocks changes',
        serverupdateprohibited: 'Registry blocks changes',
        clienthold: 'Registrar has taken the domain out of DNS; it does not resolve',
        serverhold: 'Registry has taken the domain out of DNS; it does not resolve',
        redemptionperiod: 'Expired and deleted; the owner can still restore it for a fee',
        pendingdelete: 'About to be released for anyone to register',
        pendingtransfer: 'A transfer to another registrar is in progress',
        autorenewperiod: 'Recently auto-renewed',
        renewperiod: 'Recently renewed',
        addperiod: 'Recently registered',
        inactive: 'No name servers delegated, so it does not resolve',
        clientrenewprohibited: 'Registrar blocks renewal',
        serverrenewprohibited: 'Registry blocks renewal',
    };
    return map[s] ?? null;
}

// ---------------------------------------------------------------------------
// Blacklists
// ---------------------------------------------------------------------------

export type ListState = 'listed' | 'not_listed' | 'blocked' | 'unavailable' | 'invalid';

export const LIST_STATE: Record<ListState, { level: Level; label: string }> = {
    listed: { level: 'issue', label: 'Listed' },
    not_listed: { level: 'pass', label: 'Not listed' },
    blocked: { level: 'neutral', label: 'Refused us' },
    unavailable: { level: 'neutral', label: 'Unavailable' },
    invalid: { level: 'neutral', label: 'Unreliable' },
};

export function blacklistSummary(results: { state: ListState; name: string }[]) {
    const count = (s: ListState) => results.filter((r) => r.state === s).length;
    const listed = count('listed');
    const checked = listed + count('not_listed');
    const skipped = results.filter((r) => r.state !== 'listed' && r.state !== 'not_listed');
    const coverage = `${checked} of ${plural(results.length, 'list')} checked`;
    let verdict: Verdict;
    if (!checked) {
        verdict = { level: 'failed', label: 'No lists answered', title: 'None of the lists gave a usable answer, so nothing was checked.' };
    } else if (listed) {
        verdict = { level: 'issue', label: `Listed on ${listed}`, title: `Listed on ${plural(listed, 'list')} (${coverage}).` };
    } else {
        verdict = { level: 'pass', label: 'Not listed', title: `Not listed on any of the ${plural(checked, 'list')} we could check (${coverage}).` };
    }
    return { verdict, listed, checked, skipped, coverage };
}

// ---------------------------------------------------------------------------
// BGP: routes, RPKI and AS paths
// ---------------------------------------------------------------------------

/** RIPEstat's RPKI states (from its Routinator validator), in plain words. */
export const RPKI_STATE: Record<string, { level: Level; label: string; meaning: string }> = {
    valid: { level: 'pass', label: 'RPKI valid', meaning: 'A ROA (Route Origin Authorisation) allows this AS to announce this prefix at this length.' },
    invalid_asn: {
        level: 'issue',
        label: 'RPKI invalid',
        meaning: 'ROAs cover this prefix, but none allows this origin AS. Networks that validate RPKI drop the route.',
    },
    invalid_length: {
        level: 'issue',
        label: 'RPKI invalid',
        meaning: 'A ROA allows this origin AS, but not a prefix this specific (longer than its max length). Networks that validate RPKI drop the route.',
    },
    invalid: { level: 'issue', label: 'RPKI invalid', meaning: 'The route does not match the ROAs for this address space. Networks that validate RPKI drop it.' },
    unknown: {
        level: 'neutral',
        label: 'No ROA',
        meaning: 'No ROA covers this prefix (RPKI “not found”). Networks still accept the route, but RPKI does not protect it against hijacks.',
    },
};

export type RouteFacts = {
    query: string;
    prefix: string;
    announced: boolean;
    origins: { asn: number }[];
    visibility: { seeing: number; total: number } | null;
    rpki: { asn: number; status: string | null }[];
};

export function routeVerdict(r: RouteFacts): Verdict {
    if (!r.announced) {
        return {
            level: 'neutral',
            label: 'Not announced',
            title: `No route covers ${r.query} in the global routing table.`,
            detail: 'RIS route collectors see no announcement for it. The address space may be unused, routed only inside a network, or withdrawn.',
        };
    }
    const invalid = r.rpki.find((x) => RPKI_STATE[x.status ?? '']?.level === 'issue');
    if (invalid) {
        return {
            level: 'issue',
            label: 'RPKI invalid',
            title: `${r.prefix} from AS${invalid.asn} fails RPKI validation.`,
            detail: `${RPKI_STATE[invalid.status!].meaning} Parts of the internet may not reach it.`,
        };
    }
    if (r.origins.length > 1) {
        return {
            level: 'issue',
            label: 'Multiple origins',
            title: `${r.prefix} is announced by ${r.origins.length} networks: ${r.origins.map((o) => `AS${o.asn}`).join(', ')}.`,
            detail: 'Several origin ASes for one prefix (MOAS) can be intended, for anycast or during a move between providers, or can be a hijack or a leak. Check that every origin is expected.',
        };
    }
    const origin = `AS${r.origins[0]?.asn}`;
    const seen = r.visibility ? ` and seen by ${plural(r.visibility.seeing, 'RIS peer')} of ${r.visibility.total}` : '';
    if (r.visibility && r.visibility.seeing < r.visibility.total * 0.9) {
        return {
            level: 'neutral',
            label: 'Partly visible',
            title: `${r.prefix} is announced by ${origin}${seen}.`,
            detail: 'Some networks have no route to it. This is common for very specific prefixes that some networks filter, and for routes announced only to some peers or changed in the last hours.',
        };
    }
    return { level: 'pass', label: 'Announced', title: `${r.prefix} is announced by ${origin}${seen}.` };
}

/** The networks a trace crossed, in order: each hop's AS, with silent hops and repeats left out. */
export function hopsAsPath(hops: { asn: number | null }[]): number[] {
    const path: number[] = [];
    for (const h of hops) if (h.asn && path[path.length - 1] !== h.asn) path.push(h.asn);
    return path;
}
