<?php

// PingOmni network and email tools: one small JSON API behind nginx at /api/?tool=<name>.
// Tools that reach out from this server (ping, traceroute, port, SMTP) only accept public addresses,
// run with short timeouts, and are rate-limited per visitor.

declare(strict_types=1);

const HEAVY_PER_MINUTE = 10;
const LIGHT_PER_MINUTE = 40;
const USER_AGENT = 'PingOmni-Tools/1.0';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $status = 400): never
{
    respond(['ok' => false, 'error' => $message], $status);
}

function param(string $name, int $max = 255): string
{
    $value = trim((string) ($_GET[$name] ?? ''));
    if (strlen($value) > $max) {
        fail("The {$name} is too long.");
    }
    return $value;
}

function clientIp(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
}

// Per-visitor limit, one counter file per IP and class, reset every minute.
function rateLimit(string $class, int $perMinute): void
{
    $dir = sys_get_temp_dir() . '/pingomni-tools';
    if (!is_dir($dir) && !@mkdir($dir, 0700) && !is_dir($dir)) {
        return;
    }
    $file = $dir . '/' . hash('sha256', clientIp() . '|' . $class);
    $fh = @fopen($file, 'c+');
    if (!$fh) {
        return;
    }
    flock($fh, LOCK_EX);
    $window = intdiv(time(), 60);
    [$w, $count] = array_map('intval', explode(':', (string) stream_get_contents($fh)) + [0, 0]);
    $count = $w === $window ? $count + 1 : 1;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, "{$window}:{$count}");
    flock($fh, LOCK_UN);
    fclose($fh);
    if ($count > $perMinute) {
        fail('Too many requests. Wait a minute and try again.', 429);
    }
}

function isIp(string $v): bool
{
    return filter_var($v, FILTER_VALIDATE_IP) !== false;
}

function isDomain(string $v): bool
{
    return (bool) preg_match('/^(?=.{1,253}$)(?!-)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/i', rtrim($v, '.'));
}

// Public unicast only: no private, loopback, link-local, CGNAT, multicast or reserved ranges.
function isPublicIp(string $ip): bool
{
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        return false;
    }
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $n = ip2long($ip);
        foreach ([['100.64.0.0', 10], ['192.0.0.0', 24], ['198.18.0.0', 15], ['224.0.0.0', 3]] as [$net, $bits]) {
            $mask = -1 << (32 - $bits);
            if (($n & $mask) === (ip2long($net) & $mask)) {
                return false;
            }
        }
        return true;
    }
    $first = strtolower(explode(':', $ip)[0]);
    return !str_starts_with($first, 'ff') && !str_starts_with($first, 'fc') && !str_starts_with($first, 'fd');
}

function normalizeHost(string $host): string
{
    $host = strtolower(trim($host));
    $host = preg_replace('#^[a-z]+://#', '', $host);
    $host = explode('/', $host)[0];
    if (str_starts_with($host, '[') && str_ends_with($host, ']')) {
        $host = substr($host, 1, -1);
    }
    return rtrim($host, '.');
}

/** @return string[] */
function resolve(string $host): array
{
    if (isIp($host)) {
        return [$host];
    }
    $ips = [];
    foreach (@dns_get_record($host, DNS_A | DNS_AAAA) ?: [] as $r) {
        $ips[] = $r['ip'] ?? $r['ipv6'];
    }
    return array_values(array_unique(array_filter($ips)));
}

// A host this server may reach out to: a valid name or IP whose every address is public.
function publicTarget(string $raw): array
{
    $host = normalizeHost($raw);
    if ($host === '' || (!isIp($host) && !isDomain($host))) {
        fail('Enter a valid hostname or IP address.');
    }
    $ips = resolve($host);
    if (!$ips) {
        fail("{$host} does not resolve to an IP address.");
    }
    foreach ($ips as $ip) {
        if (!isPublicIp($ip)) {
            fail('Only public addresses can be tested from our server.');
        }
    }
    return [$host, $ips];
}

function domainParam(string $name = 'domain'): string
{
    $domain = normalizeHost(param($name));
    if (!isDomain($domain)) {
        fail('Enter a valid domain name, like example.com.');
    }
    return $domain;
}

/** Runs a command without a shell, with a hard time limit. */
function run(array $cmd, int $seconds): array
{
    $proc = proc_open(array_merge(['timeout', (string) $seconds], $cmd), [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($proc)) {
        fail('The tool could not start.', 500);
    }
    $out = stream_get_contents($pipes[1]);
    stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);
    return [$code, (string) $out];
}

function txtRecords(string $name): array
{
    $out = [];
    foreach (@dns_get_record($name, DNS_TXT) ?: [] as $r) {
        $out[] = isset($r['entries']) ? implode('', $r['entries']) : ($r['txt'] ?? '');
    }
    return $out;
}

function rdap(string $path): array
{
    $c = curl_init('https://rdap.org/' . $path);
    curl_setopt_array($c, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 4,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_USERAGENT => USER_AGENT,
        CURLOPT_HTTPHEADER => ['Accept: application/rdap+json'],
    ]);
    $body = curl_exec($c);
    $code = curl_getinfo($c, CURLINFO_HTTP_CODE);
    $source = curl_getinfo($c, CURLINFO_EFFECTIVE_URL);
    if ($code === 404) {
        fail('No registration record was found.', 404);
    }
    if ($body === false || $code >= 400) {
        fail('The registry did not answer. Try again in a moment.', 502);
    }
    $data = json_decode((string) $body, true);
    if (!is_array($data)) {
        fail('The registry sent an answer we could not read.', 502);
    }
    $data['_source'] = parse_url((string) $source, PHP_URL_HOST);
    return $data;
}

/** Name, organisation, email and phone of each contact the registry publishes (many are redacted). */
function rdapEntities(array $node): array
{
    $out = [];
    foreach ($node['entities'] ?? [] as $e) {
        $card = ['roles' => $e['roles'] ?? [], 'handle' => $e['handle'] ?? null];
        foreach ($e['vcardArray'][1] ?? [] as [$key, $params, , $value]) {
            if (in_array($key, ['fn', 'org', 'email', 'tel'], true) && is_string($value) && $value !== '') {
                $card[$key] = $value;
            } elseif ($key === 'adr') {
                $parts = is_array($value) ? array_map(fn ($p) => is_array($p) ? implode(' ', $p) : (string) $p, $value) : [];
                $label = $params['label'] ?? trim(implode(' ', array_filter($parts)));
                if ($label !== '') {
                    $card['address'] = str_replace("\n", ', ', (string) $label);
                }
            }
        }
        $out[] = $card;
        array_push($out, ...rdapEntities($e));
    }
    return $out;
}

function rdapEvents(array $node): array
{
    $events = [];
    foreach ($node['events'] ?? [] as $ev) {
        $events[$ev['eventAction']] = $ev['eventDate'];
    }
    return $events;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

function toolMyIp(): array
{
    $ip = clientIp();
    $name = @gethostbyaddr($ip);
    return ['ip' => $ip, 'hostname' => $name && $name !== $ip ? $name : null];
}

function toolPing(): array
{
    rateLimit('heavy', HEAVY_PER_MINUTE);
    [$host, $ips] = publicTarget(param('host'));
    $ip = $ips[0];
    $bin = str_contains($ip, ':') ? ['ping', '-6'] : ['ping', '-4'];
    [, $out] = run(array_merge($bin, ['-c', '4', '-i', '0.5', '-W', '2', '-n', $ip]), 12);
    $replies = [];
    foreach (explode("\n", $out) as $line) {
        if (preg_match('/icmp_seq=(\d+) ttl=(\d+) time=([\d.]+) ms/', $line, $m)) {
            $replies[] = ['seq' => (int) $m[1], 'ttl' => (int) $m[2], 'ms' => (float) $m[3]];
        }
    }
    preg_match('/(\d+) packets transmitted, (\d+) received/', $out, $s);
    preg_match('#= ([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+) ms#', $out, $t);
    return [
        'host' => $host,
        'ip' => $ip,
        'sent' => (int) ($s[1] ?? 4),
        'received' => (int) ($s[2] ?? 0),
        'min' => isset($t[1]) ? (float) $t[1] : null,
        'avg' => isset($t[2]) ? (float) $t[2] : null,
        'max' => isset($t[3]) ? (float) $t[3] : null,
        'replies' => $replies,
    ];
}

function toolTraceroute(): array
{
    rateLimit('heavy', HEAVY_PER_MINUTE);
    [$host, $ips] = publicTarget(param('host'));
    $ip = $ips[0];
    [, $out] = run(['mtr', '--json', '-c', '2', '-b', '-m', '24', str_contains($ip, ':') ? '-6' : '-4', $ip], 40);
    $data = json_decode($out, true);
    if (!is_array($data)) {
        fail('The trace did not finish. Try again.', 502);
    }
    $hops = [];
    foreach ($data['report']['hubs'] ?? [] as $h) {
        $label = (string) $h['host'];
        $name = null;
        $addr = $label;
        if (preg_match('/^(.*) \(([^)]+)\)$/', $label, $m)) {
            [$name, $addr] = [$m[1], $m[2]];
        }
        $hops[] = [
            'hop' => (int) $h['count'],
            'host' => $addr === '???' ? null : $addr,
            'name' => $name,
            'loss' => (float) $h['Loss%'],
            'avg' => $addr === '???' ? null : (float) $h['Avg'],
            'best' => $addr === '???' ? null : (float) $h['Best'],
        ];
    }
    return ['host' => $host, 'ip' => $ip, 'hops' => $hops];
}

function toolPort(): array
{
    rateLimit('heavy', HEAVY_PER_MINUTE);
    [$host, $ips] = publicTarget(param('host'));
    $port = filter_var(param('port', 5), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
    if ($port === false) {
        fail('Enter a port from 1 to 65535.');
    }
    $ip = $ips[0];
    $target = str_contains($ip, ':') ? "[{$ip}]" : $ip;
    $start = microtime(true);
    $sock = @stream_socket_client("tcp://{$target}:{$port}", $errno, $errstr, 4);
    $ms = round((microtime(true) - $start) * 1000, 1);
    if ($sock) {
        fclose($sock);
        return ['host' => $host, 'ip' => $ip, 'port' => $port, 'state' => 'open', 'ms' => $ms];
    }
    $state = $errno === 111 || stripos((string) $errstr, 'refused') !== false ? 'closed' : 'filtered';
    return ['host' => $host, 'ip' => $ip, 'port' => $port, 'state' => $state, 'ms' => $ms];
}

function toolReverse(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $ip = param('ip', 64);
    if (!isIp($ip)) {
        fail('Enter a valid IPv4 or IPv6 address.');
    }
    $name = @gethostbyaddr($ip);
    if (!$name || $name === $ip) {
        return ['ip' => $ip, 'hostname' => null, 'confirmed' => false];
    }
    return ['ip' => $ip, 'hostname' => $name, 'confirmed' => in_array($ip, resolve($name), true)];
}

function toolProxy(): array
{
    $headers = [];
    foreach (['HTTP_VIA' => 'Via', 'HTTP_X_FORWARDED_FOR' => 'X-Forwarded-For', 'HTTP_FORWARDED' => 'Forwarded',
        'HTTP_X_FORWARDED_HOST' => 'X-Forwarded-Host', 'HTTP_X_FORWARDED_PROTO' => 'X-Forwarded-Proto',
        'HTTP_CLIENT_IP' => 'Client-IP', 'HTTP_X_PROXY_ID' => 'X-Proxy-ID', 'HTTP_PROXY_CONNECTION' => 'Proxy-Connection',
        'HTTP_X_BLUECOAT_VIA' => 'X-BlueCoat-Via', 'HTTP_X_ORIGINATING_IP' => 'X-Originating-IP'] as $key => $label) {
        if (!empty($_SERVER[$key])) {
            $headers[$label] = substr((string) $_SERVER[$key], 0, 300);
        }
    }
    $me = toolMyIp();
    $name = strtolower((string) $me['hostname']);
    $hint = $name !== '' && preg_match('/(proxy|vpn|tor-exit|exit-?node|anonym)/', $name);
    return ['ip' => $me['ip'], 'hostname' => $me['hostname'], 'headers' => (object) $headers, 'detected' => $headers !== [] || $hint, 'hostnameHint' => (bool) $hint];
}

function toolBandwidth(): never
{
    rateLimit('bandwidth', 12);
    $mb = filter_var(param('mb', 3), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 25]]);
    if ($mb === false) {
        fail('Size must be 1 to 25 MB.');
    }
    $chunk = random_bytes(1024 * 1024);
    header_remove('Content-Type');
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . ($mb * 1024 * 1024));
    header('X-Accel-Buffering: no');
    for ($i = 0; $i < $mb; $i++) {
        echo $chunk;
        flush();
    }
    exit;
}

const DNS_TYPES = ['A' => DNS_A, 'AAAA' => DNS_AAAA, 'CNAME' => DNS_CNAME, 'MX' => DNS_MX, 'NS' => DNS_NS,
    'TXT' => DNS_TXT, 'SOA' => DNS_SOA, 'CAA' => DNS_CAA, 'SRV' => DNS_SRV];

function formatRecord(array $r): string
{
    return match ($r['type']) {
        'A' => $r['ip'],
        'AAAA' => $r['ipv6'],
        'CNAME', 'NS', 'PTR' => $r['target'],
        'MX' => "{$r['pri']} {$r['target']}",
        'TXT' => isset($r['entries']) ? implode('', $r['entries']) : $r['txt'],
        'SOA' => "{$r['mname']} {$r['rname']} serial {$r['serial']}, refresh {$r['refresh']}, retry {$r['retry']}, expire {$r['expire']}, minimum {$r['minimum-ttl']}",
        'CAA' => "{$r['flags']} {$r['tag']} \"{$r['value']}\"",
        'SRV' => "{$r['pri']} {$r['weight']} {$r['port']} {$r['target']}",
        default => json_encode($r),
    };
}

function toolDns(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $name = normalizeHost(param('name'));
    if (!isDomain($name)) {
        fail('Enter a valid domain or hostname.');
    }
    $type = strtoupper(param('type', 8) ?: 'A');
    $types = $type === 'ALL' ? array_keys(DNS_TYPES) : [$type];
    $records = [];
    foreach ($types as $t) {
        if (!isset(DNS_TYPES[$t])) {
            fail('Unsupported record type.');
        }
        foreach (@dns_get_record($name, DNS_TYPES[$t]) ?: [] as $r) {
            $records[] = ['type' => $r['type'], 'ttl' => $r['ttl'], 'value' => formatRecord($r)];
        }
    }
    return ['name' => $name, 'type' => $type, 'records' => $records];
}

function toolMx(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    $mx = @dns_get_record($domain, DNS_MX) ?: [];
    usort($mx, fn ($a, $b) => $a['pri'] <=> $b['pri']);
    $out = [];
    foreach ($mx as $r) {
        $out[] = ['priority' => $r['pri'], 'host' => $r['target'], 'ttl' => $r['ttl'], 'ips' => resolve($r['target'])];
    }
    return ['domain' => $domain, 'records' => $out];
}

function toolNs(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    $out = [];
    foreach (@dns_get_record($domain, DNS_NS) ?: [] as $r) {
        $out[] = ['host' => $r['target'], 'ttl' => $r['ttl'], 'ips' => resolve($r['target'])];
    }
    usort($out, fn ($a, $b) => strcmp($a['host'], $b['host']));
    $soa = (@dns_get_record($domain, DNS_SOA) ?: [])[0] ?? null;
    return [
        'domain' => $domain,
        'records' => $out,
        'soa' => $soa ? ['primary' => $soa['mname'], 'contact' => $soa['rname'], 'serial' => $soa['serial'], 'refresh' => $soa['refresh'], 'retry' => $soa['retry'], 'expire' => $soa['expire'], 'minimum' => $soa['minimum-ttl']] : null,
    ];
}

function toolSpf(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    $spf = array_values(array_filter(txtRecords($domain), fn ($t) => stripos($t, 'v=spf1') === 0));
    $notes = [];
    if (!$spf) {
        return ['domain' => $domain, 'record' => null, 'mechanisms' => [], 'notes' => [['level' => 'error', 'text' => 'No SPF record. Receivers cannot tell which servers may send mail for this domain.']]];
    }
    if (count($spf) > 1) {
        $notes[] = ['level' => 'error', 'text' => 'More than one SPF record. Receivers treat this as an error (permerror).'];
    }
    $terms = preg_split('/\s+/', trim($spf[0]));
    array_shift($terms);
    $lookups = 0;
    $mechanisms = [];
    foreach ($terms as $term) {
        $mechanisms[] = $term;
        if (preg_match('/^[+~?-]?(include|a|mx|ptr|exists|redirect)\b/i', $term)) {
            $lookups++;
        }
    }
    $all = preg_grep('/^[+~?-]?all$/i', $terms);
    $all = $all ? reset($all) : null;
    if ($all === null && !preg_grep('/^redirect=/i', $terms)) {
        $notes[] = ['level' => 'warning', 'text' => 'No "all" at the end, so mail from other servers is neither passed nor failed.'];
    } elseif ($all === '+all' || $all === 'all') {
        $notes[] = ['level' => 'error', 'text' => '"+all" lets any server on the internet send as this domain.'];
    } elseif ($all === '?all') {
        $notes[] = ['level' => 'warning', 'text' => '"?all" is neutral: it does not protect the domain.'];
    } elseif ($all === '~all') {
        $notes[] = ['level' => 'ok', 'text' => '"~all" (soft fail): mail from other servers is accepted but marked.'];
    } elseif ($all === '-all') {
        $notes[] = ['level' => 'ok', 'text' => '"-all" (fail): mail from other servers should be rejected.'];
    }
    if ($lookups > 10) {
        $notes[] = ['level' => 'error', 'text' => "{$lookups} DNS lookups at the top level; SPF allows at most 10."];
    } else {
        $noun = $lookups === 1 ? 'lookup' : 'lookups';
        $notes[] = ['level' => 'ok', 'text' => "{$lookups} DNS {$noun} at the top level (limit 10; nested includes count too)."];
    }
    return ['domain' => $domain, 'record' => $spf[0], 'mechanisms' => $mechanisms, 'notes' => $notes];
}

function toolDmarc(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    $records = array_values(array_filter(txtRecords("_dmarc.{$domain}"), fn ($t) => stripos($t, 'v=DMARC1') === 0));
    if (!$records) {
        return ['domain' => $domain, 'record' => null, 'tags' => [], 'notes' => [['level' => 'error', 'text' => 'No DMARC record at _dmarc.' . $domain . '. Spoofed mail from this domain is not blocked by policy.']]];
    }
    $tags = [];
    foreach (explode(';', $records[0]) as $part) {
        if (str_contains($part, '=')) {
            [$k, $v] = array_map('trim', explode('=', $part, 2));
            $tags[strtolower($k)] = $v;
        }
    }
    $notes = [];
    $p = strtolower($tags['p'] ?? '');
    $notes[] = match ($p) {
        'reject' => ['level' => 'ok', 'text' => 'Policy "reject": mail that fails DMARC is refused.'],
        'quarantine' => ['level' => 'ok', 'text' => 'Policy "quarantine": mail that fails DMARC goes to spam.'],
        'none' => ['level' => 'warning', 'text' => 'Policy "none": failures are only reported, not blocked.'],
        default => ['level' => 'error', 'text' => 'The required "p" tag is missing or invalid.'],
    };
    if (count($records) > 1) {
        $notes[] = ['level' => 'error', 'text' => 'More than one DMARC record; receivers ignore all of them.'];
    }
    if (empty($tags['rua'])) {
        $notes[] = ['level' => 'warning', 'text' => 'No "rua" address, so you get no aggregate reports.'];
    }
    return ['domain' => $domain, 'record' => $records[0], 'tags' => $tags, 'notes' => $notes];
}

function toolDkim(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    $selector = strtolower(param('selector', 63));
    if (!preg_match('/^[a-z0-9]([a-z0-9._-]{0,61}[a-z0-9])?$/', $selector)) {
        fail('Enter a valid selector, like "default" or "google".');
    }
    $name = "{$selector}._domainkey.{$domain}";
    $records = txtRecords($name);
    if (!$records) {
        return ['name' => $name, 'record' => null, 'tags' => [], 'bits' => null];
    }
    $tags = [];
    foreach (explode(';', $records[0]) as $part) {
        if (str_contains($part, '=')) {
            [$k, $v] = array_map('trim', explode('=', $part, 2));
            $tags[strtolower($k)] = $v;
        }
    }
    $bits = null;
    if (!empty($tags['p'])) {
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(preg_replace('/\s+/', '', $tags['p']), 64) . "-----END PUBLIC KEY-----\n";
        $key = @openssl_pkey_get_public($pem);
        $bits = $key ? (openssl_pkey_get_details($key)['bits'] ?? null) : null;
    }
    return ['name' => $name, 'record' => $records[0], 'tags' => $tags, 'bits' => $bits];
}

function toolSmtp(): array
{
    rateLimit('heavy', HEAVY_PER_MINUTE);
    $input = normalizeHost(param('host'));
    if (!isIp($input) && !isDomain($input)) {
        fail('Enter a domain or mail server.');
    }
    $server = $input;
    if (!isIp($input)) {
        $mx = @dns_get_record($input, DNS_MX) ?: [];
        usort($mx, fn ($a, $b) => $a['pri'] <=> $b['pri']);
        if ($mx) {
            $server = $mx[0]['target'];
        }
    }
    [$server, $ips] = publicTarget($server);
    $ip = $ips[0];
    $target = str_contains($ip, ':') ? "[{$ip}]" : $ip;
    $start = microtime(true);
    $sock = @stream_socket_client("tcp://{$target}:25", $errno, $errstr, 8);
    if (!$sock) {
        return ['input' => $input, 'server' => $server, 'ip' => $ip, 'connected' => false, 'error' => $errstr ?: 'No answer on port 25.'];
    }
    stream_set_timeout($sock, 8);
    $read = function () use ($sock): string {
        $text = '';
        while (($line = fgets($sock, 1024)) !== false) {
            $text .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return rtrim($text);
    };
    $banner = $read();
    $connectMs = round((microtime(true) - $start) * 1000);
    fwrite($sock, "EHLO tools.pingomni.com\r\n");
    $ehlo = $read();
    fwrite($sock, "QUIT\r\n");
    fclose($sock);
    $caps = [];
    foreach (array_slice(explode("\n", $ehlo), 1) as $line) {
        $caps[] = trim(substr($line, 4));
    }
    return [
        'input' => $input,
        'server' => $server,
        'ip' => $ip,
        'connected' => true,
        'ms' => $connectMs,
        'banner' => $banner,
        'starttls' => (bool) preg_grep('/^STARTTLS$/i', $caps),
        'capabilities' => $caps,
    ];
}

function toolWhois(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $query = normalizeHost(param('query'));
    if (isIp($query)) {
        $d = rdap('ip/' . $query);
        return [
            'kind' => 'ip',
            'query' => $query,
            'name' => $d['name'] ?? null,
            'handle' => $d['handle'] ?? null,
            'range' => isset($d['startAddress']) ? "{$d['startAddress']} - {$d['endAddress']}" : null,
            'country' => $d['country'] ?? null,
            'type' => $d['type'] ?? null,
            'events' => rdapEvents($d),
            'contacts' => rdapEntities($d),
            'source' => $d['_source'],
        ];
    }
    if (!isDomain($query)) {
        fail('Enter a domain name or an IP address.');
    }
    $d = rdap('domain/' . $query);
    return [
        'kind' => 'domain',
        'query' => $query,
        'name' => strtolower($d['ldhName'] ?? $query),
        'status' => $d['status'] ?? [],
        'events' => rdapEvents($d),
        'nameservers' => array_map(fn ($n) => strtolower($n['ldhName'] ?? ''), $d['nameservers'] ?? []),
        'dnssec' => $d['secureDNS']['delegationSigned'] ?? null,
        'contacts' => rdapEntities($d),
        'source' => $d['_source'],
    ];
}

const BLACKLISTS = ['zen.spamhaus.org', 'bl.spamcop.net', 'b.barracudacentral.org', 'dnsbl.sorbs.net', 'psbl.surriel.com', 'dnsbl-1.uceprotect.net', 'bl.mailspike.net', 'dnsbl.dronebl.org'];

function toolBlacklist(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $input = normalizeHost(param('host'));
    if (isDomain($input)) {
        $ips = array_values(array_filter(resolve($input), fn ($ip) => str_contains($ip, '.')));
        if (!$ips) {
            fail("{$input} has no IPv4 address to check.");
        }
        $ip = $ips[0];
    } elseif (filter_var($input, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $ip = $input;
    } else {
        fail('Enter an IPv4 address or a hostname.');
    }
    if (!isPublicIp($ip)) {
        fail('Only public addresses are listed on blacklists.');
    }
    $reversed = implode('.', array_reverse(explode('.', $ip)));
    $results = [];
    foreach (BLACKLISTS as $list) {
        $answers = @dns_get_record("{$reversed}.{$list}", DNS_A) ?: [];
        $codes = array_map(fn ($r) => $r['ip'], $answers);
        // 127.255.255.x is a list refusing the query (common through public resolvers), not a listing.
        $refused = (bool) array_filter($codes, fn ($c) => str_starts_with($c, '127.255.255.'));
        $state = $refused ? 'unknown' : ($codes ? 'listed' : 'clean');
        $reason = null;
        if ($state === 'listed') {
            $reason = implode(' ', txtRecords("{$reversed}.{$list}")) ?: null;
        }
        $results[] = ['list' => $list, 'state' => $state, 'codes' => $codes, 'reason' => $reason];
    }
    return ['input' => $input, 'ip' => $ip, 'results' => $results];
}

// ---------------------------------------------------------------------------

$tools = [
    'myip' => 'toolMyIp', 'ping' => 'toolPing', 'traceroute' => 'toolTraceroute', 'port' => 'toolPort',
    'reverse' => 'toolReverse', 'proxy' => 'toolProxy', 'bandwidth' => 'toolBandwidth', 'dns' => 'toolDns',
    'mx' => 'toolMx', 'ns' => 'toolNs', 'spf' => 'toolSpf', 'dmarc' => 'toolDmarc', 'dkim' => 'toolDkim',
    'smtp' => 'toolSmtp', 'whois' => 'toolWhois', 'blacklist' => 'toolBlacklist',
];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    fail('Only GET is supported.', 405);
}
$tool = (string) ($_GET['tool'] ?? '');
if (!isset($tools[$tool])) {
    fail('Unknown tool.', 404);
}
respond(['ok' => true] + $tools[$tool]());
