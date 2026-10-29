// The marks. PingOmni (and PingOmni Monitor) is the Pulse: a ring, open where one check passes through, ending in
// the teal ping; drawn on a 64 grid with one stroke (6), the ring centred at (30,32) r 20, the beat's three slopes
// all 5:2. Its ink follows the text colour (currentColor); the ping is --pulse-dot. RadiusOne and DNSOne keep their
// tiles: one gradient, one stroke weight, and the teal ping dot at the same spot.
import { useId } from 'react';

/** The ring's two halves and the beat, as one path. */
export const PULSE_PATH = 'M12.02 23.23A20 20 0 0 1 47.98 23.23M47.98 40.77A20 20 0 0 1 12.02 40.77M4 32H22L26 22L34 42L38 32H57';

function Pulse({ size, className }: { size: number; className?: string }) {
    return (
        <svg className={className ? `mark mark-pulse ${className}` : 'mark mark-pulse'} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
            <path d={PULSE_PATH} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            <circle className="mark-ping" cx="57" cy="32" r="5.5" fill="none" strokeWidth="2" />
            <circle className="mark-dot" cx="57" cy="32" r="5.5" />
        </svg>
    );
}

export type Brand = 'pingomni' | 'radiusone' | 'dnsone' | 'monitor';

const GLYPHS: Record<'radiusone' | 'dnsone', string> = {
    radiusone: 'M22 47V17h10.5a8.75 8.75 0 0 1 0 17.5H22M32 34.5L40.5 43',
    dnsone: 'M20 17v28h7a14 14 0 0 0 0-28z',
};

export function Mark({ brand, size = 32, className }: { brand: Brand; size?: number; className?: string }) {
    const id = useId();
    if (brand === 'pingomni' || brand === 'monitor') {
        return <Pulse size={size} className={className} />;
    }
    return (
        <svg className={className ? `mark ${className}` : 'mark'} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#0d7f78" />
                    <stop offset="1" stopColor="#155e75" />
                </linearGradient>
            </defs>
            <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
            <path d={GLYPHS[brand]} stroke="#fff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle className="mark-ping" cx="44.5" cy="47" r="5.5" fill="none" strokeWidth="2" />
            <circle className="mark-dot" cx="44.5" cy="47" r="5.5" fill="#5eead4" />
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
