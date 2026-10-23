// Sample results for the three tools pages, on the home page and in each tools page's header.
import type { ReactNode } from 'react';
import Icon from '../Icon';
import type { ToolGroup } from '../lib/toolList';

// A sample result for each tools page, drawn with documentation addresses (RFC 5737) and private-use AS numbers.
function TracePreview() {
    const hops: [string, number][] = [
        ['192.0.2.1', 1.2],
        ['198.51.100.9', 6.8],
        ['203.0.113.41', 18.4],
        ['example.com', 24.1],
    ];
    return (
        <div className="mock mock-list" aria-hidden="true">
            <div className="mock-search mock-mono">
                <Icon name="route" />
                traceroute example.com
            </div>
            {hops.map(([host, ms], i) => (
                <div className="trace-hop" key={host}>
                    <span className="trace-n mock-mono">{i + 1}</span>
                    <span className="mock-mono">{host}</span>
                    <span className="trace-ms mock-mono">{ms} ms</span>
                    <span className="mock-bar">
                        <span style={{ width: `${(ms / 25) * 100}%` }} />
                    </span>
                </div>
            ))}
        </div>
    );
}

function MailPreview() {
    const checks: [string, string, boolean][] = [
        ['MX', '2 servers', true],
        ['SPF', '4 of 10 lookups', true],
        ['DMARC', 'p=reject', true],
        ['DKIM', 'selector1 found', true],
        ['Blacklists', 'Listed on 1', false],
    ];
    return (
        <div className="mock mock-list" aria-hidden="true">
            <div className="mock-search mock-mono">
                <Icon name="mail" />
                example.com
            </div>
            {checks.map(([name, detail, ok]) => (
                <div className="mail-check" key={name}>
                    <span className={ok ? 'mail-mark mail-ok' : 'mail-mark mail-warn'}>
                        <Icon name={ok ? 'check' : 'ban'} />
                    </span>
                    <strong>{name}</strong>
                    <span className="mock-faint">{detail}</span>
                </div>
            ))}
        </div>
    );
}

function BgpPreview() {
    const path = ['AS64500', 'AS64510', 'AS64496'];
    return (
        <div className="mock bgp-mock" aria-hidden="true">
            <div className="mock-search mock-mono">
                <Icon name="globe" />
                203.0.113.0/24
            </div>
            <div className="bgp-path">
                {path.map((as, i) => (
                    <span className={i === path.length - 1 ? 'bgp-as bgp-origin' : 'bgp-as'} key={as}>
                        {as}
                    </span>
                ))}
            </div>
            <div className="bgp-meta">
                <span>
                    Origin <strong className="mock-mono">AS64496</strong>
                </span>
                <span className="mock-pill mock-pill-ok">RPKI valid</span>
            </div>
        </div>
    );
}

export const TOOL_PREVIEW: Record<ToolGroup, () => ReactNode> = { network: TracePreview, email: MailPreview, bgp: BgpPreview };

