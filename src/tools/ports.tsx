import { useState } from 'react';
import Icon from '../Icon';
import { Status } from './ui';

// Well-known TCP ports and the service each is conventionally used for (a convention, not what a host actually runs), with the ones ISPs reach for on MikroTik routers. UDP services (DNS over UDP, RADIUS, SNMP) cannot be tested with a TCP connect.
export const COMMON_PORTS: { group: string; ports: [number, string][] }[] = [
    { group: 'Web', ports: [[80, 'HTTP'], [443, 'HTTPS'], [8080, 'HTTP alt'], [8443, 'HTTPS alt']] },
    { group: 'Remote access', ports: [[22, 'SSH'], [23, 'Telnet'], [3389, 'RDP'], [5900, 'VNC']] },
    { group: 'Email', ports: [[25, 'SMTP'], [465, 'SMTPS'], [587, 'Submission'], [110, 'POP3'], [995, 'POP3S'], [143, 'IMAP'], [993, 'IMAPS']] },
    { group: 'Files and DNS', ports: [[21, 'FTP'], [53, 'DNS (TCP)'], [445, 'SMB']] },
    { group: 'MikroTik', ports: [[8291, 'Winbox'], [8728, 'RouterOS API'], [8729, 'API over TLS']] },
    { group: 'Databases', ports: [[3306, 'MySQL / MariaDB'], [5432, 'PostgreSQL'], [6379, 'Redis'], [27017, 'MongoDB']] },
    { group: 'VPN', ports: [[1723, 'PPTP'], [1194, 'OpenVPN (TCP)']] },
];

export const PORT_NAMES = new Map(COMMON_PORTS.flatMap((g) => g.ports));
const PORT_GROUPS = new Map(COMMON_PORTS.flatMap((g) => g.ports.map(([port]) => [port, g.group] as const)));

// What each common port is for, shown beside the list. keepPrivate marks services that should not face the internet.
const PORT_INFO: Record<number, { about: string; keepPrivate?: boolean }> = {
    80: { about: 'Plain web traffic. Most web servers listen here and redirect visitors to HTTPS.' },
    443: { about: 'Web traffic encrypted with TLS. Many VPNs and APIs use it too, because firewalls rarely block it.' },
    8080: { about: 'A common second port for web servers, proxies and admin panels that run beside port 80.' },
    8443: { about: 'A common second HTTPS port, often used by admin panels and network controllers.' },
    25: { about: 'Mail servers delivering mail to each other. Many ISPs block outgoing port 25 from home connections to stop spam.' },
    465: { about: 'Sending mail from an app to your provider over TLS from the first byte.' },
    587: { about: 'Sending mail from an app to your provider, upgraded to TLS with STARTTLS. The usual sending port today.' },
    110: { about: 'Downloading mail with POP3 without encryption. Use 995 instead where you can.' },
    995: { about: 'Downloading mail with POP3 over TLS.' },
    143: { about: 'Reading mail on the server with IMAP, usually upgraded to TLS with STARTTLS.' },
    993: { about: 'Reading mail on the server with IMAP over TLS. The port most mail apps use.' },
    22: { about: 'Encrypted remote shell and file transfer (SFTP, SCP). If it is open, expect constant password guessing: use keys and limit who can connect.' },
    23: { about: 'Remote shell with no encryption: passwords cross the network in plain text.', keepPrivate: true },
    3389: { about: 'Windows Remote Desktop, a frequent target of attacks. Reach it through a VPN.', keepPrivate: true },
    5900: { about: 'VNC screen sharing, often protected by a short password only.', keepPrivate: true },
    8291: { about: 'Winbox, the MikroTik management app. Allow it only from your management network.', keepPrivate: true },
    8728: { about: 'The RouterOS API without encryption, used by billing and RADIUS systems to manage MikroTik routers.', keepPrivate: true },
    8729: { about: 'The RouterOS API over TLS. Prefer it to 8728 when the API has to cross the internet.' },
    21: { about: 'File transfer with no encryption. Data moves over separate ports, so this check only tests the control connection.' },
    53: { about: 'DNS over TCP, used for large answers and zone transfers. Most lookups use UDP port 53, which a TCP check cannot test.' },
    445: { about: 'Windows file sharing (SMB). Many ISPs block it because of worms that spread through it.', keepPrivate: true },
    3306: { about: 'MySQL and MariaDB databases. Apps should reach it over a private network.', keepPrivate: true },
    5432: { about: 'PostgreSQL databases. Apps should reach it over a private network.', keepPrivate: true },
    6379: { about: 'Redis, which by default accepts commands from anyone who can connect.', keepPrivate: true },
    27017: { about: 'MongoDB databases. Instances left open to the internet are a common cause of data leaks.', keepPrivate: true },
    1723: { about: 'The PPTP VPN control channel. PPTP also needs GRE, which a TCP check cannot test, and its encryption is broken.' },
    1194: { about: 'OpenVPN usually runs on UDP 1194. Its TCP mode helps it get through strict firewalls.' },
};

function PortInfo({ port }: { port: number }) {
    const name = PORT_NAMES.get(port);
    const info = PORT_INFO[port];
    if (!name || !info) {
        return (
            <aside className="port-info">
                <span className="port-info-group">Other port</span>
                <div className="port-info-title">
                    <span className="port-info-num">{Number.isNaN(port) ? '—' : port}</span>
                </div>
                <p className="port-info-about">Not one of the common ports. Enter it above and press Check port to test it anyway.</p>
            </aside>
        );
    }
    return (
        <aside className="port-info">
            <span className="port-info-group">{PORT_GROUPS.get(port)}</span>
            <div className="port-info-title">
                <span className="port-info-num">{port}</span>
                <span className="port-info-name">{name}</span>
            </div>
            <p className="port-info-conv">Conventional use; a host can run anything on any port.</p>
            <div className="port-info-tags">
                <Status level="neutral">TCP</Status>
                {info.keepPrivate && <Status level="issue">Keep private</Status>}
            </div>
            <p className="port-info-about">{info.about}</p>
        </aside>
    );
}

export function CommonPorts({
    current,
    disabled,
    onPick,
    onCheckAll,
}: {
    current?: string;
    disabled: boolean;
    onPick: (port: number) => void;
    onCheckAll: () => void;
}) {
    const count = COMMON_PORTS.reduce((n, g) => n + g.ports.length, 0);
    // The info column follows the port under the pointer (or keyboard focus), then the one in the form, then 443 (the form's placeholder).
    const [hovered, setHovered] = useState<number>();
    const shown = hovered ?? (current?.trim() ? Number(current.trim()) : 443);
    return (
        <div className="common-ports">
            <div className="common-ports-head">
                <div>
                    <h3 className="common-ports-title">Common ports</h3>
                    <p className="common-ports-hint">Pick a port to check it on the host above, or check the whole list at once.</p>
                </div>
                <button type="button" className="btn btn-sm" disabled={disabled} onClick={onCheckAll}>
                    <Icon name="grid" />
                    Check all {count} common ports
                </button>
            </div>
            <div className="common-ports-body">
                <PortInfo port={shown} />
                <div className="common-ports-groups" onMouseLeave={() => setHovered(undefined)} onBlur={() => setHovered(undefined)}>
                    {COMMON_PORTS.map((g) => (
                        <section className="common-ports-group" key={g.group} aria-label={g.group}>
                            <h4 className="common-ports-label">{g.group}</h4>
                            <ul className="common-ports-list">
                                {g.ports.map(([port, name]) => (
                                    <li key={port}>
                                        <button
                                            type="button"
                                            className="port-chip"
                                            aria-pressed={current === String(port)}
                                            disabled={disabled}
                                            onClick={() => onPick(port)}
                                            title={`Check port ${port} (${name})`}
                                            onMouseEnter={() => setHovered(port)}
                                            onFocus={() => setHovered(port)}
                                        >
                                            <span className="port-chip-num">{port}</span>
                                            <span className="port-chip-name">{name}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Shown under results that name services: the names are conventions, not detection. */
export const CommonPortsNote = () => (
    <p className="tool-note">
        “Usual service” is what each port is conventionally used for. The check only shows whether a connection was accepted, not which program
        answered or whether it works.
    </p>
);
