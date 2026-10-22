// IPv4 subnet maths for the subnet calculator. Runs in the browser; nothing is sent anywhere.

export function parseIp(text: string): number | null {
    const parts = text.trim().split('.');
    if (parts.length !== 4) return null;
    let n = 0;
    for (const p of parts) {
        if (!/^\d{1,3}$/.test(p)) return null;
        const v = Number(p);
        if (v > 255) return null;
        n = n * 256 + v;
    }
    return n;
}

export const formatIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

export const maskFromPrefix = (prefix: number) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

export function prefixFromMask(mask: number): number | null {
    const inverted = ~mask >>> 0;
    if ((inverted & (inverted + 1)) !== 0) return null;
    return 32 - Math.log2(inverted + 1);
}

const binary = (n: number) =>
    [24, 16, 8, 0].map((s) => ((n >>> s) & 255).toString(2).padStart(8, '0')).join('.');

function kind(ip: number): string {
    const inNet = (net: string, bits: number) => ((ip & maskFromPrefix(bits)) >>> 0) === parseIp(net);
    if (inNet('10.0.0.0', 8) || inNet('172.16.0.0', 12) || inNet('192.168.0.0', 16)) return 'Private (RFC 1918)';
    if (inNet('100.64.0.0', 10)) return 'Carrier-grade NAT (RFC 6598)';
    if (inNet('127.0.0.0', 8)) return 'Loopback';
    if (inNet('169.254.0.0', 16)) return 'Link-local';
    if (inNet('224.0.0.0', 4)) return 'Multicast';
    if (inNet('240.0.0.0', 4)) return 'Reserved';
    return 'Public';
}

export type Subnet = { label: string; value: string; mono?: boolean }[];

/** Reads "192.168.1.10/24", "192.168.1.10 255.255.255.0" or "192.168.1.10/255.255.255.0". */
function parseCidr(input: string): { ip: number; prefix: number; assumed: boolean } {
    const [ipText, maskText = ''] = input.trim().split(/\s*[/\s]\s*/);
    if (ipText?.includes(':')) throw new Error('This calculator works with IPv4 only. IPv6 addresses are not supported yet.');
    const ip = parseIp(ipText ?? '');
    if (ip === null) throw new Error('Enter an IPv4 address with a mask, like 192.168.1.10/24.');
    let prefix: number | null;
    if (maskText === '') prefix = 32;
    else if (/^\d{1,2}$/.test(maskText)) prefix = Number(maskText) <= 32 ? Number(maskText) : null;
    else {
        const m = parseIp(maskText);
        prefix = m === null ? null : prefixFromMask(m);
    }
    if (prefix === null) throw new Error('The mask must be a prefix (0-32) or a valid netmask, like 255.255.255.0. A netmask is a run of 1 bits then 0 bits.');
    return { ip, prefix, assumed: maskText === '' };
}

/** "192.168.0.0 - 192.168.3.255" (or "to") as its two ends, or null when the input is not a range. */
export function parseRange(input: string): [string, string] | null {
    const m = input.trim().match(/^(\S+)\s*(?:-|–|\bto\b)\s*(\S+)$/);
    return m ? [m[1], m[2]] : null;
}

const hosts = (prefix: number) => (prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2);

export type SubnetInfo = {
    rows: Subnet;
    ip: string;
    network: number;
    prefix: number;
    cidr: string;
    mask: string;
    /** The address entered was not the network's first address (host bits set). */
    hostBitsSet: boolean;
    /** No mask was given, so /32 was assumed. */
    assumed: boolean;
    /** single: /32, one address. p2p: /31, two usable addresses and no broadcast (RFC 3021). */
    shape: 'single' | 'p2p' | 'normal';
};

export function subnet(input: string): SubnetInfo {
    const { ip, prefix, assumed } = parseCidr(input);
    const mask = maskFromPrefix(prefix);
    const network = (ip & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const total = 2 ** (32 - prefix);
    const first = prefix >= 31 ? network : network + 1;
    const last = prefix >= 31 ? broadcast : broadcast - 1;
    const rows: Subnet = [
        { label: 'Address', value: formatIp(ip), mono: true },
        { label: 'Network', value: `${formatIp(network)}/${prefix}`, mono: true },
        { label: 'Netmask', value: formatIp(mask), mono: true },
        { label: 'Wildcard', value: formatIp(~mask >>> 0), mono: true },
        { label: 'Broadcast', value: prefix === 32 ? 'None (single address)' : prefix === 31 ? 'None (/31 point-to-point link, RFC 3021)' : formatIp(broadcast), mono: prefix < 31 },
        { label: 'First host', value: formatIp(first), mono: true },
        { label: 'Last host', value: formatIp(last), mono: true },
        { label: 'Usable hosts', value: hosts(prefix).toLocaleString('en') },
        { label: 'Total addresses', value: total.toLocaleString('en') },
        { label: 'Address type', value: kind(ip) },
        { label: 'Netmask in binary', value: binary(mask), mono: true },
    ];
    return {
        rows,
        ip: formatIp(ip),
        network,
        prefix,
        cidr: `${formatIp(network)}/${prefix}`,
        mask: formatIp(mask),
        hostBitsSet: ip !== network,
        assumed,
        shape: prefix === 32 ? 'single' : prefix === 31 ? 'p2p' : 'normal',
    };
}

/** Reads a network for splitting, like 10.0.0.0/22; a host address is moved to its network. */
export function parseNetwork(input: string): { network: number; prefix: number; hostBitsSet: boolean } {
    const { ip, prefix } = parseCidr(input);
    const network = (ip & maskFromPrefix(prefix)) >>> 0;
    return { network, prefix, hostBitsSet: ip !== network };
}

export type Piece = { cidr: string; first: string; last: string; broadcast: string; hosts: number };

/** Cuts network/prefix into equal /into networks; lists at most `limit` of them. */
export function split(network: number, prefix: number, into: number, limit = 256): { count: number; pieces: Piece[] } {
    const size = 2 ** (32 - into);
    const count = 2 ** (into - prefix);
    const pieces: Piece[] = [];
    for (let i = 0; i < Math.min(count, limit); i++) {
        const net = network + i * size;
        const end = net + size - 1;
        pieces.push({
            cidr: `${formatIp(net)}/${into}`,
            first: formatIp(into >= 31 ? net : net + 1),
            last: formatIp(into >= 31 ? end : end - 1),
            broadcast: into >= 31 ? '—' : formatIp(end),
            hosts: hosts(into),
        });
    }
    return { count, pieces };
}

/** Every prefix from /32 down to /0 with its mask, wildcard and size. */
export const PREFIXES = Array.from({ length: 33 }, (_, i) => {
    const prefix = 32 - i;
    const mask = maskFromPrefix(prefix);
    return { prefix, mask: formatIp(mask), wildcard: formatIp(~mask >>> 0), total: 2 ** (32 - prefix), hosts: hosts(prefix) };
});

/** The CIDR blocks that exactly cover first..last, and the one smallest block that contains them all. */
export function rangeToMasks(firstText: string, lastText: string) {
    const first = parseIp(firstText);
    const last = parseIp(lastText);
    if (first === null || last === null) throw new Error('Enter the first and last IPv4 address of the range.');
    if (first > last) throw new Error('The first address must come before the last one.');

    let prefix = 32;
    while (prefix > 0 && ((first & maskFromPrefix(prefix)) >>> 0) !== ((last & maskFromPrefix(prefix)) >>> 0)) prefix--;
    const coverNet = (first & maskFromPrefix(prefix)) >>> 0;

    const blocks: { cidr: string; mask: string; size: number }[] = [];
    let cur = first;
    while (cur <= last && blocks.length < 128) {
        let size = 32;
        while (size > 0) {
            const bigger = size - 1;
            const m = maskFromPrefix(bigger);
            const end = (((cur & m) >>> 0) | (~m >>> 0)) >>> 0;
            if (((cur & m) >>> 0) !== cur || end > last) break;
            size = bigger;
        }
        blocks.push({ cidr: `${formatIp(cur)}/${size}`, mask: formatIp(maskFromPrefix(size)), size: 2 ** (32 - size) });
        const next = cur + 2 ** (32 - size);
        if (next > 0xffffffff) break;
        cur = next;
    }
    const count = last - first + 1;
    const size = 2 ** (32 - prefix);
    return {
        first: formatIp(first),
        last: formatIp(last),
        count,
        cover: { cidr: `${formatIp(coverNet)}/${prefix}`, mask: formatIp(maskFromPrefix(prefix)), size },
        /** Addresses the covering prefix adds outside the range. */
        extra: size - count,
        exact: count === size && coverNet === first,
        blocks,
        /** More blocks are needed than are listed (only for very ragged ranges). */
        truncated: cur <= last && blocks.length >= 128,
    };
}
