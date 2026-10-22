// Globalping (globalping.io, by jsDelivr): a free, open network of probes worldwide.
// Called straight from the visitor's browser, so each visitor uses their own free allowance (250 tests an hour).

const API = 'https://api.globalping.io/v1/measurements';

export type Probe = {
    country: string;
    city: string;
    network: string;
    asn: number;
    status: 'finished' | 'failed' | 'offline' | 'in-progress';
    resolved: string | null;
    min: number | null;
    avg: number | null;
    max: number | null;
    loss: number | null;
};

type Location = { magic: string; limit: number };

// Places to ping from, as Globalping "magic" locations. "Around the world" asks every continent,
// because Globalping's own "world" leans on Europe and North America, where most probes are.
export const PING_FROM: { label: string; locations?: Location[] }[] = [
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

export class GlobalpingError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function pingFrom(target: string, locations: Location[]): Promise<{ target: string; probes: Probe[] }> {
    let res: Response;
    try {
        res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'ping', target, locations, measurementOptions: { packets: 4 } }),
        });
    } catch {
        throw new GlobalpingError('Could not reach Globalping. Check your connection and try again.');
    }
    if (res.status === 429) {
        const reset = Number(res.headers.get('X-RateLimit-Reset') ?? 0);
        throw new GlobalpingError(`You have used this hour’s free Globalping tests. Try again in ${Math.max(1, Math.ceil(reset / 60))} minutes, or ping from our server.`);
    }
    const created = await res.json().catch(() => null);
    if (!res.ok || !created?.id) {
        const message: string = created?.error?.message ?? `Globalping answered ${res.status}.`;
        if (/no suitable probes/i.test(message)) throw new GlobalpingError('No probes are online in that location right now. Pick another one.');
        throw new GlobalpingError(message.replace(/^Parameter validation failed\.?\s*/i, '') || 'Globalping did not accept the test.');
    }

    // Results arrive over a few seconds; poll until every probe is done.
    const deadline = Date.now() + 30000;
    let data: any;
    do {
        await sleep(600);
        const r = await fetch(`${API}/${created.id}`);
        data = await r.json().catch(() => null);
    } while (data?.status === 'in-progress' && Date.now() < deadline);
    if (!data?.results) throw new GlobalpingError('The test did not finish. Try again.');

    return {
        target,
        probes: data.results.map((x: any): Probe => ({
            country: x.probe.country,
            city: x.probe.city,
            network: x.probe.network,
            asn: x.probe.asn,
            status: x.result.status,
            resolved: x.result.resolvedAddress ?? null,
            min: x.result.stats?.min ?? null,
            avg: x.result.stats?.avg ?? null,
            max: x.result.stats?.max ?? null,
            loss: x.result.stats?.loss ?? null,
        })),
    };
}
