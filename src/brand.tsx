// The "One" family marks: one tile, one gradient, one stroke weight, and the teal ping dot at the same spot.
// Glyphs are drawn on the RadiusOne mark's 64x64 grid (the portal's public/brand/logo-mark.svg).
import { useId } from 'react';

export type Brand = 'pingomni' | 'radiusone' | 'ticketone' | 'dnsone' | 'monitor';

const GLYPHS: Record<Brand, string> = {
    pingomni: 'M22 47V17h10.5a8.75 8.75 0 0 1 0 17.5H22',
    radiusone: 'M22 47V17h10.5a8.75 8.75 0 0 1 0 17.5H22M32 34.5L40.5 43',
    ticketone: 'M18 18h28M32 18v28',
    dnsone: 'M20 17v28h7a14 14 0 0 0 0-28z',
    // A pulse: the check that goes out and comes back.
    monitor: 'M14 33h9l5-12 8 22 5-10h9',
};

export function Mark({ brand, size = 32, className }: { brand: Brand; size?: number; className?: string }) {
    const id = useId();
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
            {brand === 'pingomni' && (
                <path d="M33.5 47a11 11 0 0 1 11-11" stroke="#fff" strokeOpacity=".72" strokeWidth="3.5" strokeLinecap="round" fill="none" />
            )}
            <circle className="mark-ping" cx="44.5" cy="47" r="5.5" fill="none" strokeWidth="2" />
            <circle className="mark-dot" cx="44.5" cy="47" r="5.5" fill="#5eead4" />
        </svg>
    );
}

const WORDS: Record<Brand, [string, string]> = {
    pingomni: ['Ping', 'Omni'],
    radiusone: ['Radius', 'One'],
    ticketone: ['Ticket', 'One'],
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
