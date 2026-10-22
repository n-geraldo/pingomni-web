// Globalping (globalping.io, by jsDelivr): a free, open network of probes worldwide.
// Called straight from the visitor's browser, so each visitor uses their own free allowance (250 tests an hour).

const API = 'https://api.globalping.io/v1/measurements';

type Location = { magic: string; limit: number };

export type ProbeInfo = { country: string; city: string; network: string; asn: number; status: string; raw: string };

export type PingProbe = ProbeInfo & { resolved: string | null; min: number | null; avg: number | null; max: number | null; loss: number | null };

export type TraceProbe = ProbeInfo & {
    resolved: string | null;
    hops: { address: string | null; name: string | null; avg: number | null }[];
};

export type DnsProbe = ProbeInfo & {
    resolver: string | null;
    code: string | null;
    ms: number | null;
    answers: { type: string; ttl: number; value: string }[];
};

// Places to test from, as Globalping "magic" locations. "Around the world" asks every continent,
// because Globalping's own "world" leans on Europe and North America, where most probes are.
export const TEST_FROM: { label: string; locations?: Location[] }[] = [
    { label: 'Our server' },
    {
        label: 'Around the world',
        locations: [
            { magic: 'Europe', limit: 2 },
            { magic: 'North America', limit: 2 },
            { magic: 'Asia', limit: 2 },
            { magic: 'South America', limit: 1 },
            { magic: 'Oceania', limit: 1 },
            { magic: 'Africa', limit: 1 },
        ],
    },
    ...['Europe', 'North America', 'South America', 'Asia', 'Africa', 'Oceania'].map((c) => ({ label: c, locations: [{ magic: c, limit: 4 }] })),
    ...[
        'Albania', 'Australia', 'Austria', 'Bosnia and Herzegovina', 'Brazil', 'Bulgaria', 'Canada', 'Croatia', 'France',
        'Germany', 'Greece', 'India', 'Italy', 'Japan', 'Kosovo', 'Mexico', 'Netherlands', 'North Macedonia', 'Poland',
        'Romania', 'Serbia', 'Singapore', 'Slovenia', 'South Africa', 'Spain', 'Switzerland', 'Turkey', 'United Kingdom',
        'United States',
    ].map((country) => ({ label: country, locations: [{ magic: country, limit: 2 }] })),
];

export const locationsFor = (label: string) => TEST_FROM.find((f) => f.label === label)?.locations;

// A traceroute is long, so it uses half as many probes per location (one per continent "around the world").
const halved = (locations: Location[]) => locations.map((l) => ({ ...l, limit: Math.max(1, Math.ceil(l.limit / 2)) }));

export class GlobalpingError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts a measurement, waits for every probe to finish, and returns the raw results. */
async function measure(body: Record<string, unknown>): Promise<any[]> {
    let res: Response;
    try {
        res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
        throw new GlobalpingError('Could not reach Globalping. Check your connection and try again.');
    }
    if (res.status === 429) {
        const reset = Number(res.headers.get('X-RateLimit-Reset') ?? 0);
        throw new GlobalpingError(
            `You have used this hour’s free Globalping tests. Try again in ${Math.max(1, Math.ceil(reset / 60))} minutes, or test from our server.`,
        );
    }
    const created = await res.json().catch(() => null);
    if (!res.ok || !created?.id) {
        const message: string = created?.error?.message ?? `Globalping answered ${res.status}.`;
        if (/no suitable probes/i.test(message)) throw new GlobalpingError('No probes are online in that location right now. Pick another one.');
        throw new GlobalpingError(message.replace(/^Parameter validation failed\.?\s*/i, '') || 'Globalping did not accept the test.');
    }

    const deadline = Date.now() + 45000;
    let data: any;
    do {
        await sleep(700);
        const r = await fetch(`${API}/${created.id}`);
        data = await r.json().catch(() => null);
    } while (data?.status === 'in-progress' && Date.now() < deadline);
    if (!data?.results) throw new GlobalpingError('The test did not finish. Try again.');
    return data.results;
}

const probeInfo = (x: any): ProbeInfo => ({
    country: x.probe.country,
    city: x.probe.city,
    network: x.probe.network,
    asn: x.probe.asn,
    status: x.result.status,
    raw: String(x.result.rawOutput ?? '').trim(),
});

export async function pingFrom(target: string, locations: Location[]) {
    const results = await measure({ type: 'ping', target, locations, measurementOptions: { packets: 4 } });
    return {
        target,
        probes: results.map(
            (x): PingProbe => ({
                ...probeInfo(x),
                resolved: x.result.resolvedAddress ?? null,
                min: x.result.stats?.min ?? null,
                avg: x.result.stats?.avg ?? null,
                max: x.result.stats?.max ?? null,
                loss: x.result.stats?.loss ?? null,
            }),
        ),
    };
}

export async function traceFrom(target: string, locations: Location[]) {
    const results = await measure({ type: 'traceroute', target, locations: halved(locations), measurementOptions: { protocol: 'ICMP' } });
    return {
        target,
        traces: results.map(
            (x): TraceProbe => ({
                ...probeInfo(x),
                resolved: x.result.resolvedAddress ?? null,
                hops: (x.result.hops ?? []).map((h: any) => {
                    const rtts = (h.timings ?? []).map((t: any) => t.rtt).filter((v: any) => typeof v === 'number');
                    return {
                        address: h.resolvedAddress ?? null,
                        name: h.resolvedHostname && h.resolvedHostname !== h.resolvedAddress ? h.resolvedHostname : null,
                        avg: rtts.length ? rtts.reduce((a: number, b: number) => a + b, 0) / rtts.length : null,
                    };
                }),
            }),
        ),
    };
}

export type MtrHop = {
    address: string | null;
    name: string | null;
    asn: number | null;
    loss: number;
    sent: number;
    avg: number | null;
    best: number | null;
    worst: number | null;
    stdev: number | null;
};

export type MtrRun = { place: ProbeInfo | null; hops: MtrHop[] };

export async function mtrFrom(target: string, locations: Location[]) {
    const results = await measure({ type: 'mtr', target, locations: halved(locations), measurementOptions: { packets: 5, protocol: 'ICMP' } });
    return {
        target,
        resolved: results[0]?.result.resolvedAddress ?? null,
        runs: results.map(
            (x): MtrRun => ({
                place: probeInfo(x),
                hops: (x.result.hops ?? []).map((h: any) => {
                    const st = h.stats ?? {};
                    const silent = !h.resolvedAddress;
                    return {
                        address: h.resolvedAddress ?? null,
                        name: h.resolvedHostname && h.resolvedHostname !== h.resolvedAddress ? h.resolvedHostname : null,
                        asn: h.asn?.[0] ?? null,
                        loss: st.loss ?? 100,
                        sent: st.total ?? 0,
                        avg: silent ? null : (st.avg ?? null),
                        best: silent ? null : (st.min ?? null),
                        worst: silent ? null : (st.max ?? null),
                        stdev: silent ? null : (st.stDev ?? null),
                    };
                }),
            }),
        ),
    };
}

export async function dnsFrom(name: string, type: string, locations: Location[]) {
    const results = await measure({ type: 'dns', target: name, locations, measurementOptions: { query: { type } } });
    return {
        name,
        type,
        lookups: results.map(
            (x): DnsProbe => ({
                ...probeInfo(x),
                resolver: x.result.resolver ?? null,
                code: x.result.statusCodeName ?? null,
                ms: x.result.timings?.total ?? null,
                answers: (x.result.answers ?? []).map((a: any) => ({ type: a.type, ttl: a.ttl, value: String(a.value).replace(/\.$/, '') })),
            }),
        ),
    };
}
