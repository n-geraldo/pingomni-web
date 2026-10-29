import type { ReactNode } from 'react';

// The marks, one family on a 64 grid: a ring (centre 30,32, r 20) open where the line leaves, one stroke (6), and the
// teal ping at (57,32). Inside the ring, each product's own sign: PingOmni and Monitor the Pulse (a check's heartbeat),
// RadiusOne the Key (the subscriber let in), DNSOne the Tree (a name looked up, one path out as the answer). Ink
// follows the text colour (currentColor); the ping is --pulse-dot.

export type Brand = 'pingomni' | 'radiusone' | 'dnsone' | 'monitor';

const RING = 'M12.02 23.23A20 20 0 0 1 47.98 23.23M47.98 40.77A20 20 0 0 1 12.02 40.77';
const RING_RIGHT = 'M47.98 40.77A20 20 0 1 1 47.98 23.23';

/** The ring's two halves and the beat, as one path. */
export const PULSE_PATH = `${RING}M4 32H22L26 22L34 42L38 32H57`;

const SIGNS: Record<Brand, { path: string; extra?: ReactNode }> = {
    pingomni: { path: PULSE_PATH },
    monitor: { path: PULSE_PATH },
    radiusone: { path: `${RING_RIGHT}M29 32H57M38 32V39`, extra: <circle cx="24" cy="32" r="5" fill="none" stroke="currentColor" strokeWidth="5" /> },
    dnsone: { path: `${RING}M4 32H57M18 32L26 24H36M18 32L26 40H36` },
};

export function Mark({ brand, size = 32, className }: { brand: Brand; size?: number; className?: string }) {
    const sign = SIGNS[brand];
    return (
        <svg className={className ? `mark mark-pulse ${className}` : 'mark mark-pulse'} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
            <path d={sign.path} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            {sign.extra}
            <circle className="mark-ping" cx="57" cy="32" r="5.5" fill="none" strokeWidth="2" />
            <circle className="mark-dot" cx="57" cy="32" r="5.5" />
        </svg>
    );
}

const WORDS: Record<Brand, [string, string]> = {
    pingomni: ['Ping', 'Omni'],
    radiusone: ['Radius', 'One'],
    dnsone: ['DNS', 'One'],
    monitor: ['PingOmni ', 'Monitor'],
};

export function Wordmark({ brand }: { brand: Brand }) {
    const [first, second] = WORDS[brand];
    return (
        <span className="wordmark">
            {first}
            <span className="wordmark-accent">{second}</span>
        </span>
    );
}
