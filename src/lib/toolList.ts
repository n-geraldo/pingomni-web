// The tools on the two tools pages, also listed in the navbar's Tools menu.

export type ToolGroup = 'network' | 'email';

export const TOOL_PAGES: Record<ToolGroup, { title: string; path: string; blurb: string; icon: string }> = {
    network: { title: 'Network tools', path: 'tools/network/', blurb: 'Ping, traceroute, ports, bandwidth and subnet maths', icon: 'signal' },
    email: { title: 'DNS & Email tools', path: 'tools/email/', blurb: 'DNS records, MX, SPF, DMARC, DKIM, SMTP and WHOIS', icon: 'mail' },
};

export const TOOL_LIST: { id: string; group: ToolGroup; name: string; blurb: string; icon: string }[] = [
    { id: 'ping', group: 'network', name: 'Ping', blurb: 'How long packets take to reach a host', icon: 'activity' },
    { id: 'traceroute', group: 'network', name: 'Traceroute', blurb: 'The route packets take from our server to a host', icon: 'route' },
    { id: 'port', group: 'network', name: 'Port check', blurb: 'Whether a TCP port is open on a host', icon: 'plug' },
    { id: 'reverse', group: 'network', name: 'Reverse lookup', blurb: 'The hostname behind an IP address', icon: 'swap' },
    { id: 'proxy', group: 'network', name: 'Proxy checker', blurb: 'Whether your connection goes through a proxy', icon: 'shield' },
    { id: 'bandwidth', group: 'network', name: 'Bandwidth meter', blurb: 'Your download speed from our server', icon: 'gauge' },
    { id: 'subnet', group: 'network', name: 'Network calculator', blurb: 'Subnet range from an address and mask', icon: 'calc' },
    { id: 'mask', group: 'network', name: 'Network mask calculator', blurb: 'Network mask from a range of addresses', icon: 'grid' },
    { id: 'dns', group: 'email', name: 'DNS lookup', blurb: 'Look up any DNS record (nslookup)', icon: 'search' },
    { id: 'mx', group: 'email', name: 'MX check', blurb: 'The mail servers that receive a domain’s email', icon: 'mail' },
    { id: 'ns', group: 'email', name: 'NS check', blurb: 'The name servers for a domain, and its SOA', icon: 'server' },
    { id: 'spf', group: 'email', name: 'SPF check', blurb: 'Which servers may send email for a domain', icon: 'check' },
    { id: 'dmarc', group: 'email', name: 'DMARC check', blurb: 'What receivers do with mail that fails checks', icon: 'shield' },
    { id: 'dkim', group: 'email', name: 'DKIM check', blurb: 'The signing key published for a selector', icon: 'key' },
    { id: 'smtp', group: 'email', name: 'SMTP check', blurb: 'Connect to a domain’s mail server on port 25', icon: 'message' },
    { id: 'whois', group: 'email', name: 'WHOIS', blurb: 'Registration and contact info for a domain or IP', icon: 'id' },
    { id: 'blacklist', group: 'email', name: 'Blacklist check', blurb: 'Whether a mail server’s IP is on spam lists', icon: 'ban' },
];
