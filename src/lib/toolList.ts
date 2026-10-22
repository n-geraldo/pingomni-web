// The tools on the three tools pages, also listed in the navbar's Tools menu.

export type ToolGroup = 'network' | 'email' | 'bgp';

export const TOOL_PAGES: Record<ToolGroup, { title: string; path: string; blurb: string; icon: string }> = {
    network: { title: 'Network tools', path: 'tools/network/', blurb: 'Ping, traceroute, ports, bandwidth and subnet maths', icon: 'signal' },
    email: { title: 'DNS & Email tools', path: 'tools/email/', blurb: 'DNS records, MX, SPF, DMARC, DKIM, SMTP and registration', icon: 'mail' },
    bgp: { title: 'BGP & ASN tools', path: 'tools/bgp/', blurb: 'AS details, routes, RPKI and a looking glass', icon: 'globe' },
};

export const TOOL_LIST: { id: string; group: ToolGroup; name: string; blurb: string; icon: string }[] = [
    { id: 'ping', group: 'network', name: 'Ping', blurb: 'Whether a host answers, and the round-trip time', icon: 'activity' },
    { id: 'traceroute', group: 'network', name: 'Traceroute', blurb: 'The path to a host and where responses stop', icon: 'route' },
    { id: 'mtr', group: 'network', name: 'MTR', blurb: 'Packet loss and delay, hop by hop', icon: 'chart' },
    { id: 'port', group: 'network', name: 'Port check', blurb: 'Whether a TCP service is reachable from our server', icon: 'plug' },
    { id: 'reverse', group: 'network', name: 'Reverse lookup', blurb: 'The hostname (PTR) of an IP, and whether it points back', icon: 'swap' },
    { id: 'proxy', group: 'network', name: 'Proxy checker', blurb: 'Proxy-related headers in your own request', icon: 'shield' },
    { id: 'bandwidth', group: 'network', name: 'Bandwidth meter', blurb: 'Download speed between you and our server', icon: 'gauge' },
    { id: 'subnet', group: 'network', name: 'Subnet calculator', blurb: 'Ranges, masks and subnet splitting', icon: 'calc' },
    { id: 'dns', group: 'email', name: 'DNS lookup', blurb: 'Records, status and TTLs, or answers across locations', icon: 'search' },
    { id: 'mx', group: 'email', name: 'MX check', blurb: 'Which servers receive a domain’s email', icon: 'mail' },
    { id: 'ns', group: 'email', name: 'NS check', blurb: 'Authoritative name servers, their serials, and the SOA', icon: 'server' },
    { id: 'spf', group: 'email', name: 'SPF check', blurb: 'Who may send a domain’s email, and its DNS lookup count', icon: 'check' },
    { id: 'dmarc', group: 'email', name: 'DMARC check', blurb: 'What receivers are asked to do with failing mail', icon: 'shield' },
    { id: 'dkim', group: 'email', name: 'DKIM check', blurb: 'The public signing key for a given selector', icon: 'key' },
    { id: 'smtp', group: 'email', name: 'SMTP check', blurb: 'Whether a domain’s mail server answers on port 25', icon: 'message' },
    { id: 'whois', group: 'email', name: 'Registration lookup', blurb: 'Registrar, dates and status of a domain or IP (RDAP/WHOIS)', icon: 'id' },
    { id: 'blacklist', group: 'email', name: 'Blacklist check', blurb: 'Whether an IP or domain is on public spam lists', icon: 'ban' },
    { id: 'asn', group: 'bgp', name: 'AS lookup', blurb: 'Who runs an AS, what it announces, and its neighbours', icon: 'nodes' },
    { id: 'prefix', group: 'bgp', name: 'Prefix lookup', blurb: 'Which AS announces an address, RPKI status and upstreams', icon: 'route' },
    { id: 'lg', group: 'bgp', name: 'Looking glass', blurb: 'The BGP paths networks worldwide use to reach a prefix', icon: 'eye' },
];
