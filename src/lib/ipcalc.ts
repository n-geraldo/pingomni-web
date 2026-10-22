// IPv4 subnet maths for the two calculators. Runs in the browser; nothing is sent anywhere.

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

/** Accepts "192.168.1.10/24", "192.168.1.10 255.255.255.0" or "192.168.1.10/255.255.255.0". */
export function subnet(input: string): Subnet {
    const [ipText, maskText = ''] = input.trim().split(/\s*[/\s]\s*/);
    const ip = parseIp(ipText ?? '');
    if (ip === null) throw new Error('Enter an IPv4 address, like 192.168.1.10/24.');
    let prefix: number | null;
    if (maskText === '') prefix = 32;
    else if (/^\d{1,2}$/.test(maskText)) prefix = Number(maskText) <= 32 ? Number(maskText) : null;
    else {
        const m = parseIp(maskText);
        prefix = m === null ? null : prefixFromMask(m);
    }
    if (prefix === null) throw new Error('The mask must be a prefix (0-32) or a valid netmask, like 255.255.255.0.');

    const mask = maskFromPrefix(prefix);
    const network = (ip & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const total = 2 ** (32 - prefix);
    const usable = prefix >= 31 ? total : total - 2;
    const first = prefix >= 31 ? network : network + 1;
    const last = prefix >= 31 ? broadcast : broadcast - 1;
    return [
        { label: 'Address', value: formatIp(ip), mono: true },
        { label: 'Network', value: `${formatIp(network)}/${prefix}`, mono: true },
        { label: 'Netmask', value: formatIp(mask), mono: true },
        { label: 'Wildcard', value: formatIp(~mask >>> 0), mono: true },
        { label: 'Broadcast', value: prefix >= 31 ? 'None' : formatIp(broadcast), mono: prefix < 31 },
        { label: 'First host', value: formatIp(first), mono: true },
        { label: 'Last host', value: formatIp(last), mono: true },
        { label: 'Usable hosts', value: usable.toLocaleString('en') },
        { label: 'Total addresses', value: total.toLocaleString('en') },
        { label: 'Address type', value: kind(ip) },
        { label: 'Netmask in binary', value: binary(mask), mono: true },
    ];
}

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
    while (cur <= last && blocks.length < 64) {
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
    return {
        cover: { cidr: `${formatIp(coverNet)}/${prefix}`, mask: formatIp(maskFromPrefix(prefix)), size: 2 ** (32 - prefix) },
        exact: (last - first + 1) === 2 ** (32 - prefix) && coverNet === first,
        blocks,
    };
}
