<?php

// PingOmni network and email tools: one small JSON API behind nginx at /api/?tool=<name>.
// Tools that reach out from this server (ping, traceroute, MTR, port, SMTP, name server checks) only accept
// public addresses, connect to the exact address they checked (never re-resolving the name), run with short
// timeouts, are rate-limited per visitor, and share a small number of slots so they cannot tie up the server.

declare(strict_types=1);

const HEAVY_PER_MINUTE = 10;
const LIGHT_PER_MINUTE = 40;
const HEAVY_SLOTS = 4;
const USER_AGENT = 'PingOmni-Tools/1.0';

// Where tests from "our server" run, shown beside every result. Set PINGOMNI_SERVER_LOCATION in the PHP-FPM pool
// (env[PINGOMNI_SERVER_LOCATION] = ...) if the server moves. This server has no IPv6 route, so IPv6-only targets
// are refused with a pointer to Globalping; set PINGOMNI_IPV6=1 once it has one.
define('SERVER_LOCATION', getenv('PINGOMNI_SERVER_LOCATION') ?: 'Albania');
define('SERVER_IPV6', getenv('PINGOMNI_IPV6') === '1');

if (!defined('PINGOMNI_TEST')) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
}

final class ToolFailure extends Exception
{
    public function __construct(string $message, public readonly int $status = 400, public readonly ?int $retryAfter = null)
    {
        parent::__construct($message);
    }
}

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function fail(string $message, int $status = 400, ?int $retryAfter = null): never
{
    throw new ToolFailure($message, $status, $retryAfter);
}

function param(string $name, int $max = 255): string
{
    $value = trim((string) ($_GET[$name] ?? ''));
    if (strlen($value) > $max) {
        fail("The {$name} is too long.");
    }
    return $value;
}

/** One of a fixed set of values, or the first one when the parameter is missing. */
function choice(string $name, array $allowed): string
{
    $value = strtolower(param($name, 32));
    if ($value === '') {
        return $allowed[0];
    }
    if (!in_array($value, $allowed, true)) {
        fail("Unsupported {$name}.");
    }
    return $value;
}

// nginx sets REMOTE_ADDR from CF-Connecting-IP only for requests that come from the Cloudflare Tunnel on this
// server (set_real_ip_from in deploy/nginx.conf); a header sent by anyone else is ignored there.
function clientIp(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
}

/** The key limits are counted under: the address, or its /64 for IPv6 (one home or server usually holds a whole /64). */
function clientKey(): string
{
    $ip = clientIp();
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        return bin2hex(substr((string) inet_pton($ip), 0, 8)) . '::/64';
    }
    return $ip;
}

function stateDir(): ?string
{
    $dir = sys_get_temp_dir() . '/pingomni-tools';
    return is_dir($dir) || @mkdir($dir, 0700) || is_dir($dir) ? $dir : null;
}

// Per-visitor limit, one counter file per visitor and class, reset at the start of every minute.
function rateLimit(string $class, int $perMinute): void
{
    $dir = stateDir();
    $fh = $dir ? @fopen($dir . '/' . hash('sha256', clientKey() . '|' . $class), 'c+') : false;
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
        $wait = 60 - time() % 60;
        fail("You have run this kind of test {$perMinute} times this minute. Try again in {$wait} seconds.", 429, $wait);
    }
}

// Long tests (ping, traces, port checks, SMTP) run one at a time per visitor, and at most HEAVY_SLOTS at once in
// total, so they never take every PHP worker. The locks are released when the request ends.
$GLOBALS['heldLocks'] = [];

function heavySlot(): void
{
    $dir = stateDir();
    if (!$dir) {
        return;
    }
    $mine = @fopen($dir . '/run-' . hash('sha256', clientKey()), 'c');
    if ($mine && !flock($mine, LOCK_EX | LOCK_NB)) {
        fail('You already have a test running. Wait for it to finish, then try again.', 429, 5);
    }
    $GLOBALS['heldLocks'][] = $mine;
    for ($i = 0; $i < HEAVY_SLOTS; $i++) {
        $slot = @fopen("{$dir}/slot-{$i}", 'c');
        if ($slot && flock($slot, LOCK_EX | LOCK_NB)) {
            $GLOBALS['heldLocks'][] = $slot;
            return;
        }
    }
    fail('Our server is busy with other visitors’ tests. Try again in a few seconds.', 503, 10);
}

function heavy(): void
{
    rateLimit('heavy', HEAVY_PER_MINUTE);
    heavySlot();
}

function isIp(string $v): bool
{
    return filter_var($v, FILTER_VALIDATE_IP) !== false;
}

function isIpv4(string $v): bool
{
    return filter_var($v, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false;
}

function isDomain(string $v): bool
{
    return (bool) preg_match('/^(?=.{1,253}$)(?!-)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/i', rtrim($v, '.'));
}

function inCidr(string $ip, string $cidr): bool
{
    [$net, $bits] = explode('/', $cidr);
    $a = @inet_pton($ip);
    $b = @inet_pton($net);
    if ($a === false || $b === false || strlen($a) !== strlen($b)) {
        return false;
    }
    $bits = (int) $bits;
    $bytes = intdiv($bits, 8);
    if (substr($a, 0, $bytes) !== substr($b, 0, $bytes)) {
        return false;
    }
    $rest = $bits % 8;
    if ($rest === 0) {
        return true;
    }
    $mask = (0xff << (8 - $rest)) & 0xff;
    return (ord($a[$bytes]) & $mask) === (ord($b[$bytes]) & $mask);
}

// Ranges this server never reaches out to: private, loopback, link-local, CGNAT, documentation, benchmarking,
// multicast and reserved space. IPv6 is limited to global unicast (2000::/3), which also rules out IPv4-mapped
// (::ffff:127.0.0.1), IPv4-compatible and NAT64 addresses; 6to4 and Teredo are refused because they embed IPv4.
const BLOCKED_V4 = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
    '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
    '203.0.113.0/24', '224.0.0.0/3'];
const BLOCKED_V6 = ['2001::/32', '2001:2::/48', '2001:10::/28', '2001:20::/28', '2001:db8::/32', '2002::/16', '3fff::/20'];

function isPublicIp(string $ip): bool
{
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        foreach (BLOCKED_V4 as $cidr) {
            if (inCidr($ip, $cidr)) {
                return false;
            }
        }
        return true;
    }
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) || !inCidr($ip, '2000::/3')) {
        return false;
    }
    foreach (BLOCKED_V6 as $cidr) {
        if (inCidr($ip, $cidr)) {
            return false;
        }
    }
    return true;
}

/** The reverse-DNS name of an address: 8.8.8.8 is 8.8.8.8.in-addr.arpa, IPv6 is spelled out nibble by nibble. */
function arpaName(string $ip): string
{
    if (isIpv4($ip)) {
        return implode('.', array_reverse(explode('.', $ip))) . '.in-addr.arpa';
    }
    return implode('.', array_reverse(str_split(bin2hex((string) inet_pton($ip))))) . '.ip6.arpa';
}

function sameIp(string $a, string $b): bool
{
    return @inet_pton($a) !== false && @inet_pton($a) === @inet_pton($b);
}

function normalizeHost(string $host): string
{
    $host = strtolower(trim($host));
    $host = preg_replace('#^[a-z]+://#', '', $host);
    $host = explode('/', $host)[0];
    $host = preg_replace('/^[^@]*@/', '', $host);
    if (str_starts_with($host, '[') && str_contains($host, ']')) {
        $host = substr($host, 1, strpos($host, ']') - 1);
    } elseif (substr_count($host, ':') === 1) {
        $host = explode(':', $host)[0];
    }
    return rtrim($host, '.');
}

// ---------------------------------------------------------------------------
// DNS through dig, so a lookup can tell "no such name" (NXDOMAIN), "no records of this type", a failing server
// (SERVFAIL, REFUSED) and no answer at all (timeout) apart. dns_get_record() reports all of them as empty.
// ---------------------------------------------------------------------------

/** Unquotes the character-strings of a TXT answer: "v=spf1 " "include:x" becomes v=spf1 include:x. */
function txtValue(string $rdata): string
{
    if (!preg_match_all('/"((?:[^"\\\\]|\\\\.)*)"/', $rdata, $m)) {
        return $rdata;
    }
    $out = '';
    foreach ($m[1] as $part) {
        $out .= preg_replace_callback('/\\\\(\d{3}|.)/', fn ($e) => ctype_digit($e[1]) ? chr((int) $e[1]) : $e[1], $part);
    }
    return $out;
}

/** Reads dig's normal output: status, flags, answer and authority records, the server asked and the time taken. */
function parseDig(string $out): array
{
    $result = ['status' => 'TIMEOUT', 'flags' => [], 'answers' => [], 'authority' => [], 'server' => null, 'ms' => null];
    if (preg_match('/->>HEADER<<- opcode: \w+, status: ([A-Z]+)/', $out, $m)) {
        $result['status'] = $m[1];
    }
    if (preg_match('/;; flags: ([a-z ]*);/', $out, $m)) {
        $result['flags'] = array_values(array_filter(preg_split('/\s+/', trim($m[1]))));
    }
    if (preg_match('/;; Query time: (\d+) msec/', $out, $m)) {
        $result['ms'] = (int) $m[1];
    }
    if (preg_match('/;; SERVER: ([^#\s]+)/', $out, $m)) {
        $result['server'] = $m[1];
    }
    $section = null;
    foreach (explode("\n", $out) as $line) {
        if (preg_match('/^;; (ANSWER|AUTHORITY|ADDITIONAL) SECTION:/', $line, $m)) {
            $section = strtolower($m[1]);
            continue;
        }
        if ($line === '') {
            $section = null;
        }
        if ($line === '' || $line[0] === ';' || ($section !== 'answer' && $section !== 'authority')) {
            continue;
        }
        if (!preg_match('/^(\S+)\s+(\d+)\s+IN\s+([A-Z0-9]+)\s+(.*)$/', $line, $m)) {
            continue;
        }
        $type = $m[3];
        $value = rtrim($m[4]);
        if ($type === 'TXT') {
            $value = txtValue($value);
        } elseif (in_array($type, ['CNAME', 'NS', 'PTR', 'MX', 'SRV', 'SOA'], true)) {
            // Drop the trailing dot of names, but keep the lone "." of a null MX ("0 .").
            $value = preg_replace('/(?<=[^\s])\.(?=\s|$)/', '', $value);
        }
        $result[$section === 'answer' ? 'answers' : 'authority'][] = ['name' => rtrim($m[1], '.'), 'ttl' => (int) $m[2], 'type' => $type, 'value' => $value];
    }
    return $result;
}

/**
 * Runs several dig queries at once (a few seconds at most, however slow a server is).
 * Each query is [name, type] plus optional 'server' (an IP) and 'norec' (no recursion, for authoritative servers).
 * @return array<int, array> the parsed results in the same order, each with 'raw' (dig's text) and 'query'
 */
function digQueries(array $queries, int $timeout = 2): array
{
    $results = [];
    foreach (array_chunk($queries, 32, true) as $batch) {
        $procs = [];
        foreach ($batch as $i => $q) {
            $cmd = ['timeout', (string) ($timeout * 2 + 2), 'dig', '+time=' . $timeout, '+tries=1', '+nocookie'];
            if (!empty($q['norec'])) {
                $cmd[] = '+norec';
            }
            if (!empty($q['dnssec'])) {
                $cmd[] = '+dnssec';
            }
            if (!empty($q['cd'])) {
                $cmd[] = '+cd';
            }
            if (!empty($q['server'])) {
                $cmd[] = '@' . $q['server'];
            }
            array_push($cmd, ...($q[1] === 'PTR' && isIp($q[0]) ? ['-x', $q[0]] : ['-q', $q[0], '-t', $q[1]]));
            $p = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
            if (is_resource($p)) {
                $procs[$i] = [$p, $pipes];
            }
        }
        foreach ($batch as $i => $q) {
            if (!isset($procs[$i])) {
                $results[$i] = ['status' => 'ERROR', 'flags' => [], 'answers' => [], 'authority' => [], 'server' => null, 'ms' => null, 'raw' => ''];
                continue;
            }
            [$p, $pipes] = $procs[$i];
            $out = (string) stream_get_contents($pipes[1]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            proc_close($p);
            $results[$i] = parseDig($out) + ['raw' => trim($out)];
        }
    }
    foreach ($results as $i => &$r) {
        $r['query'] = ['name' => $queries[$i][0], 'type' => $queries[$i][1], 'server' => $queries[$i]['server'] ?? null];
    }
    unset($r);
    ksort($results);
    return $results;
}

function dig(string $name, string $type, ?string $server = null, bool $norec = false): array
{
    return digQueries([[$name, $type, 'server' => $server, 'norec' => $norec]])[0];
}

/** Answers of the asked type only (a lookup that follows a CNAME also returns the CNAME). */
function answersOf(array $r, string $type): array
{
    return array_values(array_filter($r['answers'], fn ($a) => $a['type'] === $type));
}

/** One word for the outcome: found, nodata, nxdomain, servfail, refused, timeout or error. */
function outcome(array $r, string $type): string
{
    return match ($r['status']) {
        'NOERROR' => answersOf($r, $type) ? 'found' : 'nodata',
        'NXDOMAIN' => 'nxdomain',
        'SERVFAIL' => 'servfail',
        'REFUSED' => 'refused',
        'TIMEOUT' => 'timeout',
        default => 'error',
    };
}

/** The compact form the browser gets: outcome, status, records, resolver and time, plus dig's own text. */
function lookupResult(array $r, string $type): array
{
    return [
        'type' => $type,
        'outcome' => outcome($r, $type),
        'status' => $r['status'],
        'records' => $r['answers'],
        'authenticated' => in_array('ad', $r['flags'], true),
        'authoritative' => in_array('aa', $r['flags'], true),
        'server' => $r['server'],
        'ms' => $r['ms'],
        'raw' => $r['raw'],
    ];
}

/** IPv4 and IPv6 addresses of a name, with how each lookup went. */
function addresses(string $host): array
{
    if (isIp($host)) {
        return ['ips' => [$host], 'v4' => isIpv4($host) ? 'found' : 'nodata', 'v6' => isIpv4($host) ? 'nodata' : 'found'];
    }
    [$a, $aaaa] = digQueries([[$host, 'A'], [$host, 'AAAA']]);
    $ips = array_merge(array_column(answersOf($a, 'A'), 'value'), array_column(answersOf($aaaa, 'AAAA'), 'value'));
    return ['ips' => array_values(array_unique($ips)), 'v4' => outcome($a, 'A'), 'v6' => outcome($aaaa, 'AAAA')];
}

const OUTCOME_TEXT = [
    'nxdomain' => 'does not exist in DNS (NXDOMAIN)',
    'nodata' => 'has no A or AAAA record',
    'servfail' => 'could not be resolved: its DNS servers failed to answer (SERVFAIL)',
    'refused' => 'could not be resolved: the DNS server refused the query',
    'timeout' => 'could not be resolved: DNS did not answer in time',
    'error' => 'could not be resolved',
];

/**
 * A host this server may reach out to: a valid name or IP whose every address is public. Returns the name, all its
 * addresses, and the one to test (IPv4 first; this server has no IPv6 route). Callers connect to that address only.
 * @return array{0: string, 1: string[], 2: string}
 */
function publicTarget(string $raw): array
{
    $host = normalizeHost($raw);
    if ($host === '' || (!isIp($host) && !isDomain($host))) {
        fail('Enter a valid hostname or IP address, like example.com or 93.184.215.14.');
    }
    $found = addresses($host);
    $ips = $found['ips'];
    if (!$ips) {
        $why = in_array($found['v4'], ['servfail', 'refused', 'timeout', 'error'], true) ? $found['v4'] : ($found['v6'] !== 'nodata' && $found['v6'] !== 'found' ? $found['v6'] : $found['v4']);
        fail("{$host} " . (OUTCOME_TEXT[$why] ?? 'does not resolve to an IP address') . '.', 422);
    }
    foreach ($ips as $ip) {
        if (!isPublicIp($ip)) {
            fail(isIp($host)
                ? 'Only public addresses can be tested from our server. Private, loopback and reserved addresses are refused.'
                : "{$host} points to {$ip}, which is not a public address, so our server will not test it.", 422);
        }
    }
    $v4 = array_values(array_filter($ips, 'isIpv4'));
    if (!$v4 && !SERVER_IPV6) {
        fail("{$host} has only IPv6 addresses, and our server has no IPv6 route. Choose a Globalping location to test it over IPv6.", 422);
    }
    return [$host, $ips, $v4[0] ?? $ips[0]];
}

function domainParam(string $name = 'domain'): string
{
    $domain = normalizeHost(param($name));
    if (!isDomain($domain)) {
        fail('Enter a valid domain name, like example.com.');
    }
    return $domain;
}

/** Runs a command without a shell, with a hard time limit. @return array{0: int, 1: string, 2: string} code, stdout, stderr */
function run(array $cmd, int $seconds): array
{
    $proc = proc_open(array_merge(['timeout', (string) $seconds], $cmd), [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($proc)) {
        fail('The tool could not start.', 500);
    }
    $out = stream_get_contents($pipes[1]);
    $err = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);
    return [$code, (string) $out, trim((string) $err)];
}

/** Tags of a "k=v; k=v" record (DMARC, DKIM), keys lowercased, in order. */
function tagList(string $record): array
{
    $tags = [];
    foreach (explode(';', $record) as $part) {
        if (str_contains($part, '=')) {
            [$k, $v] = array_map('trim', explode('=', $part, 2));
            if ($k !== '') {
                $tags[strtolower($k)] = $v;
            }
        }
    }
    return $tags;
}

// ---------------------------------------------------------------------------
// TCP connections through the sockets extension, so "refused", "no answer" and other errors stay apart.
// ---------------------------------------------------------------------------

/**
 * Connects to many ports of one address at once and waits at most $timeout seconds in total.
 * @return array<int, array{port: int, state: string, ms: ?float, error: ?string}> state: open, closed (refused), filtered (no answer) or error
 */
function tcpConnectMany(string $ip, array $ports, float $timeout): array
{
    $family = isIpv4($ip) ? AF_INET : AF_INET6;
    $pending = [];
    $started = [];
    $results = [];
    foreach ($ports as $port) {
        $s = @socket_create($family, SOCK_STREAM, SOL_TCP);
        if ($s === false) {
            $results[$port] = ['port' => $port, 'state' => 'error', 'ms' => null, 'error' => 'Could not open a socket on our server.'];
            continue;
        }
        socket_set_nonblock($s);
        $started[$port] = microtime(true);
        if (@socket_connect($s, $ip, $port)) {
            $results[$port] = ['port' => $port, 'state' => 'open', 'ms' => round((microtime(true) - $started[$port]) * 1000, 1), 'error' => null];
            socket_close($s);
            continue;
        }
        $err = socket_last_error($s);
        if (!in_array($err, [SOCKET_EINPROGRESS, SOCKET_EALREADY, SOCKET_EWOULDBLOCK], true)) {
            $results[$port] = connectError($port, $err);
            socket_close($s);
            continue;
        }
        $pending[$port] = $s;
    }
    $deadline = microtime(true) + $timeout;
    while ($pending && ($left = $deadline - microtime(true)) > 0) {
        $write = array_values($pending);
        $read = $except = null;
        if (@socket_select($read, $write, $except, (int) $left, (int) (fmod($left, 1) * 1e6)) === false) {
            break;
        }
        foreach ($write as $s) {
            $port = array_search($s, $pending, true);
            $err = (int) socket_get_option($s, SOL_SOCKET, SO_ERROR);
            $results[$port] = $err === 0
                ? ['port' => $port, 'state' => 'open', 'ms' => round((microtime(true) - $started[$port]) * 1000, 1), 'error' => null]
                : connectError($port, $err);
            socket_close($s);
            unset($pending[$port]);
        }
    }
    foreach ($pending as $port => $s) {
        $results[$port] = ['port' => $port, 'state' => 'filtered', 'ms' => null, 'error' => null];
        socket_close($s);
    }
    return $results;
}

function connectError(int $port, int $err): array
{
    if ($err === SOCKET_ECONNREFUSED) {
        return ['port' => $port, 'state' => 'closed', 'ms' => null, 'error' => null];
    }
    if ($err === SOCKET_ETIMEDOUT) {
        return ['port' => $port, 'state' => 'filtered', 'ms' => null, 'error' => null];
    }
    return ['port' => $port, 'state' => 'error', 'ms' => null, 'error' => ucfirst(socket_strerror($err)) . '.'];
}

// ---------------------------------------------------------------------------
// Registration data (RDAP)
// ---------------------------------------------------------------------------

/** HTTPS GET with short limits; redirects are followed over HTTPS only. @return array{0: int, 1: ?string, 2: string} */
function httpsGet(string $url, int $timeout = 12, array $headers = []): array
{
    $c = curl_init($url);
    curl_setopt_array($c, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 4,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => USER_AGENT,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_MAXFILESIZE => 4 * 1024 * 1024,
    ]);
    $body = curl_exec($c);
    return [(int) curl_getinfo($c, CURLINFO_HTTP_CODE), $body === false ? null : (string) $body, (string) curl_getinfo($c, CURLINFO_EFFECTIVE_URL)];
}

/** The TLDs that publish RDAP, from IANA's bootstrap file (kept for a day). Null when IANA cannot be reached. */
function rdapTlds(): ?array
{
    $dir = stateDir();
    $file = $dir ? "{$dir}/rdap-dns.json" : null;
    if ($file && is_file($file) && filemtime($file) > time() - 86400) {
        $tlds = json_decode((string) @file_get_contents($file), true);
        if (is_array($tlds)) {
            return $tlds;
        }
    }
    [$code, $body] = httpsGet('https://data.iana.org/rdap/dns.json', 8);
    $data = $code === 200 ? json_decode((string) $body, true) : null;
    if (!is_array($data['services'] ?? null)) {
        return null;
    }
    $tlds = [];
    foreach ($data['services'] as [$names]) {
        foreach ($names as $t) {
            $tlds[] = strtolower($t);
        }
    }
    if ($file) {
        @file_put_contents($file, json_encode($tlds), LOCK_EX);
    }
    return $tlds;
}

/** @return array{0: string, 1: ?array, 2: ?string} found / notfound, the record, and the server that answered */
function rdap(string $path): array
{
    [$code, $body, $url] = httpsGet('https://rdap.org/' . $path, 12, ['Accept: application/rdap+json']);
    $host = parse_url($url, PHP_URL_HOST) ?: null;
    if ($code === 404) {
        return ['notfound', null, $host];
    }
    if ($code === 429) {
        fail('The registry is limiting lookups right now. Try again in a minute.', 503, 60);
    }
    if ($body === null || $code >= 400 || $code === 0) {
        fail('The registry did not answer. Try again in a moment.', 502);
    }
    $data = json_decode($body, true);
    if (!is_array($data)) {
        fail('The registry sent an answer we could not read.', 502);
    }
    return ['found', $data, $host];
}

/** Text a registry puts in place of hidden data. */
function isRedacted(string $v): bool
{
    return (bool) preg_match('/redact|privacy|withheld|not disclosed|data protected|gdpr|contact (the )?registrar/i', $v);
}

/** Name, organisation, email, phone and address of each contact the registry publishes (many are redacted). */
function rdapEntities(array $node): array
{
    $out = [];
    foreach ($node['entities'] ?? [] as $e) {
        $card = ['roles' => $e['roles'] ?? [], 'handle' => $e['handle'] ?? null, 'redacted' => []];
        foreach ($e['vcardArray'][1] ?? [] as $prop) {
            [$key, $params, , $value] = $prop + [null, [], null, null];
            if (in_array($key, ['fn', 'org', 'email', 'tel'], true) && is_string($value) && $value !== '') {
                if (isRedacted($value)) {
                    $card['redacted'][] = $key;
                } else {
                    $card[$key] = $value;
                }
            } elseif ($key === 'adr') {
                $parts = is_array($value) ? array_map(fn ($p) => is_array($p) ? implode(' ', $p) : (string) $p, $value) : [];
                $label = (string) (($params['label'] ?? null) ?: trim(implode(' ', array_filter($parts))));
                if ($label !== '' && !isRedacted($label)) {
                    $card['address'] = str_replace("\n", ', ', $label);
                } elseif ($label !== '') {
                    $card['redacted'][] = 'address';
                }
            }
        }
        foreach ($e['publicIds'] ?? [] as $id) {
            if (($id['type'] ?? '') === 'IANA Registrar ID') {
                $card['ianaId'] = $id['identifier'] ?? null;
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
        if (isset($ev['eventAction'], $ev['eventDate'])) {
            $events[$ev['eventAction']] = $ev['eventDate'];
        }
    }
    return $events;
}

/** Fields the registry says it removed (RFC 9537 "redacted"), plus contacts whose details read "REDACTED". */
function rdapRedactions(array $d, array $contacts): array
{
    $names = [];
    foreach ($d['redacted'] ?? [] as $r) {
        $names[] = (string) ($r['name']['description'] ?? $r['name']['type'] ?? '');
    }
    foreach ($contacts as $c) {
        if ($c['redacted']) {
            $names[] = implode('/', $c['roles'] ?: ['contact']) . ' ' . implode(', ', $c['redacted']);
        }
    }
    return array_values(array_unique(array_filter($names)));
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

function toolMyIp(): array
{
    $ip = clientIp();
    $ptr = isPublicIp($ip) ? answersOf(dig($ip, 'PTR'), 'PTR') : [];
    return ['ip' => $ip, 'hostname' => $ptr[0]['value'] ?? null];
}

function toolPing(): array
{
    heavy();
    [$host, $ips, $ip] = publicTarget(param('host'));
    [, $out, $err] = run(['ping', isIpv4($ip) ? '-4' : '-6', '-c', '4', '-i', '0.5', '-W', '2', '-n', $ip], 12);
    $replies = [];
    foreach (explode("\n", $out) as $line) {
        if (preg_match('/icmp_seq=(\d+) ttl=(\d+) time=([\d.]+) ms/', $line, $m)) {
            $replies[] = ['seq' => (int) $m[1], 'ttl' => (int) $m[2], 'ms' => (float) $m[3]];
        }
    }
    if (!preg_match('/(\d+) packets transmitted, (\d+) received/', $out, $s)) {
        fail('Ping could not run: ' . ($err ?: 'no output') . '.', 502);
    }
    preg_match('#= ([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+) ms#', $out, $t);
    return [
        'host' => $host,
        'ip' => $ip,
        'addresses' => $ips,
        'sent' => (int) $s[1],
        'received' => (int) $s[2],
        'min' => isset($t[1]) ? (float) $t[1] : null,
        'avg' => isset($t[2]) ? (float) $t[2] : null,
        'max' => isset($t[3]) ? (float) $t[3] : null,
        'mdev' => isset($t[4]) ? (float) $t[4] : null,
        'replies' => $replies,
        'settings' => '4 ICMP echo requests, 0.5 s apart, 2 s timeout each',
        'raw' => trim($out . ($err !== '' ? "\n" . $err : '')),
    ];
}

/** mtr's JSON report as hops. mtr -b labels a hop "name (1.2.3.4)", "1.2.3.4" or "???"; -z adds "AS13335" or "AS???". */
function mtrHops(array $data): array
{
    $hops = [];
    foreach ($data['report']['hubs'] ?? [] as $h) {
        $label = (string) $h['host'];
        $asn = preg_match('/^AS(\d+)$/', (string) ($h['ASN'] ?? ''), $m) ? (int) $m[1] : null;
        $name = null;
        $addr = $label;
        if (preg_match('/^(.*) \(([^)]+)\)$/', $label, $m)) {
            [$name, $addr] = [$m[1] !== $m[2] ? $m[1] : null, $m[2]];
        }
        $silent = $addr === '???';
        $hops[] = [
            'hop' => (int) $h['count'],
            'address' => $silent ? null : $addr,
            'name' => $name,
            'asn' => $asn,
            'loss' => (float) $h['Loss%'],
            'sent' => (int) $h['Snt'],
            'avg' => $silent ? null : (float) $h['Avg'],
            'best' => $silent ? null : (float) $h['Best'],
            'worst' => $silent ? null : (float) $h['Wrst'],
            'stdev' => $silent ? null : (float) $h['StDev'],
        ];
    }
    return $hops;
}

/** ICMP, or TCP SYN to a port (gets through networks that drop ICMP). */
function traceProtocol(): array
{
    $protocol = choice('protocol', ['icmp', 'tcp']);
    if ($protocol === 'icmp') {
        return [[], 'ICMP'];
    }
    $port = filter_var(param('port', 5) ?: '443', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
    if ($port === false) {
        fail('Enter a port from 1 to 65535.');
    }
    return [['--tcp', '-P', (string) $port], "TCP port {$port}"];
}

function runMtr(string $ip, int $cycles, array $extra, int $seconds): array
{
    [, $out, $err] = run(array_merge(['mtr', '--json', '-c', (string) $cycles, '-b', '-z', '-m', '30', isIpv4($ip) ? '-4' : '-6'], $extra, [$ip]), $seconds);
    $data = json_decode($out, true);
    if (!is_array($data)) {
        fail('The trace did not finish' . ($err !== '' ? ": {$err}" : '') . '. Try again.', 502);
    }
    return mtrHops($data);
}

function toolTraceroute(): array
{
    heavy();
    [$host, $ips, $ip] = publicTarget(param('host'));
    [$extra, $label] = traceProtocol();
    $hops = runMtr($ip, 2, $extra, 40);
    $last = end($hops) ?: null;
    return [
        'host' => $host,
        'ip' => $ip,
        'addresses' => $ips,
        'hops' => $hops,
        'reached' => $last !== null && $last['address'] !== null && sameIp($last['address'], $ip),
        'asNames' => (object) asNames(array_column($hops, 'asn')),
        'settings' => "{$label}, 2 probes per hop, up to 30 hops",
    ];
}

function toolMtr(): array
{
    heavy();
    [$host, $ips, $ip] = publicTarget(param('host'));
    [$extra, $label] = traceProtocol();
    $hops = runMtr($ip, 5, $extra, 45);
    return ['target' => $host, 'resolved' => $ip, 'addresses' => $ips, 'settings' => "{$label}, 5 probes per hop, up to 30 hops", 'runs' => [['place' => null, 'hops' => $hops]],
        'asNames' => (object) asNames(array_column($hops, 'asn'))];
}

function toolPort(): array
{
    heavy();
    [$host, $ips, $ip] = publicTarget(param('host'));
    $port = filter_var(param('port', 5), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
    if ($port === false) {
        fail('Enter a port from 1 to 65535.');
    }
    $r = tcpConnectMany($ip, [$port], 4)[$port];
    return ['host' => $host, 'ip' => $ip, 'addresses' => $ips, 'settings' => 'TCP connect, 4 s timeout'] + $r;
}

// The common ports, checked together. Only this fixed list can be checked in one go (keep it in step with
// COMMON_PORTS in src/tools/ports.tsx), so the tool cannot be turned into a scanner of arbitrary ranges.
const COMMON_PORTS = [80, 443, 8080, 8443, 25, 465, 587, 110, 995, 143, 993, 22, 23, 3389, 5900, 8291, 8728, 8729,
    21, 53, 445, 3306, 5432, 6379, 27017, 1723, 1194];

function toolPorts(): array
{
    rateLimit('scan', 3);
    heavySlot();
    [$host, $ips, $ip] = publicTarget(param('host'));
    $results = tcpConnectMany($ip, COMMON_PORTS, 4);
    return ['host' => $host, 'ip' => $ip, 'addresses' => $ips, 'settings' => 'TCP connect to ' . count(COMMON_PORTS) . ' ports at once, 4 s timeout', 'results' => array_map(fn ($p) => $results[$p], COMMON_PORTS)];
}

function toolReverse(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $ip = normalizeHost(param('ip', 64));
    if (!isIp($ip)) {
        fail('Enter a valid IPv4 or IPv6 address, like 8.8.8.8.');
    }
    if (!isPublicIp($ip)) {
        fail('Only public addresses can be looked up.');
    }
    $r = dig($ip, 'PTR');
    $names = array_column(answersOf($r, 'PTR'), 'value');
    $checks = [];
    if ($names) {
        // Forward-confirm each name: does it resolve back to the same address?
        $queries = [];
        foreach (array_slice($names, 0, 8) as $name) {
            $queries[] = [$name, isIpv4($ip) ? 'A' : 'AAAA'];
        }
        foreach (digQueries($queries) as $i => $f) {
            $type = $queries[$i][1];
            $back = array_column(answersOf($f, $type), 'value');
            $checks[] = [
                'name' => $names[$i],
                'outcome' => outcome($f, $type),
                'addresses' => $back,
                'matches' => (bool) array_filter($back, fn ($b) => sameIp($b, $ip)),
            ];
        }
    }
    return ['ip' => $ip, 'arpa' => arpaName($ip), 'lookup' => lookupResult($r, 'PTR'), 'names' => $names, 'forward' => $checks];
}

function toolProxy(): array
{
    // nginx only accepts CF-Connecting-IP from the tunnel, and then REMOTE_ADDR equals it. Only in that case did
    // Cloudflare add X-Forwarded-For (ending with the visitor's own address) and X-Forwarded-Proto itself;
    // what is left (addresses before Cloudflare, Via, ...) points to a proxy on the visitor's side.
    $viaCloudflare = !empty($_SERVER['HTTP_CF_CONNECTING_IP']) && sameIp((string) $_SERVER['HTTP_CF_CONNECTING_IP'], clientIp());
    if ($viaCloudflare) {
        unset($_SERVER['HTTP_X_FORWARDED_PROTO']);
        $chain = array_values(array_filter(array_map('trim', explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')))));
        if ($chain && sameIp((string) end($chain), (string) $_SERVER['HTTP_CF_CONNECTING_IP'])) {
            array_pop($chain);
        }
        if ($chain) {
            $_SERVER['HTTP_X_FORWARDED_FOR'] = implode(', ', $chain);
        } else {
            unset($_SERVER['HTTP_X_FORWARDED_FOR']);
        }
    }
    $headers = [];
    foreach (['HTTP_VIA' => 'Via', 'HTTP_X_FORWARDED_FOR' => 'X-Forwarded-For', 'HTTP_FORWARDED' => 'Forwarded',
        'HTTP_X_FORWARDED_HOST' => 'X-Forwarded-Host', 'HTTP_X_FORWARDED_PROTO' => 'X-Forwarded-Proto',
        'HTTP_CLIENT_IP' => 'Client-IP', 'HTTP_X_PROXY_ID' => 'X-Proxy-ID', 'HTTP_PROXY_CONNECTION' => 'Proxy-Connection',
        'HTTP_X_BLUECOAT_VIA' => 'X-BlueCoat-Via', 'HTTP_X_ORIGINATING_IP' => 'X-Originating-IP', 'HTTP_X_REAL_IP' => 'X-Real-IP'] as $key => $label) {
        if (!empty($_SERVER[$key])) {
            $headers[$label] = substr((string) $_SERVER[$key], 0, 300);
        }
    }
    $me = toolMyIp();
    $name = strtolower((string) $me['hostname']);
    $hint = $name !== '' && preg_match('/(proxy|vpn|tor-exit|exit-?node|anonym)/', $name);
    return ['ip' => $me['ip'], 'hostname' => $me['hostname'], 'viaCloudflare' => $viaCloudflare, 'headers' => (object) $headers,
        'detected' => $headers !== [] || $hint, 'hostnameHint' => (bool) $hint];
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

const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA', 'SRV', 'PTR', 'DS', 'DNSKEY'];
const DNS_EVERY_TYPE = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA'];

/** The name servers of the zone that holds $name (walking up while a name has none), with one public IPv4 each. */
function zoneServers(string $name): array
{
    $labels = explode('.', $name);
    while (count($labels) >= 1) {
        $zone = implode('.', $labels);
        $r = dig($zone, 'NS');
        $ns = array_column(answersOf($r, 'NS'), 'value');
        if ($ns) {
            sort($ns);
            $servers = [];
            foreach (digQueries(array_map(fn ($n) => [$n, 'A'], array_slice($ns, 0, 8))) as $i => $a) {
                $ip = array_values(array_filter(array_column(answersOf($a, 'A'), 'value'), 'isPublicIp'))[0] ?? null;
                $servers[] = ['name' => $ns[$i], 'ip' => $ip];
            }
            return [$zone, $servers];
        }
        if (!in_array(outcome($r, 'NS'), ['nodata', 'nxdomain'], true)) {
            break;
        }
        array_shift($labels);
    }
    return [null, []];
}

function toolDns(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $raw = normalizeHost(param('name'));
    $type = strtoupper(param('type', 8) ?: 'A');
    if ($type === 'PTR' && isIp($raw)) {
        $name = $raw;
    } else {
        $name = $raw;
        if (!isDomain($name)) {
            fail('Enter a valid domain or hostname, like example.com.');
        }
    }
    if ($type !== 'ALL' && !in_array($type, DNS_TYPES, true)) {
        fail('Unsupported record type.');
    }
    $resolver = choice('resolver', ['system', 'cloudflare', 'google', 'quad9', 'authoritative']);
    $server = ['system' => null, 'cloudflare' => '1.1.1.1', 'google' => '8.8.8.8', 'quad9' => '9.9.9.9'][$resolver] ?? null;
    $zone = null;
    $norec = false;
    if ($resolver === 'authoritative') {
        [$zone, $servers] = zoneServers(isIp($name) ? arpaName($name) : $name);
        $pick = array_values(array_filter($servers, fn ($s) => $s['ip'] !== null))[0] ?? null;
        if (!$pick) {
            fail("We could not find a reachable name server for {$name}.", 422);
        }
        $server = $pick['ip'];
        $norec = true;
        $zone = ['zone' => $zone, 'server' => $pick['name'], 'ip' => $pick['ip']];
    }
    $types = $type === 'ALL' ? DNS_EVERY_TYPE : [$type];
    $lookups = [];
    foreach (digQueries(array_map(fn ($t) => [$name, $t, 'server' => $server, 'norec' => $norec], $types)) as $i => $r) {
        $lookups[] = lookupResult($r, $types[$i]);
    }
    return ['name' => $name, 'type' => $type, 'resolver' => $resolver, 'authority' => $zone, 'lookups' => $lookups];
}

/** "10 mx.example.com" as priority and host; a null MX ("0 .") has an empty host. */
function mxParts(string $value): array
{
    [$pri, $host] = preg_split('/\s+/', trim($value), 2) + [0, ''];
    return [(int) $pri, $host === '.' ? '' : strtolower(rtrim($host, '.'))];
}

function toolMx(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    $r = dig($domain, 'MX');
    $mx = array_map(fn ($a) => mxParts($a['value']) + [2 => $a['ttl']], answersOf($r, 'MX'));
    usort($mx, fn ($a, $b) => $a[0] <=> $b[0] ?: strcmp($a[1], $b[1]));
    $nullMx = count($mx) === 1 && $mx[0][1] === '';
    $records = [];
    $hosts = array_values(array_filter(array_map(fn ($m) => $m[1], $mx)));
    $queries = [];
    foreach (array_slice($hosts, 0, 10) as $h) {
        $queries[] = [$h, 'A'];
        $queries[] = [$h, 'AAAA'];
    }
    $resolved = digQueries($queries);
    foreach ($mx as [$pri, $host, $ttl]) {
        $i = array_search($host, $hosts, true);
        $a = $i !== false && isset($resolved[2 * $i]) ? $resolved[2 * $i] : null;
        $aaaa = $i !== false && isset($resolved[2 * $i + 1]) ? $resolved[2 * $i + 1] : null;
        $ips = $a ? array_merge(array_column(answersOf($a, 'A'), 'value'), array_column(answersOf($aaaa, 'AAAA'), 'value')) : [];
        $records[] = [
            'priority' => $pri,
            'host' => $host,
            'ttl' => $ttl,
            'ips' => $ips,
            'outcome' => $a ? (outcome($a, 'A') === 'found' || outcome($aaaa, 'AAAA') === 'found' ? 'found' : outcome($a, 'A')) : 'unchecked',
            'cname' => $a ? (answersOf($a, 'CNAME')[0]['value'] ?? null) : null,
            'isIp' => $host !== '' && isIp($host),
            'private' => (bool) array_filter($ips, fn ($ip) => !isPublicIp($ip)),
        ];
    }
    return ['domain' => $domain, 'lookup' => lookupResult($r, 'MX'), 'nullMx' => $nullMx, 'records' => $records];
}

/** "hostmaster.example.com" (the SOA RNAME) as the address it stands for: hostmaster@example.com. */
function soaEmail(string $rname): string
{
    $rname = rtrim($rname, '.');
    if (preg_match('/^((?:[^.\\\\]|\\\\.)+)\.(.+)$/', $rname, $m)) {
        return str_replace('\\.', '.', $m[1]) . '@' . $m[2];
    }
    return $rname;
}

function soaFields(string $value): ?array
{
    $p = preg_split('/\s+/', trim($value));
    if (count($p) < 7) {
        return null;
    }
    return ['primary' => rtrim($p[0], '.'), 'contact' => soaEmail($p[1]), 'serial' => (int) $p[2], 'refresh' => (int) $p[3], 'retry' => (int) $p[4], 'expire' => (int) $p[5], 'minimum' => (int) $p[6]];
}

function toolNs(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    [$nsR, $soaR] = digQueries([[$domain, 'NS'], [$domain, 'SOA']]);
    $names = array_column(answersOf($nsR, 'NS'), 'value');
    sort($names);
    $soaAnswer = answersOf($soaR, 'SOA')[0] ?? null;
    $soa = $soaAnswer ? soaFields($soaAnswer['value']) : null;
    $ttls = array_column(answersOf($nsR, 'NS'), 'ttl', 'value');

    // Each name server's addresses, then its own answer for the SOA (asked without recursion): does it answer
    // authoritatively, and with which serial? Only public addresses are queried.
    $names = array_slice($names, 0, 8);
    $queries = [];
    foreach ($names as $n) {
        $queries[] = [$n, 'A'];
        $queries[] = [$n, 'AAAA'];
    }
    $addr = digQueries($queries);
    $records = [];
    $soaQueries = [];
    foreach ($names as $i => $n) {
        $v4 = array_column(answersOf($addr[2 * $i], 'A'), 'value');
        $v6 = array_column(answersOf($addr[2 * $i + 1], 'AAAA'), 'value');
        $records[$i] = ['host' => $n, 'ttl' => $ttls[$n] ?? null, 'ips' => array_merge($v4, $v6), 'check' => null];
        $target = array_values(array_filter($v4, 'isPublicIp'))[0] ?? null;
        if ($target) {
            $soaQueries[$i] = [$domain, 'SOA', 'server' => $target, 'norec' => true];
        } else {
            $records[$i]['check'] = ['state' => 'skipped', 'note' => $v4 ? 'Its address is not public, so we did not query it.' : 'No IPv4 address to query.'];
        }
    }
    if ($soaQueries) {
        $answers = digQueries(array_values($soaQueries));
        foreach (array_keys($soaQueries) as $k => $i) {
            $a = $answers[$k];
            $s = answersOf($a, 'SOA')[0] ?? null;
            $fields = $s ? soaFields($s['value']) : null;
            $records[$i]['check'] = [
                'state' => $a['status'] === 'TIMEOUT' ? 'timeout' : ($a['status'] !== 'NOERROR' ? 'error' : (in_array('aa', $a['flags'], true) && $fields ? 'authoritative' : 'not_authoritative')),
                'status' => $a['status'],
                'server' => $a['server'],
                'serial' => $fields['serial'] ?? null,
                'ms' => $a['ms'],
            ];
        }
    }
    return [
        'domain' => $domain,
        'lookup' => lookupResult($nsR, 'NS'),
        'soaLookup' => lookupResult($soaR, 'SOA'),
        'records' => array_values($records),
        'soa' => $soa,
        'soaTtl' => $soaAnswer['ttl'] ?? null,
    ];
}

// SPF (RFC 7208): the published record, its syntax, and how many DNS lookups a receiver needs to evaluate it.
// No sending IP is evaluated, so this cannot say whether a particular message passes.

/** The SPF records among a name's TXT answers ("v=spf1" followed by a space or nothing). */
function spfRecords(array $txt): array
{
    return array_values(array_filter($txt, fn ($t) => (bool) preg_match('/^v=spf1(\s|$)/i', $t)));
}

/** Splits a record into terms and checks each one. */
function parseSpf(string $record): array
{
    $terms = [];
    $all = null;
    $redirect = null;
    $seen = [];
    foreach (array_slice(preg_split('/\s+/', trim($record)), 1) as $text) {
        $problem = null;
        $lookup = false;
        if (preg_match('/^([a-z][a-z0-9_.-]*)=(.*)$/i', $text, $m)) {
            $name = strtolower($m[1]);
            $value = $m[2];
            $qualifier = '';
            if (in_array($name, ['redirect', 'exp'], true)) {
                if (isset($seen[$name])) {
                    $problem = "“{$name}=” appears more than once, which is a permanent error.";
                }
                $seen[$name] = true;
                if ($value === '') {
                    $problem = "“{$name}=” needs a domain.";
                }
                if ($name === 'redirect') {
                    $redirect = $value;
                    $lookup = true;
                }
            }
        } elseif (preg_match('/^([+~?-]?)([a-z0-9]+)(?:[:\/](.*))?$/i', $text, $m)) {
            $qualifier = $m[1] === '' ? '+' : $m[1];
            $name = strtolower($m[2]);
            $value = $m[3] ?? null;
            switch ($name) {
                case 'all':
                    if ($value !== null) {
                        $problem = '“all” takes no value.';
                    }
                    break;
                case 'include':
                case 'exists':
                    $lookup = true;
                    if (!str_contains($text, ':') || $value === '') {
                        $problem = "“{$name}” needs a domain, like {$name}:_spf.example.com.";
                    }
                    break;
                case 'a':
                case 'mx':
                case 'ptr':
                    $lookup = true;
                    if ($name === 'ptr') {
                        $problem = '“ptr” is slow and unreliable; RFC 7208 says not to use it, and some receivers ignore it.';
                    }
                    break;
                case 'ip4':
                    $net = explode('/', (string) $value);
                    if (!isIpv4($net[0]) || (isset($net[1]) && (!ctype_digit($net[1]) || (int) $net[1] > 32))) {
                        $problem = "“{$text}” is not a valid IPv4 address or network.";
                    }
                    break;
                case 'ip6':
                    $net = explode('/', (string) $value, 2);
                    if (!filter_var($net[0], FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) || (isset($net[1]) && (!ctype_digit($net[1]) || (int) $net[1] > 128))) {
                        $problem = "“{$text}” is not a valid IPv6 address or network.";
                    }
                    break;
                default:
                    $problem = "“{$name}” is not an SPF mechanism. Receivers treat the record as broken (permerror).";
            }
            if ($all !== null && $problem === null) {
                $problem = 'Comes after “all”, so receivers never reach it.';
            }
            if ($name === 'all') {
                $all ??= $qualifier;
            }
        } else {
            $qualifier = '';
            $name = $text;
            $value = null;
            $problem = "“{$text}” cannot be read as an SPF term.";
        }
        $terms[] = ['text' => $text, 'qualifier' => $qualifier, 'name' => $name, 'value' => $value, 'lookup' => $lookup, 'problem' => $problem];
    }
    return ['terms' => $terms, 'all' => $all, 'redirect' => $redirect];
}

/**
 * Follows include: and redirect= the way a receiver would, counting DNS lookups (limit 10) and includes that find
 * no record (void lookups, limit 2). Stops once the limits are clearly passed.
 */
function spfTree(string $domain, int $depth, array &$budget, ?array $first = null): array
{
    $r = $first ?? dig($domain, 'TXT');
    $budget['fetches']++;
    $node = ['domain' => $domain, 'record' => null, 'lookups' => 0, 'children' => [], 'problem' => null];
    $out = outcome($r, 'TXT');
    if (!in_array($out, ['found', 'nodata', 'nxdomain'], true)) {
        $node['problem'] = "The lookup failed ({$r['status']}), so this part could not be checked.";
        $budget['incomplete'] = true;
        return $node;
    }
    $records = spfRecords(array_column(answersOf($r, 'TXT'), 'value'));
    if (count($records) !== 1) {
        $node['problem'] = $records ? 'More than one SPF record (permerror).' : ($out === 'nxdomain' ? 'The domain does not exist (void lookup).' : 'No SPF record (permerror when included).');
        if (!$records && $depth > 0) {
            $budget['void']++;
        }
        if ($depth > 0) {
            $budget['errors'] = true;
        }
        return $node;
    }
    $node['record'] = $records[0];
    $parsed = parseSpf($records[0]);
    foreach ($parsed['terms'] as $t) {
        if (!$t['lookup']) {
            continue;
        }
        $node['lookups']++;
        $budget['lookups']++;
        $target = $t['value'];
        $follow = in_array($t['name'], ['include', 'redirect'], true) && $target && !str_contains($target, '%')
            && !($t['name'] === 'redirect' && $parsed['all'] !== null);
        if ($follow && $depth < 10 && $budget['fetches'] < 25 && $budget['lookups'] <= 12) {
            $node['children'][] = ['via' => $t['name'], 'node' => spfTree(strtolower(rtrim($target, '.')), $depth + 1, $budget)];
        } elseif ($follow || (in_array($t['name'], ['include', 'redirect'], true) && $target && str_contains($target, '%'))) {
            $budget['incomplete'] = true;
        }
    }
    return $node;
}

function toolSpf(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    $r = dig($domain, 'TXT');
    $out = outcome($r, 'TXT');
    $res = ['domain' => $domain, 'lookup' => lookupResult($r, 'TXT'), 'records' => [], 'record' => null, 'terms' => [], 'tree' => null, 'lookups' => null, 'checks' => []];
    if (!in_array($out, ['found', 'nodata', 'nxdomain'], true)) {
        $res['checks'][] = ['area' => 'presence', 'level' => 'failed', 'text' => "The TXT lookup failed ({$r['status']}), so we cannot tell whether {$domain} publishes SPF."];
        return $res;
    }
    if ($out === 'nxdomain') {
        $res['checks'][] = ['area' => 'presence', 'level' => 'issue', 'text' => "{$domain} does not exist in DNS (NXDOMAIN)."];
        return $res;
    }
    $records = spfRecords(array_column(answersOf($r, 'TXT'), 'value'));
    $res['records'] = $records;
    if (!$records) {
        $res['checks'][] = ['area' => 'presence', 'level' => 'issue', 'text' => 'No SPF record is published, so receivers cannot tell which servers may send mail for this domain.'];
        return $res;
    }
    $res['checks'][] = count($records) > 1
        ? ['area' => 'presence', 'level' => 'issue', 'text' => count($records) . ' SPF records are published. Receivers treat this as a permanent error (permerror); merge them into one.']
        : ['area' => 'presence', 'level' => 'pass', 'text' => 'Exactly one SPF record is published.'];
    $res['record'] = $records[0];
    $parsed = parseSpf($records[0]);
    $res['terms'] = $parsed['terms'];
    $problems = count(array_filter($parsed['terms'], fn ($t) => $t['problem'] !== null));
    $res['checks'][] = $problems
        ? ['area' => 'syntax', 'level' => 'issue', 'text' => $problems . ' term' . ($problems === 1 ? ' needs' : 's need') . ' attention (marked in the table).']
        : ['area' => 'syntax', 'level' => 'pass', 'text' => 'Every term is valid SPF syntax.'];
    $all = $parsed['all'];
    $res['checks'][] = match (true) {
        $all === null && $parsed['redirect'] === null => ['area' => 'policy', 'level' => 'issue', 'text' => 'No “all” at the end and no redirect, so mail from servers that are not listed gets a neutral result.'],
        $all === null => ['area' => 'policy', 'level' => 'info', 'text' => 'The policy for unlisted servers comes from the redirect target (see the include tree).'],
        $all === '+' => ['area' => 'policy', 'level' => 'issue', 'text' => '“+all” authorises every server on the internet to send as this domain.'],
        $all === '?' => ['area' => 'policy', 'level' => 'issue', 'text' => '“?all” (neutral) gives receivers no guidance about servers that are not listed.'],
        $all === '~' => ['area' => 'policy', 'level' => 'info', 'text' => '“~all” (soft fail): mail from servers that are not listed should be treated as suspicious but not rejected outright.'],
        default => ['area' => 'policy', 'level' => 'info', 'text' => '“-all” (fail): mail from servers that are not listed should be rejected.'],
    };

    $budget = ['lookups' => 0, 'void' => 0, 'fetches' => 0, 'incomplete' => false, 'errors' => false];
    $res['tree'] = spfTree($domain, 0, $budget, $r);
    $n = $budget['lookups'];
    $res['lookups'] = $n;
    $res['checks'][] = match (true) {
        $n > 10 => ['area' => 'evaluation', 'level' => 'issue', 'text' => "Evaluating the record needs at least {$n} DNS lookups, counting includes. SPF allows 10; above that receivers return permerror."],
        $budget['incomplete'] => ['area' => 'evaluation', 'level' => 'inconclusive', 'text' => "Counted {$n} DNS lookups, but part of the include chain could not be followed, so the real number may be higher."],
        default => ['area' => 'evaluation', 'level' => 'pass', 'text' => "Evaluating the record needs {$n} DNS lookup" . ($n === 1 ? '' : 's') . ', counting includes (limit 10).'],
    };
    if ($budget['errors']) {
        $res['checks'][] = ['area' => 'evaluation', 'level' => 'issue', 'text' => 'An include or redirect points to a domain without exactly one SPF record (see the include tree).'];
    }
    if ($budget['void'] > 2) {
        $res['checks'][] = ['area' => 'evaluation', 'level' => 'issue', 'text' => "{$budget['void']} includes find no record. More than 2 such void lookups is a permanent error."];
    }
    return $res;
}

/** Checks a DMARC record's tags against RFC 7489. @return string[] problems */
function dmarcProblems(string $record, array $tags): array
{
    $problems = [];
    if (!preg_match('/^v=DMARC1\s*(;|$)/i', $record)) {
        $problems[] = '“v=DMARC1” must come first.';
    }
    $policies = ['none', 'quarantine', 'reject'];
    if (!isset($tags['p'])) {
        $problems[] = 'The required “p” tag (policy) is missing, so receivers ignore the record.';
    } elseif (!in_array(strtolower($tags['p']), $policies, true)) {
        $problems[] = "“p={$tags['p']}” is not a valid policy (none, quarantine or reject).";
    }
    if (isset($tags['sp']) && !in_array(strtolower($tags['sp']), $policies, true)) {
        $problems[] = "“sp={$tags['sp']}” is not a valid subdomain policy.";
    }
    if (isset($tags['pct']) && (!ctype_digit($tags['pct']) || (int) $tags['pct'] > 100)) {
        $problems[] = '“pct” must be a number from 0 to 100.';
    }
    foreach (['adkim', 'aspf'] as $k) {
        if (isset($tags[$k]) && !in_array(strtolower($tags[$k]), ['r', 's'], true)) {
            $problems[] = "“{$k}” must be r (relaxed) or s (strict).";
        }
    }
    foreach (['rua', 'ruf'] as $k) {
        foreach (isset($tags[$k]) ? array_map('trim', explode(',', $tags[$k])) : [] as $uri) {
            if (!preg_match('/^mailto:[^@\s]+@[^@\s]+$/i', preg_replace('/!\d+[kmgt]?$/i', '', $uri))) {
                $problems[] = "“{$uri}” in {$k} is not a mailto: address.";
            }
        }
    }
    return $problems;
}

function toolDmarc(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    $r = dig("_dmarc.{$domain}", 'TXT');
    $out = outcome($r, 'TXT');
    $res = ['domain' => $domain, 'name' => "_dmarc.{$domain}", 'lookup' => lookupResult($r, 'TXT'), 'record' => null, 'tags' => (object) [], 'checks' => [], 'parent' => null];
    if (!in_array($out, ['found', 'nodata', 'nxdomain'], true)) {
        $res['checks'][] = ['area' => 'presence', 'level' => 'failed', 'text' => "The lookup of _dmarc.{$domain} failed ({$r['status']}), so we cannot tell whether a DMARC record is published."];
        return $res;
    }
    $records = array_values(array_filter(array_column(answersOf($r, 'TXT'), 'value'), fn ($t) => (bool) preg_match('/^v\s*=\s*DMARC1/i', $t)));
    if (!$records) {
        // Receivers fall back to the organizational domain's record (example.com for mail.example.com).
        $labels = explode('.', $domain);
        while (count($labels) > 2) {
            array_shift($labels);
            $parent = implode('.', $labels);
            $pr = dig("_dmarc.{$parent}", 'TXT');
            $prec = array_values(array_filter(array_column(answersOf($pr, 'TXT'), 'value'), fn ($t) => (bool) preg_match('/^v\s*=\s*DMARC1/i', $t)));
            if ($prec) {
                $ptags = tagList($prec[0]);
                $res['parent'] = ['domain' => $parent, 'record' => $prec[0], 'policy' => $ptags['sp'] ?? $ptags['p'] ?? null];
                break;
            }
        }
        $res['checks'][] = $res['parent']
            ? ['area' => 'presence', 'level' => 'info', 'text' => "No record at _dmarc.{$domain}, but {$res['parent']['domain']} publishes one. If that is the organizational domain, its policy" . ($res['parent']['policy'] ? " (“{$res['parent']['policy']}”)" : '') . ' applies to this subdomain.']
            : ['area' => 'presence', 'level' => 'issue', 'text' => "No DMARC record at _dmarc.{$domain}. Receivers have no published policy for mail that fails SPF and DKIM alignment."];
        return $res;
    }
    $res['record'] = $records[0];
    $tags = tagList($records[0]);
    $res['tags'] = (object) $tags;
    $res['checks'][] = count($records) > 1
        ? ['area' => 'presence', 'level' => 'issue', 'text' => 'More than one DMARC record is published; receivers ignore all of them.']
        : ['area' => 'presence', 'level' => 'pass', 'text' => 'Exactly one DMARC record is published.'];
    $problems = dmarcProblems($records[0], $tags);
    foreach ($problems as $p) {
        $res['checks'][] = ['area' => 'syntax', 'level' => 'issue', 'text' => $p];
    }
    if (!$problems) {
        $res['checks'][] = ['area' => 'syntax', 'level' => 'pass', 'text' => 'The record’s tags are valid.'];
    }
    $p = strtolower($tags['p'] ?? '');
    if (in_array($p, ['none', 'quarantine', 'reject'], true)) {
        $res['checks'][] = match ($p) {
            'reject' => ['area' => 'policy', 'level' => 'info', 'text' => 'Policy “reject”: receivers are asked to refuse mail that fails DMARC.'],
            'quarantine' => ['area' => 'policy', 'level' => 'info', 'text' => 'Policy “quarantine”: receivers are asked to treat mail that fails DMARC as suspicious (usually the spam folder).'],
            default => ['area' => 'policy', 'level' => 'info', 'text' => 'Policy “none”: monitoring only. Receivers send reports but are not asked to act on failures.'],
        };
    }
    if (isset($tags['pct']) && (int) $tags['pct'] < 100 && $p !== 'none') {
        $res['checks'][] = ['area' => 'policy', 'level' => 'info', 'text' => "pct={$tags['pct']}: the policy is applied to {$tags['pct']}% of failing mail."];
    }
    if (empty($tags['rua'])) {
        $res['checks'][] = ['area' => 'policy', 'level' => 'info', 'text' => 'No “rua” address, so the domain owner receives no aggregate reports.'];
    }
    return $res;
}

// Selectors that mail providers and common setups use, tried when no selector is given. Keep the list short enough
// to look up in one parallel batch.
const DKIM_SELECTORS = ['google', 'selector1', 'selector2', 'default', 'dkim', 'mail', 'k1', 'k2', 'k3', 's1', 's2', 's1024', 's2048',
    'key1', 'key2', 'sig1', 'smtp', 'mx', 'email', 'dk', 'fm1', 'fm2', 'fm3', 'protonmail', 'protonmail2', 'protonmail3', 'zoho', 'zmail',
    'mandrill', 'mailjet', 'mxvault', 'everlytickey1', 'everlytickey2', 'hs1', 'hs2', 'cm', 'mailo', 'scph1', 'turbo-smtp', 'pic', 'x',
    '20230601', '20221208', '20210112', '20161025'];

function toolDkim(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    $selector = strtolower(param('selector', 63));
    $discovered = null;
    if ($selector === '') {
        // No selector: look up the common ones at once and check the first that holds a key.
        // A made-up selector goes along: if it has a key too, the domain answers every selector (a wildcard).
        $probe = 'pingomni-' . bin2hex(random_bytes(4));
        $answers = digQueries(array_map(fn ($sel) => ["{$sel}._domainkey.{$domain}", 'TXT'], [...DKIM_SELECTORS, $probe]));
        if (array_filter(array_column(answersOf(array_pop($answers), 'TXT'), 'value'), fn ($t) => (bool) preg_match('/(^|;)\s*(v\s*=\s*DKIM1|p\s*=)/i', $t))) {
            $selector = $probe;
            $discovered = ['wildcard' => true];
        }
        $discovered ??= [];
        foreach (isset($discovered['wildcard']) ? [] : DKIM_SELECTORS as $i => $sel) {
            $txt = array_column(answersOf($answers[$i], 'TXT'), 'value');
            $key = array_values(array_filter($txt, fn ($t) => (bool) preg_match('/(^|;)\s*(v\s*=\s*DKIM1|p\s*=)/i', $t)))[0] ?? null;
            if ($key !== null) {
                $discovered[] = ['selector' => $sel, 'keyType' => strtolower(tagList($key)['k'] ?? 'rsa'), 'revoked' => (bool) preg_match('/(^|;)\s*p\s*=\s*(;|$)/i', $key)];
            }
        }
        if (!$discovered) {
            $tried = count(DKIM_SELECTORS);
            return ['domain' => $domain, 'selector' => null, 'name' => null, 'lookup' => null, 'record' => null, 'cname' => null, 'tags' => (object) [],
                'keyType' => null, 'bits' => null, 'discovered' => [], 'tried' => DKIM_SELECTORS, 'checks' => [['area' => 'presence', 'level' => 'inconclusive',
                    'text' => "None of {$tried} common selectors has a DKIM key at {$domain}. That does not mean DKIM is missing: selectors can be any name. Find the s= value in the DKIM-Signature header of a message from this domain and enter it."]]];
        }
        if (!isset($discovered['wildcard'])) {
            $usable = array_values(array_filter($discovered, fn ($d) => !$d['revoked']));
            $selector = ($usable[0] ?? $discovered[0])['selector'];
        }
    }
    if (!preg_match('/^[a-z0-9_]([a-z0-9._-]{0,61}[a-z0-9])?$/', $selector)) {
        fail('Enter a valid selector, like "google" or "selector1".');
    }
    $name = "{$selector}._domainkey.{$domain}";
    $r = dig($name, 'TXT');
    $out = outcome($r, 'TXT');
    $res = ['domain' => $domain, 'selector' => $selector, 'discovered' => $discovered, 'tried' => $discovered === null ? null : DKIM_SELECTORS, 'name' => $name, 'lookup' => lookupResult($r, 'TXT'), 'record' => null,
        'cname' => answersOf($r, 'CNAME')[0]['value'] ?? null, 'tags' => (object) [], 'keyType' => null, 'bits' => null, 'checks' => []];
    if (!in_array($out, ['found', 'nodata', 'nxdomain'], true)) {
        $res['checks'][] = ['area' => 'presence', 'level' => 'failed', 'text' => "The lookup of {$name} failed ({$r['status']}), so we cannot tell whether the key is published."];
        return $res;
    }
    $txt = array_column(answersOf($r, 'TXT'), 'value');
    $records = array_values(array_filter($txt, fn ($t) => (bool) preg_match('/(^|;)\s*(v\s*=\s*DKIM1|p\s*=)/i', $t)));
    if (!$records) {
        $res['checks'][] = ['area' => 'presence', 'level' => 'issue', 'text' => $txt
            ? "{$name} has TXT data, but none of it is a DKIM key."
            : "No DKIM key is published for selector “{$selector}”. Check the selector: it is the s= value in a message’s DKIM-Signature header."];
        return $res;
    }
    $record = $records[0];
    $tags = tagList($record);
    $res['record'] = $record;
    $res['tags'] = (object) $tags;
    $res['checks'][] = count($records) > 1
        ? ['area' => 'presence', 'level' => 'issue', 'text' => 'More than one DKIM record is published for this selector; receivers may use either.']
        : ['area' => 'presence', 'level' => 'pass', 'text' => 'A DKIM record is published for this selector.'];
    $problems = [];
    if (isset($tags['v']) && !preg_match('/^\s*v\s*=/i', $record)) {
        $problems[] = '“v=DKIM1” must come first when present.';
    }
    if (isset($tags['v']) && $tags['v'] !== 'DKIM1') {
        $problems[] = "“v={$tags['v']}” is not DKIM1.";
    }
    $type = strtolower($tags['k'] ?? 'rsa');
    $res['keyType'] = $type;
    if (!array_key_exists('p', $tags)) {
        $problems[] = 'The required “p” tag (the public key) is missing.';
    } elseif ($tags['p'] === '') {
        $res['checks'][] = ['area' => 'key', 'level' => 'info', 'text' => 'The key is empty (p=), which means it has been revoked. Mail signed with this selector fails DKIM.'];
    } else {
        $der = base64_decode(preg_replace('/\s+/', '', $tags['p']), true);
        if ($der === false) {
            $problems[] = 'The key in “p” is not valid base64.';
        } elseif ($type === 'ed25519') {
            $res['bits'] = strlen($der) === 32 ? 256 : null;
            if (strlen($der) !== 32) {
                $problems[] = 'An Ed25519 key must be 32 bytes.';
            }
        } elseif ($type === 'rsa') {
            $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64) . "-----END PUBLIC KEY-----\n";
            $key = @openssl_pkey_get_public($pem);
            $res['bits'] = $key ? (openssl_pkey_get_details($key)['bits'] ?? null) : null;
            if (!$key) {
                $problems[] = 'The key in “p” could not be read as an RSA public key.';
            }
        } else {
            $problems[] = "“k={$type}” is not a key type receivers support (rsa or ed25519).";
        }
    }
    foreach ($problems as $p) {
        $res['checks'][] = ['area' => 'syntax', 'level' => 'issue', 'text' => $p];
    }
    if (!$problems) {
        $res['checks'][] = ['area' => 'syntax', 'level' => 'pass', 'text' => ($tags['p'] ?? '') === '' ? 'The record’s tags are valid.' : 'The record’s tags are valid and the key can be read.'];
    }
    if ($res['bits'] !== null && $type === 'rsa') {
        $res['checks'][] = $res['bits'] < 1024
            ? ['area' => 'key', 'level' => 'issue', 'text' => "{$res['bits']}-bit RSA key. RFC 8301 says receivers must not accept keys under 1024 bits."]
            : ($res['bits'] < 2048
                ? ['area' => 'key', 'level' => 'info', 'text' => "{$res['bits']}-bit RSA key. Accepted, but 2048 bits is the current recommendation."]
                : ['area' => 'key', 'level' => 'pass', 'text' => "{$res['bits']}-bit RSA key."]);
    }
    if (str_contains(strtolower($tags['t'] ?? ''), 'y')) {
        $res['checks'][] = ['area' => 'key', 'level' => 'info', 'text' => 't=y: the domain says it is testing DKIM, and receivers may treat failures more leniently.'];
    }
    if (isset($discovered['wildcard'])) {
        $res['discovered'] = [];
        $res['wildcard'] = true;
        array_unshift($res['checks'], ['area' => 'presence', 'level' => 'info', 'text' => "{$domain} publishes the same DKIM record for every selector (a wildcard), so the real selectors cannot be found this way. The record below is that wildcard" . (($res['tags']->p ?? $res['tags']['p'] ?? null) === '' ? '; its key is empty, which is how a domain says it signs no mail.' : '.')]);
    }
    return $res;
}

/** Reads an SMTP reply (all lines of a multi-line reply), or null on timeout or a closed connection. */
// ---------------------------------------------------------------------------
// DNSSEC: the chain of trust from the parent zone (DS) to the zone's keys (DNSKEY) to its signatures (RRSIG),
// and what a validating resolver makes of it.
// ---------------------------------------------------------------------------

const DNSSEC_ALGORITHMS = [
    1 => ['RSA/MD5', 'deprecated'], 3 => ['DSA/SHA-1', 'deprecated'], 5 => ['RSA/SHA-1', 'deprecated'], 6 => ['DSA-NSEC3-SHA1', 'deprecated'],
    7 => ['RSASHA1-NSEC3-SHA1', 'deprecated'], 8 => ['RSA/SHA-256', 'ok'], 10 => ['RSA/SHA-512', 'ok'], 12 => ['GOST R 34.10-2001', 'deprecated'],
    13 => ['ECDSA P-256/SHA-256', 'ok'], 14 => ['ECDSA P-384/SHA-384', 'ok'], 15 => ['Ed25519', 'ok'], 16 => ['Ed448', 'ok'],
];
const DS_DIGESTS = [1 => 'SHA-1', 2 => 'SHA-256', 3 => 'GOST', 4 => 'SHA-384'];
const VALIDATING_RESOLVER = '1.1.1.1';

/** The zone's keys from `dig +multi DNSKEY`, with the key tag dig computes. */
function dnskeys(string $raw): array
{
    preg_match_all('/\sDNSKEY\s+(\d+)\s+3\s+(\d+)\s*\((?:(?!\sDNSKEY\s).)*?key id = (\d+)/s', $raw, $m, PREG_SET_ORDER);
    return array_map(fn ($k) => ['flags' => (int) $k[1], 'algorithm' => (int) $k[2], 'tag' => (int) $k[3], 'role' => ((int) $k[1] & 1) ? 'KSK' : 'ZSK'], $m);
}

/** "20261105183347" as a Unix time. */
function dnssecTime(string $t): ?int
{
    $d = DateTime::createFromFormat('YmdHis', $t, new DateTimeZone('UTC'));
    return $d ? $d->getTimestamp() : null;
}

function toolDnssec(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    $q = digQueries([
        [$domain, 'DS', 'server' => VALIDATING_RESOLVER],
        [$domain, 'SOA', 'server' => VALIDATING_RESOLVER, 'dnssec' => true],
        [$domain, 'SOA', 'server' => VALIDATING_RESOLVER, 'cd' => true, 'dnssec' => true],
    ]);
    [, $keysRaw] = run(['dig', '+multi', '+time=2', '+tries=1', '+nocookie', '+cd', '@' . VALIDATING_RESOLVER, 'DNSKEY', $domain], 8);
    [$dsQ, $soaQ, $cdQ] = $q;
    if (in_array(outcome($cdQ, 'SOA'), ['timeout', 'error', 'refused'], true)) {
        fail("The DNS lookup for {$domain} failed ({$cdQ['status']}). Try again in a moment.", 502);
    }
    if (outcome($cdQ, 'SOA') === 'nxdomain') {
        fail("{$domain} does not exist in DNS (NXDOMAIN).", 422);
    }
    $ds = array_map(function ($a) {
        $f = preg_split('/\s+/', trim($a['value']));
        return ['tag' => (int) $f[0], 'algorithm' => (int) $f[1], 'digestType' => (int) $f[2], 'digest' => strtoupper(implode('', array_slice($f, 3)))];
    }, answersOf($dsQ, 'DS'));
    $keys = dnskeys($keysRaw);
    $sigs = [];
    // Signatures come from the query with checking disabled, so they can be read even when validation fails.
    foreach (answersOf($cdQ, 'RRSIG') as $a) {
        $f = preg_split('/\s+/', trim($a['value']));
        if (count($f) >= 8) {
            $sigs[] = ['covers' => $f[0], 'algorithm' => (int) $f[1], 'expires' => dnssecTime($f[4]), 'inception' => dnssecTime($f[5]), 'tag' => (int) $f[6], 'signer' => rtrim($f[7], '.')];
        }
    }
    $validated = in_array('ad', $soaQ['flags'] ?? [], true);
    $bogus = $soaQ['status'] === 'SERVFAIL' && $cdQ['status'] === 'NOERROR';
    $hasSoa = (bool) answersOf($cdQ, 'SOA');

    $checks = [];
    $signed = $ds || $keys;
    if (!$signed) {
        $checks[] = ['area' => 'chain', 'level' => 'info', 'text' => $hasSoa
            ? "{$domain} is not signed with DNSSEC: there is no DS record at the parent and no DNSKEY. Its answers work everywhere but can be forged on the way to a resolver."
            : "{$domain} has no DS record and no DNSKEY. It is probably a name inside a larger zone, not a zone itself; check its parent domain."];
    } else {
        $checks[] = match (true) {
            $ds && !$keys => ['area' => 'chain', 'level' => 'issue', 'text' => "The parent zone publishes a DS record for {$domain}, but the zone has no DNSKEY. Validating resolvers fail to resolve it (SERVFAIL). Remove the DS at the registrar or re-sign the zone."],
            !$ds && $keys => ['area' => 'chain', 'level' => 'issue', 'text' => "{$domain} is signed (it has DNSKEY records), but there is no DS record at the parent, so no resolver can validate it. Add the DS record at your registrar to complete the chain of trust."],
            default => ['area' => 'chain', 'level' => 'pass', 'text' => 'The parent zone publishes a DS record and the zone publishes DNSKEY records.'],
        };
        if ($ds && $keys) {
            $ksks = array_column(array_filter($keys, fn ($k) => $k['role'] === 'KSK'), 'tag');
            $matching = array_values(array_filter($ds, fn ($d) => in_array($d['tag'], array_column($keys, 'tag'), true)));
            $checks[] = $matching
                ? ['area' => 'chain', 'level' => 'pass', 'text' => 'The DS record points to a key the zone publishes (key tag ' . implode(', ', array_unique(array_column($matching, 'tag'))) . ').']
                : ['area' => 'chain', 'level' => 'issue', 'text' => 'No DS record matches a published key: the DS points to key tag ' . implode(', ', array_unique(array_column($ds, 'tag'))) . ', the zone publishes ' . (implode(', ', array_column($keys, 'tag')) ?: 'none') . '. This usually follows a key rollover where the DS was not updated at the registrar.'];
            $stale = array_values(array_filter($ds, fn ($d) => !in_array($d['tag'], array_column($keys, 'tag'), true)));
            if ($matching && $stale) {
                $checks[] = ['area' => 'chain', 'level' => 'info', 'text' => 'The parent also has DS records for keys the zone no longer publishes (key tag ' . implode(', ', array_unique(array_column($stale, 'tag'))) . '); remove them at the registrar when a rollover is done.'];
            }
            if (!$ksks) {
                $checks[] = ['area' => 'chain', 'level' => 'info', 'text' => 'No key is flagged as a key-signing key (flags 257). That works, but the DS normally points to one.'];
            }
        }
        $checks[] = match (true) {
            $validated => ['area' => 'validation', 'level' => 'pass', 'text' => 'A validating resolver (' . VALIDATING_RESOLVER . ') validates the answers: the chain of trust is complete.'],
            $bogus => ['area' => 'validation', 'level' => 'issue', 'text' => 'Validation fails: a validating resolver (' . VALIDATING_RESOLVER . ') answers SERVFAIL, but answers come back without validation. Users of validating resolvers (most ISPs, 1.1.1.1, 8.8.8.8) cannot reach this domain.'],
            default => ['area' => 'validation', 'level' => 'info', 'text' => 'The answers are not validated (no AD flag), so resolvers treat the zone as unsigned.'],
        };
        foreach (array_unique(array_merge(array_column($keys, 'algorithm'), array_column($ds, 'algorithm'))) as $alg) {
            [$name, $state] = DNSSEC_ALGORITHMS[$alg] ?? ["algorithm {$alg}", 'unknown'];
            $checks[] = $state === 'ok'
                ? ['area' => 'crypto', 'level' => 'pass', 'text' => "Signing algorithm {$alg} ({$name}) is current."]
                : ['area' => 'crypto', 'level' => 'issue', 'text' => "Signing algorithm {$alg} ({$name}) is " . ($state === 'deprecated' ? 'deprecated (RFC 8624); many resolvers treat it as unsigned. Roll over to algorithm 13 (ECDSA P-256) or 8 (RSA/SHA-256).' : 'not one resolvers are known to support.')];
        }
        foreach (array_unique(array_column($ds, 'digestType')) as $dt) {
            if ($dt === 1) {
                $checks[] = ['area' => 'crypto', 'level' => 'info', 'text' => 'A DS record uses a SHA-1 digest (type 1), which is deprecated. Publish a SHA-256 (type 2) DS instead.'];
            }
        }
        if ($sigs) {
            usort($sigs, fn ($a, $b) => $a['expires'] <=> $b['expires']);
            $sig = $sigs[0];
            $left = $sig['expires'] - time();
            $lifetime = max(1, $sig['expires'] - $sig['inception']);
            $until = gmdate('Y-m-d H:i', $sig['expires']) . ' UTC';
            // Signers renew well before expiry; a signature in the last fifth of its life and under 3 days left is late.
            $checks[] = match (true) {
                $left < 0 => ['area' => 'signatures', 'level' => 'issue', 'text' => "The SOA signature expired on {$until}. Resolvers reject expired signatures; the zone needs re-signing."],
                $left < 3 * 86400 && $left < $lifetime * 0.2 => ['area' => 'signatures', 'level' => 'issue', 'text' => "The SOA signature expires soon ({$until}) and has not been renewed. Check that automatic re-signing is running."],
                default => ['area' => 'signatures', 'level' => 'pass', 'text' => "The SOA signature is valid until {$until}" . ($lifetime < 4 * 86400 ? ', and is renewed every few days (signed on the fly).' : '.')],
            };
        } elseif ($keys) {
            $checks[] = ['area' => 'signatures', 'level' => 'issue', 'text' => 'The zone has keys but its SOA record came back without a signature (RRSIG).'];
        }
    }
    return [
        'domain' => $domain,
        'signed' => $signed,
        'validated' => $validated,
        'bogus' => $bogus,
        'ds' => array_map(fn ($d) => $d + ['algorithmName' => DNSSEC_ALGORITHMS[$d['algorithm']][0] ?? null, 'digestName' => DS_DIGESTS[$d['digestType']] ?? null], $ds),
        'keys' => array_map(fn ($k) => $k + ['algorithmName' => DNSSEC_ALGORITHMS[$k['algorithm']][0] ?? null], $keys),
        'signatures' => array_map(fn ($s) => ['covers' => $s['covers'], 'algorithm' => $s['algorithm'], 'tag' => $s['tag'], 'signer' => $s['signer'],
            'inception' => $s['inception'] ? gmdate('Y-m-d\TH:i:s\Z', $s['inception']) : null, 'expires' => $s['expires'] ? gmdate('Y-m-d\TH:i:s\Z', $s['expires']) : null], $sigs),
        'checks' => $checks,
        'settings' => 'Validated by ' . VALIDATING_RESOLVER . '; DS from the parent, DNSKEY and SOA signatures from the zone',
    ];
}

// ---------------------------------------------------------------------------
// Mail transport and brand policies: MTA-STS (RFC 8461) tells senders to insist on TLS with a valid certificate,
// TLS-RPT (RFC 8460) asks them to report TLS failures, BIMI shows the brand's logo in supporting inboxes.
// ---------------------------------------------------------------------------

/** "mx: *.example.com" patterns of an MTA-STS policy against an MX host name. */
function stsMxMatches(string $pattern, string $mx): bool
{
    $pattern = strtolower(rtrim($pattern, '.'));
    $mx = strtolower(rtrim($mx, '.'));
    return $pattern === $mx || (str_starts_with($pattern, '*.') && substr_count($mx, '.') === substr_count($pattern, '.') && str_ends_with($mx, substr($pattern, 1)));
}

/** The MTA-STS policy file, fetched the way senders must: HTTPS with a valid certificate, no redirects. */
function stsPolicy(string $domain): array
{
    $host = "mta-sts.{$domain}";
    $ips = addresses($host)['ips'];
    if (!$ips) {
        return ['error' => "{$host} does not resolve, so senders cannot fetch the policy."];
    }
    if (array_filter($ips, fn ($ip) => !isPublicIp($ip))) {
        return ['error' => "{$host} points to an address that is not public, so we did not fetch it."];
    }
    $c = curl_init("https://{$host}/.well-known/mta-sts.txt");
    curl_setopt_array($c, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 8, CURLOPT_USERAGENT => USER_AGENT,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_MAXFILESIZE => 64 * 1024, CURLOPT_RESOLVE => ["{$host}:443:" . (array_values(array_filter($ips, 'isIpv4'))[0] ?? $ips[0])],
    ]);
    $body = curl_exec($c);
    $code = (int) curl_getinfo($c, CURLINFO_HTTP_CODE);
    $err = curl_error($c);
    $type = (string) curl_getinfo($c, CURLINFO_CONTENT_TYPE);
    curl_close($c);
    if ($body === false) {
        return ['error' => "Could not fetch https://{$host}/.well-known/mta-sts.txt: " . ($err ?: 'no answer') . '. Senders need a valid, trusted certificate for this name.'];
    }
    if ($code !== 200) {
        return ['error' => "https://{$host}/.well-known/mta-sts.txt answered HTTP {$code}" . ($code >= 300 && $code < 400 ? ' (a redirect; senders must not follow it)' : '') . '.'];
    }
    $policy = ['raw' => trim((string) $body), 'contentType' => $type, 'version' => null, 'mode' => null, 'maxAge' => null, 'mx' => []];
    foreach (preg_split('/\r?\n/', (string) $body) as $line) {
        if (!str_contains($line, ':')) {
            continue;
        }
        [$k, $v] = array_map('trim', explode(':', $line, 2));
        match (strtolower($k)) {
            'version' => $policy['version'] = $v,
            'mode' => $policy['mode'] = strtolower($v),
            'max_age' => $policy['maxAge'] = ctype_digit($v) ? (int) $v : null,
            'mx' => $policy['mx'][] = $v,
            default => null,
        };
    }
    return $policy;
}

function toolMailPolicy(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $domain = domainParam();
    $q = digQueries([["_mta-sts.{$domain}", 'TXT'], ["_smtp._tls.{$domain}", 'TXT'], ["default._bimi.{$domain}", 'TXT'], ["_dmarc.{$domain}", 'TXT'], [$domain, 'MX']]);
    $txt = fn (array $r, string $prefix) => array_values(array_filter(array_column(answersOf($r, 'TXT'), 'value'), fn ($t) => stripos(ltrim($t), $prefix) === 0));
    $mx = array_map(fn ($a) => mxParts($a['value'])[1], answersOf($q[4], 'MX'));
    $mx = array_values(array_filter($mx));
    $checks = [];

    // MTA-STS: the TXT record announces a policy; the policy file says how strict senders must be.
    $stsTxt = $txt($q[0], 'v=STSv1');
    $policy = null;
    if (!$stsTxt) {
        $checks[] = ['area' => 'mtasts', 'level' => 'info', 'text' => "No MTA-STS record at _mta-sts.{$domain}. Senders encrypt opportunistically, so an attacker on the path can force mail to {$domain} to travel unencrypted."];
    } else {
        $tags = tagList($stsTxt[0]);
        $checks[] = count($stsTxt) > 1
            ? ['area' => 'mtasts', 'level' => 'issue', 'text' => 'More than one MTA-STS record is published; senders ignore MTA-STS when there are several.']
            : (isset($tags['id']) && preg_match('/^[A-Za-z0-9]{1,32}$/', $tags['id'])
                ? ['area' => 'mtasts', 'level' => 'pass', 'text' => "The MTA-STS record is published (policy id {$tags['id']})."]
                : ['area' => 'mtasts', 'level' => 'issue', 'text' => 'The MTA-STS record has no valid id= (1 to 32 letters and digits). Senders use it to notice policy changes.']);
        $policy = stsPolicy($domain);
        if (isset($policy['error'])) {
            $checks[] = ['area' => 'mtasts', 'level' => 'issue', 'text' => $policy['error']];
        } else {
            $problems = [];
            if ($policy['version'] !== 'STSv1') {
                $problems[] = 'its version line is not “version: STSv1”';
            }
            if (!in_array($policy['mode'], ['enforce', 'testing', 'none'], true)) {
                $problems[] = 'its mode is not enforce, testing or none';
            }
            if ($policy['maxAge'] === null) {
                $problems[] = 'it has no valid max_age';
            }
            if (!$policy['mx'] && $policy['mode'] !== 'none') {
                $problems[] = 'it lists no mx patterns';
            }
            $checks[] = $problems
                ? ['area' => 'mtasts', 'level' => 'issue', 'text' => 'The policy file is invalid: ' . implode(', ', $problems) . '.']
                : ['area' => 'mtasts', 'level' => 'pass', 'text' => 'The policy file is valid and served over trusted HTTPS.'];
            $checks[] = match ($policy['mode']) {
                'enforce' => ['area' => 'mtasts', 'level' => 'pass', 'text' => 'Mode “enforce”: senders that support MTA-STS refuse to deliver unless the MX offers TLS with a valid certificate.'],
                'testing' => ['area' => 'mtasts', 'level' => 'info', 'text' => 'Mode “testing”: senders report failures (with TLS-RPT) but still deliver. Switch to enforce once reports are clean.'],
                default => ['area' => 'mtasts', 'level' => 'info', 'text' => 'Mode “none”: the policy is switched off.'],
            };
            if ($policy['maxAge'] !== null && $policy['maxAge'] < 86400) {
                $checks[] = ['area' => 'mtasts', 'level' => 'info', 'text' => 'max_age is under a day; a week or more (604800) is recommended so senders keep the policy between visits.'];
            }
            if ($policy['mx'] && $mx) {
                $uncovered = array_values(array_filter($mx, fn ($h) => !array_filter($policy['mx'], fn ($p) => stsMxMatches($p, $h))));
                $checks[] = $uncovered
                    ? ['area' => 'mtasts', 'level' => 'issue', 'text' => 'These MX hosts are not covered by the policy’s mx patterns: ' . implode(', ', $uncovered) . '. In enforce mode, senders will not deliver to them.']
                    : ['area' => 'mtasts', 'level' => 'pass', 'text' => 'Every MX host matches an mx pattern in the policy.'];
            }
        }
    }

    // TLS-RPT: where senders send daily reports about TLS failures.
    $rpt = $txt($q[1], 'v=TLSRPTv1');
    if (!$rpt) {
        $checks[] = ['area' => 'tlsrpt', 'level' => 'info', 'text' => "No TLS-RPT record at _smtp._tls.{$domain}, so senders have nowhere to report failed TLS deliveries." . ($stsTxt ? ' With MTA-STS this is how you learn about problems.' : '')];
    } else {
        $tags = tagList($rpt[0]);
        $rua = array_filter(array_map('trim', explode(',', $tags['rua'] ?? '')));
        $bad = array_filter($rua, fn ($u) => !preg_match('#^(mailto:[^@\s]+@[^@\s]+|https://\S+)$#i', $u));
        $checks[] = !$rua || $bad
            ? ['area' => 'tlsrpt', 'level' => 'issue', 'text' => 'The TLS-RPT record needs rua= with mailto: or https: addresses' . ($bad ? ' (not valid: ' . implode(', ', $bad) . ')' : '') . '.']
            : ['area' => 'tlsrpt', 'level' => 'pass', 'text' => 'TLS failure reports go to ' . implode(', ', $rua) . '.'];
    }

    // BIMI: a logo for the brand, shown only when DMARC is enforced.
    $bimi = $txt($q[2], 'v=BIMI1');
    $dmarc = $txt($q[3], 'v=DMARC1');
    $dmarcPolicy = $dmarc ? strtolower(tagList($dmarc[0])['p'] ?? '') : null;
    $bimiTags = $bimi ? tagList($bimi[0]) : null;
    if (!$bimi) {
        $checks[] = ['area' => 'bimi', 'level' => 'info', 'text' => "No BIMI record at default._bimi.{$domain}. Optional: BIMI shows the brand’s logo next to its mail in Gmail, Yahoo and Apple Mail."];
    } else {
        $logo = $bimiTags['l'] ?? '';
        $checks[] = preg_match('#^https://\S+\.svg$#i', $logo)
            ? ['area' => 'bimi', 'level' => 'pass', 'text' => "The BIMI logo is at {$logo}."]
            : ['area' => 'bimi', 'level' => 'issue', 'text' => 'The BIMI record’s l= must be an https:// link to an SVG logo' . ($logo !== '' ? " (it is “{$logo}”)" : '') . '.'];
        $checks[] = ($bimiTags['a'] ?? '') !== ''
            ? ['area' => 'bimi', 'level' => 'pass', 'text' => 'A mark certificate (a=) is published, which Gmail and Apple Mail require to show the logo.']
            : ['area' => 'bimi', 'level' => 'info', 'text' => 'No mark certificate (a=). Gmail and Apple Mail show BIMI logos only with a VMC or CMC certificate; Yahoo shows them without.'];
        $checks[] = in_array($dmarcPolicy, ['quarantine', 'reject'], true)
            ? ['area' => 'bimi', 'level' => 'pass', 'text' => "DMARC is enforced (p={$dmarcPolicy}), as BIMI requires."]
            : ['area' => 'bimi', 'level' => 'issue', 'text' => 'BIMI needs DMARC at p=quarantine or p=reject; ' . ($dmarcPolicy ? "it is p={$dmarcPolicy}" : 'there is no DMARC record') . ', so no inbox will show the logo.'];
    }

    return [
        'domain' => $domain,
        'mx' => $mx,
        'mtaSts' => $stsTxt ? ['record' => $stsTxt[0], 'policy' => $policy] : null,
        'tlsRpt' => $rpt ? ['record' => $rpt[0]] : null,
        'bimi' => $bimi ? ['record' => $bimi[0], 'logo' => $bimiTags['l'] ?? null, 'certificate' => ($bimiTags['a'] ?? '') ?: null] : null,
        'dmarcPolicy' => $dmarcPolicy,
        'checks' => $checks,
        'settings' => 'TXT records at _mta-sts, _smtp._tls and default._bimi; the MTA-STS policy over HTTPS without redirects',
    ];
}

// ---------------------------------------------------------------------------
// TLS: what a server's certificate says and whether a client would trust it. Shared by the SMTP check (after
// STARTTLS) and the TLS certificate check.
// ---------------------------------------------------------------------------

const TLS_CLIENT_METHODS = STREAM_CRYPTO_METHOD_TLSv1_0_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
const CA_BUNDLE = '/etc/ssl/certs/ca-certificates.crt';

/** Whether a certificate name ("example.com", "*.example.com") covers a host name; a wildcard covers one label. */
function certNameMatches(array $names, string $host): bool
{
    $host = strtolower(rtrim($host, '.'));
    foreach ($names as $name) {
        $name = strtolower(trim($name));
        if ($name === $host || (isIp($host) && isIp($name) && sameIp($name, $host))) {
            return true;
        }
        if (str_starts_with($name, '*.') && substr_count($host, '.') === substr_count($name, '.') && str_ends_with($host, substr($name, 1))) {
            return true;
        }
    }
    return false;
}

/** A certificate as the fields people check: names, issuer, validity and key. */
function certFacts($cert): array
{
    $x = openssl_x509_parse($cert) ?: [];
    $names = [];
    foreach (explode(',', $x['extensions']['subjectAltName'] ?? '') as $n) {
        $n = trim($n);
        if (str_starts_with($n, 'DNS:')) {
            $names[] = substr($n, 4);
        } elseif (str_starts_with($n, 'IP Address:')) {
            $names[] = substr($n, 11);
        }
    }
    $flat = fn ($v) => is_array($v) ? implode(', ', $v) : $v;
    $key = ($pub = openssl_pkey_get_public($cert)) ? openssl_pkey_get_details($pub) : null;
    $keyText = match ($key['type'] ?? null) {
        OPENSSL_KEYTYPE_RSA => "RSA {$key['bits']}-bit",
        OPENSSL_KEYTYPE_EC => "ECDSA {$key['bits']}-bit" . (isset($key['ec']['curve_name']) ? " ({$key['ec']['curve_name']})" : ''),
        default => isset($key['bits']) ? "{$key['bits']}-bit key" : null,
    };
    $to = (int) ($x['validTo_time_t'] ?? 0);
    $from = (int) ($x['validFrom_time_t'] ?? 0);
    return [
        'subject' => $flat($x['subject']['CN'] ?? null),
        'names' => $names,
        'issuer' => $flat($x['issuer']['O'] ?? $x['issuer']['CN'] ?? null),
        'issuerCn' => $flat($x['issuer']['CN'] ?? null),
        'notBefore' => $from ? gmdate('Y-m-d\TH:i:s\Z', $from) : null,
        'notAfter' => $to ? gmdate('Y-m-d\TH:i:s\Z', $to) : null,
        'daysLeft' => $to ? (int) floor(($to - time()) / 86400) : null,
        'notYetValid' => $from > time(),
        'key' => $keyText,
        'keyBits' => $key['bits'] ?? null,
        'keyType' => match ($key['type'] ?? null) { OPENSSL_KEYTYPE_RSA => 'rsa', OPENSSL_KEYTYPE_EC => 'ec', default => null },
        'signature' => $x['signatureTypeLN'] ?? null,
        'serial' => $x['serialNumberHex'] ?? null,
        'selfIssued' => ($x['subject'] ?? null) === ($x['issuer'] ?? null),
    ];
}

/** Whether the system's CA bundle trusts the chain a server sent: null when it does, else OpenSSL's reason. */
function verifyChain(array $chain): ?string
{
    if (!$chain) {
        return 'The server sent no certificate.';
    }
    $dir = sys_get_temp_dir();
    $leaf = tempnam($dir, 'po-leaf');
    $rest = tempnam($dir, 'po-chain');
    openssl_x509_export($chain[0], $pem);
    file_put_contents($leaf, $pem);
    $inter = '';
    foreach (array_slice($chain, 1) as $c) {
        openssl_x509_export($c, $p);
        $inter .= $p;
    }
    file_put_contents($rest, $inter);
    $cmd = ['openssl', 'verify', '-CAfile', CA_BUNDLE];
    if ($inter !== '') {
        array_push($cmd, '-untrusted', $rest);
    }
    [$code, $out, $err] = run([...$cmd, $leaf], 5);
    @unlink($leaf);
    @unlink($rest);
    if ($code === 0 && str_contains($out, 'OK')) {
        return null;
    }
    // "error 20 at 0 depth lookup: unable to get local issuer certificate"
    return preg_match('/error \d+ at \d+ depth lookup: (.+)/', $out . "\n" . $err, $m) ? ucfirst(trim($m[1])) . '.' : 'The chain could not be verified.';
}

/** After a TLS handshake on $sock: the protocol, cipher and certificate chain, judged for $host. */
function tlsFacts($sock, string $host): array
{
    $crypto = stream_get_meta_data($sock)['crypto'] ?? [];
    $chain = stream_context_get_params($sock)['options']['ssl']['peer_certificate_chain'] ?? [];
    $facts = array_map('certFacts', $chain);
    $leaf = $facts[0] ?? null;
    return [
        'protocol' => $crypto['protocol'] ?? null,
        'cipher' => $crypto['cipher_name'] ?? null,
        'cipherBits' => $crypto['cipher_bits'] ?? null,
        'chain' => $facts,
        'trustError' => verifyChain($chain),
        'nameMatches' => $leaf ? certNameMatches($leaf['names'] ?: array_filter([$leaf['subject']]), $host) : false,
    ];
}

/** Start TLS on an open socket without verifying (so a bad certificate can still be inspected), sending SNI for $host. */
function startTls($sock, string $host, int $methods = TLS_CLIENT_METHODS): bool
{
    stream_context_set_option($sock, ['ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
        'allow_self_signed' => true,
        'capture_peer_cert_chain' => true,
        'SNI_enabled' => !isIp($host),
        'peer_name' => $host,
        'security_level' => 0,
    ]]);
    return (bool) @stream_socket_enable_crypto($sock, true, $methods);
}

/** Checks on a TLS result, in the area "tls", for the server name a client connects to. */
function tlsChecks(array $t, string $host): array
{
    $checks = [];
    $leaf = $t['chain'][0] ?? null;
    if ($leaf === null) {
        return [['area' => 'tls', 'level' => 'issue', 'text' => 'The server completed the handshake but sent no certificate.']];
    }
    $checks[] = $t['trustError'] === null
        ? ['area' => 'tls', 'level' => 'pass', 'text' => 'The certificate chain is trusted' . ($leaf['issuer'] ? " (issued by {$leaf['issuer']})" : '') . '.']
        : ['area' => 'tls', 'level' => 'issue', 'text' => "The certificate is not trusted: {$t['trustError']}" . ($leaf['selfIssued'] ? ' It is self-signed.' : (count($t['chain']) === 1 ? ' The server sent no intermediate certificates; it should send the full chain.' : ''))];
    $checks[] = $t['nameMatches']
        ? ['area' => 'tls', 'level' => 'pass', 'text' => "The certificate covers {$host}."]
        : ['area' => 'tls', 'level' => 'issue', 'text' => "The certificate does not cover {$host}. It is for " . (implode(', ', array_slice($leaf['names'] ?: array_filter([$leaf['subject']]), 0, 6)) ?: 'no name') . '.'];
    $days = $leaf['daysLeft'];
    $checks[] = match (true) {
        $leaf['notYetValid'] => ['area' => 'tls', 'level' => 'issue', 'text' => 'The certificate is not valid yet: it starts on ' . substr((string) $leaf['notBefore'], 0, 10) . '.'],
        $days === null => ['area' => 'tls', 'level' => 'inconclusive', 'text' => 'The certificate’s expiry date could not be read.'],
        $days < 0 => ['area' => 'tls', 'level' => 'issue', 'text' => 'The certificate expired ' . -$days . ' days ago, on ' . substr((string) $leaf['notAfter'], 0, 10) . '.'],
        $days < 14 => ['area' => 'tls', 'level' => 'issue', 'text' => "The certificate expires in {$days} days, on " . substr((string) $leaf['notAfter'], 0, 10) . '. Renew it now.'],
        $days < 30 => ['area' => 'tls', 'level' => 'info', 'text' => "The certificate expires in {$days} days, on " . substr((string) $leaf['notAfter'], 0, 10) . '.'],
        default => ['area' => 'tls', 'level' => 'pass', 'text' => "The certificate is valid for {$days} more days, until " . substr((string) $leaf['notAfter'], 0, 10) . '.'],
    };
    if ($leaf['keyType'] === 'rsa' && ($leaf['keyBits'] ?? 0) < 2048) {
        $checks[] = ['area' => 'tls', 'level' => 'issue', 'text' => "The key is RSA {$leaf['keyBits']}-bit; anything under 2048 bits is considered weak."];
    }
    if ($t['protocol'] !== null) {
        $old = in_array($t['protocol'], ['TLSv1', 'TLSv1.1', 'SSLv3'], true);
        $checks[] = $old
            ? ['area' => 'tls', 'level' => 'issue', 'text' => "The connection used {$t['protocol']}, which is deprecated (RFC 8996). Enable TLS 1.2 and 1.3."]
            : ['area' => 'tls', 'level' => 'pass', 'text' => "The connection used {$t['protocol']} with {$t['cipher']}."];
    }
    return $checks;
}

function smtpRead($sock): ?string
{
    $text = '';
    while (($line = fgets($sock, 1024)) !== false) {
        $text .= $line;
        if (strlen($line) < 4 || $line[3] === ' ') {
            return rtrim($text);
        }
    }
    return $text === '' ? null : rtrim($text);
}

/** One TLS handshake with $host at $ip:$port, plain TLS or SMTP STARTTLS: the socket, or null when it failed. */
function tlsConnect(string $ip, int $port, string $host, int $methods = TLS_CLIENT_METHODS)
{
    $target = isIpv4($ip) ? $ip : "[{$ip}]";
    $sock = @stream_socket_client("tcp://{$target}:{$port}", $errno, $errstr, 6);
    if (!$sock) {
        return null;
    }
    stream_set_timeout($sock, 6);
    if (in_array($port, [25, 587], true)) {
        $banner = smtpRead($sock);
        fwrite($sock, "EHLO tools.pingomni.com\r\n");
        $ehlo = smtpRead($sock);
        if ($banner === null || $ehlo === null || !preg_match('/^250[ -]STARTTLS\s*$/mi', $ehlo)) {
            fclose($sock);
            return null;
        }
        fwrite($sock, "STARTTLS\r\n");
        if (!str_starts_with((string) smtpRead($sock), '220')) {
            fclose($sock);
            return null;
        }
    }
    if (!startTls($sock, $host, $methods)) {
        fclose($sock);
        return null;
    }
    return $sock;
}

const TLS_VERSIONS = [
    'TLS 1.3' => STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT,
    'TLS 1.2' => STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT,
    'TLS 1.1' => STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT,
    'TLS 1.0' => STREAM_CRYPTO_METHOD_TLSv1_0_CLIENT,
];

function toolTls(): array
{
    heavy();
    [$host, $ips, $ip] = publicTarget(param('host'));
    $port = param('port', 5) === '' ? 443 : filter_var(param('port', 5), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
    if ($port === false) {
        fail('Enter a port from 1 to 65535, or leave it empty for 443.');
    }
    $base = ['host' => $host, 'ip' => $ip, 'addresses' => $ips, 'port' => $port, 'starttls' => in_array($port, [25, 587], true),
        'settings' => in_array($port, [25, 587], true) ? "SMTP STARTTLS on port {$port}" : "TLS on port {$port}" . (isIp($host) ? '' : ", SNI {$host}")];
    $sock = tlsConnect($ip, $port, $host);
    if ($sock === null) {
        $open = tcpConnectMany($ip, [$port], 4)[$port]['state'] === 'open';
        return $base + ['connected' => $open, 'handshake' => false, 'tls' => null, 'versions' => [], 'http' => null, 'checks' => [[
            'area' => 'tls', 'level' => 'issue',
            'text' => $open ? "Port {$port} is open, but no TLS handshake succeeded" . (in_array($port, [25, 587], true) ? ' (the server may not offer STARTTLS)' : ' (the service may not speak TLS on this port)') . '.' : "Nothing answers on port {$port} at {$ip}.",
        ]]];
    }
    $tls = tlsFacts($sock, $host);
    fclose($sock);

    // Which protocol versions the server accepts, one handshake each.
    $versions = [];
    foreach (TLS_VERSIONS as $name => $method) {
        $s = tlsConnect($ip, $port, $host, $method);
        $versions[] = ['version' => $name, 'supported' => $s !== null];
        if ($s) {
            fclose($s);
        }
    }
    $checks = tlsChecks($tls, $host);
    $on = array_column(array_filter($versions, fn ($v) => $v['supported']), 'version');
    $old = array_values(array_intersect($on, ['TLS 1.0', 'TLS 1.1']));
    $checks[] = $old
        ? ['area' => 'protocols', 'level' => 'issue', 'text' => implode(' and ', $old) . ' ' . (count($old) === 1 ? 'is' : 'are') . ' still enabled. ' . (count($old) === 1 ? 'It is' : 'Both are') . ' deprecated (RFC 8996) and no current browser uses them; turn them off unless very old clients still need them.']
        : ['area' => 'protocols', 'level' => 'pass', 'text' => 'TLS 1.0 and 1.1 are disabled.'];
    $checks[] = in_array('TLS 1.3', $on, true)
        ? ['area' => 'protocols', 'level' => 'pass', 'text' => 'TLS 1.3 is supported.']
        : ['area' => 'protocols', 'level' => 'info', 'text' => 'TLS 1.3 is not supported. It is faster and safer than 1.2; enable it when the server software allows.'];

    // For a web server: HSTS, and whether plain HTTP sends visitors to HTTPS.
    $http = null;
    if ($port === 443 && !isIp($host)) {
        $head = fn (string $url) => (function () use ($url, $host, $ip) {
            $c = curl_init($url);
            curl_setopt_array($c, [CURLOPT_NOBODY => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_TIMEOUT => 6,
                CURLOPT_FOLLOWLOCATION => false, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_SSL_VERIFYHOST => 0, CURLOPT_USERAGENT => USER_AGENT,
                CURLOPT_RESOLVE => ["{$host}:443:{$ip}", "{$host}:80:{$ip}"], CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS]);
            $raw = curl_exec($c);
            $code = curl_getinfo($c, CURLINFO_RESPONSE_CODE);
            curl_close($c);
            $headers = [];
            foreach (explode("\n", (string) $raw) as $line) {
                if (str_contains($line, ':')) {
                    [$k, $v] = explode(':', $line, 2);
                    $headers[strtolower(trim($k))] = trim($v);
                }
            }
            return $raw === false ? null : ['code' => $code, 'headers' => $headers];
        })();
        $https = $head("https://{$host}/");
        $plain = $head("http://{$host}/");
        $hsts = $https['headers']['strict-transport-security'] ?? null;
        $location = $plain['headers']['location'] ?? null;
        $http = ['status' => $https['code'] ?? null, 'hsts' => $hsts, 'server' => $https['headers']['server'] ?? null,
            'plainStatus' => $plain['code'] ?? null, 'plainLocation' => $location];
        if ($https !== null) {
            $maxAge = $hsts && preg_match('/max-age=(\d+)/i', $hsts, $m) ? (int) $m[1] : null;
            $checks[] = match (true) {
                $hsts === null => ['area' => 'http', 'level' => 'info', 'text' => 'No HSTS header (Strict-Transport-Security), so browsers may still try plain HTTP first.'],
                $maxAge !== null && $maxAge < 15552000 => ['area' => 'http', 'level' => 'info', 'text' => 'HSTS is set, but for only ' . round($maxAge / 86400) . ' days; 180 days or more is recommended.'],
                default => ['area' => 'http', 'level' => 'pass', 'text' => 'HSTS is set (' . $hsts . ').'],
            };
        }
        if ($plain !== null) {
            $checks[] = $plain['code'] >= 300 && $plain['code'] < 400 && $location && str_starts_with(strtolower($location), 'https://')
                ? ['area' => 'http', 'level' => 'pass', 'text' => "Plain HTTP redirects to HTTPS ({$plain['code']} to {$location})."]
                : ['area' => 'http', 'level' => 'info', 'text' => 'Plain HTTP on port 80 does not redirect to HTTPS' . ($plain['code'] ? " (it answers {$plain['code']})" : '') . '.'];
        }
    }
    return $base + ['connected' => true, 'handshake' => true, 'tls' => $tls, 'versions' => $versions, 'http' => $http, 'checks' => $checks];
}

function toolSmtp(): array
{
    heavy();
    $input = normalizeHost(param('host'));
    if (!isIp($input) && !isDomain($input)) {
        fail('Enter a domain (example.com) or a mail server (mail.example.com).');
    }
    $mx = [];
    $mode = 'host';
    if (!isIp($input)) {
        $r = dig($input, 'MX');
        $o = outcome($r, 'MX');
        if (in_array($o, ['servfail', 'refused', 'timeout', 'error'], true)) {
            fail("The MX lookup for {$input} failed ({$r['status']}), so we do not know which server to test.", 422);
        }
        $mx = array_map(fn ($a) => mxParts($a['value']), answersOf($r, 'MX'));
        usort($mx, fn ($a, $b) => $a[0] <=> $b[0]);
        if (count($mx) === 1 && $mx[0][1] === '') {
            return ['input' => $input, 'nullMx' => true, 'mode' => 'mx', 'mx' => [], 'connected' => false];
        }
        $mode = $mx ? 'mx' : 'implicit';
    }
    $server = $mx[0][1] ?? $input;
    [$server, $ips, $ip] = publicTarget($server);
    $target = isIpv4($ip) ? $ip : "[{$ip}]";
    $base = ['input' => $input, 'mode' => $mode, 'nullMx' => false, 'mx' => array_map(fn ($m) => ['priority' => $m[0], 'host' => $m[1]], $mx),
        'server' => $server, 'ip' => $ip, 'settings' => 'TCP port 25, 8 s timeout; EHLO, STARTTLS when offered, EHLO again, QUIT; no mail is sent'];
    $start = microtime(true);
    $sock = @stream_socket_client("tcp://{$target}:25", $errno, $errstr, 8);
    if (!$sock) {
        $state = $errno === 111 ? 'refused' : ($errno === 110 || $errno === 0 ? 'timeout' : 'error');
        return $base + ['connected' => false, 'state' => $state, 'error' => $errstr ?: 'No answer on port 25.'];
    }
    stream_set_timeout($sock, 8);
    $connectMs = round((microtime(true) - $start) * 1000);
    $transcript = [];
    $banner = smtpRead($sock);
    $transcript[] = ['dir' => 'in', 'text' => $banner ?? '(no greeting within 8 s)'];
    $ehlo = null;
    if ($banner !== null && str_starts_with($banner, '220')) {
        fwrite($sock, "EHLO tools.pingomni.com\r\n");
        $transcript[] = ['dir' => 'out', 'text' => 'EHLO tools.pingomni.com'];
        $ehlo = smtpRead($sock);
        $transcript[] = ['dir' => 'in', 'text' => $ehlo ?? '(no answer within 8 s)'];
    }
    // STARTTLS, when offered: the handshake, then EHLO again over the encrypted connection, as a sender would.
    $tls = null;
    $tlsError = null;
    if ($ehlo !== null && preg_match('/^250[ -]STARTTLS\s*$/mi', $ehlo)) {
        fwrite($sock, "STARTTLS\r\n");
        $transcript[] = ['dir' => 'out', 'text' => 'STARTTLS'];
        $ready = smtpRead($sock);
        $transcript[] = ['dir' => 'in', 'text' => $ready ?? '(no answer within 8 s)'];
        if ($ready !== null && str_starts_with($ready, '220')) {
            if (startTls($sock, $server)) {
                $tls = tlsFacts($sock, $server);
                $transcript[] = ['dir' => 'note', 'text' => "TLS handshake done: {$tls['protocol']}, {$tls['cipher']}"];
                fwrite($sock, "EHLO tools.pingomni.com\r\n");
                $transcript[] = ['dir' => 'out', 'text' => 'EHLO tools.pingomni.com'];
                $after = smtpRead($sock);
                $transcript[] = ['dir' => 'in', 'text' => $after ?? '(no answer within 8 s)'];
            } else {
                $tlsError = 'The server accepted STARTTLS, but the TLS handshake failed.';
                $transcript[] = ['dir' => 'note', 'text' => 'TLS handshake failed'];
            }
        } else {
            $tlsError = 'The server offers STARTTLS but refused it when asked.';
        }
    }
    fwrite($sock, "QUIT\r\n");
    $transcript[] = ['dir' => 'out', 'text' => 'QUIT'];
    $bye = smtpRead($sock);
    if ($bye !== null) {
        $transcript[] = ['dir' => 'in', 'text' => $bye];
    }
    fclose($sock);
    $caps = [];
    if ($ehlo !== null && str_starts_with($ehlo, '250')) {
        foreach (array_slice(explode("\n", $ehlo), 1) as $line) {
            $caps[] = trim(substr($line, 4));
        }
    }
    return $base + [
        'connected' => true,
        'state' => 'connected',
        'ms' => $connectMs,
        'banner' => $banner,
        'bannerCode' => $banner !== null ? (int) substr($banner, 0, 3) : null,
        'ehloCode' => $ehlo !== null ? (int) substr($ehlo, 0, 3) : null,
        'starttls' => (bool) preg_grep('/^STARTTLS$/i', $caps),
        'capabilities' => $caps,
        'transcript' => $transcript,
        'tls' => $tls,
        'tlsError' => $tlsError,
        'checks' => smtpChecks($server, $ip, $banner, $caps, $tls, $tlsError),
    ];
}

/** What receivers and senders check about a mail server: reverse DNS, its greeting, and TLS. */
function smtpChecks(string $server, string $ip, ?string $banner, array $caps, ?array $tls, ?string $tlsError): array
{
    $checks = [];
    // Reverse DNS: receivers distrust mail from an address without a PTR record that resolves back to it.
    $names = array_column(answersOf(dig($ip, 'PTR'), 'PTR'), 'value');
    $names = array_map(fn ($n) => rtrim($n, '.'), $names);
    $confirmed = null;
    foreach (array_slice($names, 0, 4) as $name) {
        $back = array_column(answersOf(dig($name, isIpv4($ip) ? 'A' : 'AAAA'), isIpv4($ip) ? 'A' : 'AAAA'), 'value');
        if (array_filter($back, fn ($b) => sameIp($b, $ip))) {
            $confirmed = $name;
            break;
        }
    }
    $checks[] = match (true) {
        !$names => ['area' => 'rdns', 'level' => 'info', 'text' => "{$ip} has no reverse DNS (PTR) record. That is fine for a server that only receives mail, but if it also sends, many receivers reject or penalise its mail; ask whoever runs the address block to set one."],
        $confirmed === null => ['area' => 'rdns', 'level' => 'info', 'text' => "{$ip} points to " . implode(', ', $names) . ', but that name does not resolve back to it. If this server also sends mail, receivers check this match (forward-confirmed reverse DNS).'],
        default => ['area' => 'rdns', 'level' => 'pass', 'text' => "{$ip} points to {$confirmed}, which resolves back to it (forward-confirmed reverse DNS)."],
    };
    if ($banner !== null && preg_match('/^220[ -](\S+)/', $banner, $m)) {
        $greets = strtolower(rtrim($m[1], '.'));
        $checks[] = in_array($greets, array_map('strtolower', $names), true) || $greets === strtolower($server)
            ? ['area' => 'rdns', 'level' => 'pass', 'text' => "The greeting names the server {$greets}, which matches its DNS."]
            : ['area' => 'rdns', 'level' => 'info', 'text' => "The greeting names the server “{$greets}”, which matches neither its reverse DNS nor the name we connected to. If this server also sends mail, some receivers score that as suspicious."];
    }
    if (!preg_grep('/^STARTTLS$/i', $caps)) {
        $checks[] = ['area' => 'tls', 'level' => 'issue', 'text' => 'The server does not offer STARTTLS, so mail to it travels unencrypted.'];
    } elseif ($tlsError !== null) {
        $checks[] = ['area' => 'tls', 'level' => 'issue', 'text' => $tlsError];
    } elseif ($tls !== null) {
        $checks[] = ['area' => 'tls', 'level' => 'pass', 'text' => 'STARTTLS works: mail to this server can be encrypted.'];
        // Senders encrypt opportunistically and do not require a trusted certificate unless MTA-STS or DANE asks for it.
        foreach (tlsChecks($tls, $server) as $c) {
            $checks[] = $c['level'] === 'issue' && !str_contains($c['text'], 'deprecated')
                ? ['area' => 'tls', 'level' => 'info', 'text' => $c['text'] . ' Most senders still deliver over TLS, but domains that use MTA-STS or DANE will not.']
                : $c;
        }
    }
    if (preg_grep('/^SIZE\s+\d+/i', $caps) && preg_match('/^SIZE\s+(\d+)/mi', implode("\n", $caps), $m) && (int) $m[1] > 0) {
        $checks[] = ['area' => 'limits', 'level' => 'info', 'text' => 'It accepts messages up to ' . round((int) $m[1] / 1048576, 1) . ' MB.'];
    }
    return $checks;
}

function toolWhois(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $query = normalizeHost(param('query'));
    if (isIp($query)) {
        if (!isPublicIp($query)) {
            fail('Private and reserved addresses are not registered to anyone, so there is no record to look up.');
        }
        [$state, $d, $source] = rdap('ip/' . $query);
        if ($state === 'notfound') {
            return ['kind' => 'ip', 'query' => $query, 'found' => false, 'supported' => true, 'source' => $source];
        }
        $contacts = rdapEntities($d);
        return [
            'kind' => 'ip',
            'query' => $query,
            'found' => true,
            'name' => $d['name'] ?? null,
            'handle' => $d['handle'] ?? null,
            'range' => isset($d['startAddress']) ? "{$d['startAddress']} - {$d['endAddress']}" : null,
            'cidr' => isset($d['cidr0_cidrs'][0]) ? (($d['cidr0_cidrs'][0]['v4prefix'] ?? $d['cidr0_cidrs'][0]['v6prefix'] ?? '') . '/' . $d['cidr0_cidrs'][0]['length']) : null,
            'country' => $d['country'] ?? null,
            'type' => $d['type'] ?? null,
            'status' => $d['status'] ?? [],
            'events' => (object) rdapEvents($d),
            'contacts' => $contacts,
            'redacted' => rdapRedactions($d, $contacts),
            'source' => $source,
        ];
    }
    if (!isDomain($query)) {
        fail('Enter a domain name (example.com) or an IP address.');
    }
    $tld = substr(strrchr($query, '.'), 1);
    $tlds = rdapTlds();
    if ($tlds !== null && !in_array($tld, $tlds, true)) {
        return ['kind' => 'domain', 'query' => $query, 'found' => false, 'supported' => false, 'tld' => $tld, 'source' => 'data.iana.org'];
    }
    [$state, $d, $source] = rdap('domain/' . $query);
    if ($state === 'notfound') {
        return ['kind' => 'domain', 'query' => $query, 'found' => false, 'supported' => $tlds === null ? null : true, 'tld' => $tld, 'source' => $source];
    }
    $contacts = rdapEntities($d);
    $registrar = array_values(array_filter($contacts, fn ($c) => in_array('registrar', $c['roles'], true)))[0] ?? null;
    return [
        'kind' => 'domain',
        'query' => $query,
        'found' => true,
        'name' => strtolower($d['ldhName'] ?? $query),
        'registrar' => $registrar ? ['name' => $registrar['fn'] ?? $registrar['org'] ?? null, 'ianaId' => $registrar['ianaId'] ?? null] : null,
        'status' => $d['status'] ?? [],
        'events' => (object) rdapEvents($d),
        'nameservers' => array_values(array_filter(array_map(fn ($n) => strtolower($n['ldhName'] ?? ''), $d['nameservers'] ?? []))),
        'dnssec' => $d['secureDNS']['delegationSigned'] ?? null,
        'contacts' => array_values(array_filter($contacts, fn ($c) => !in_array('registrar', $c['roles'], true) || count($c['roles']) > 1)),
        'redacted' => rdapRedactions($d, $contacts),
        'source' => $source,
    ];
}

// Reputation lists (DNSBLs). Each query is <reversed IP or domain>.<zone>. A list's answers are trusted only while
// it passes its own test entries: the positive test (RFC 5782: 127.0.0.2, or the list's documented test domain)
// must come back listed, and the negative test (127.0.0.1, or "invalid") must not. A list that fails a test,
// refuses us or does not answer is reported as such, never as "not listed".
//
// Left out on purpose: korea.services.net lists a whole country's address space, not senders' behaviour.
// Spamhaus, SURBL and URIBL refuse queries sent through public resolvers (this server uses one), so they are
// asked but come back "blocked" rather than a false "not listed".
const IP_LISTS = [
    ['zone' => 'zen.spamhaus.org', 'name' => 'Spamhaus ZEN', 'info' => 'https://check.spamhaus.org/'],
    ['zone' => 'bl.spamcop.net', 'name' => 'SpamCop', 'info' => 'https://www.spamcop.net/bl.shtml'],
    ['zone' => 'b.barracudacentral.org', 'name' => 'Barracuda', 'info' => 'https://www.barracudacentral.org/lookups'],
    ['zone' => 'psbl.surriel.com', 'name' => 'PSBL', 'info' => 'https://psbl.org/'],
    ['zone' => 'dnsbl-1.uceprotect.net', 'name' => 'UCEPROTECT level 1', 'info' => 'https://www.uceprotect.net/en/rblcheck.php'],
    ['zone' => 'dnsbl-2.uceprotect.net', 'name' => 'UCEPROTECT level 2', 'info' => 'https://www.uceprotect.net/en/rblcheck.php',
        'note' => 'Lists whole provider ranges when many addresses in them send spam, not this address alone.'],
    ['zone' => 'dnsbl-3.uceprotect.net', 'name' => 'UCEPROTECT level 3', 'info' => 'https://www.uceprotect.net/en/rblcheck.php',
        'note' => 'Lists whole networks (ASNs), not this address alone. Few mail servers block on it.'],
    ['zone' => 'bl.mailspike.net', 'name' => 'Mailspike', 'info' => 'https://mailspike.org/'],
    ['zone' => 'dnsbl.dronebl.org', 'name' => 'DroneBL', 'info' => 'https://dronebl.org/lookup'],
    ['zone' => 'ix.dnsbl.manitu.net', 'name' => 'NiX Spam', 'info' => 'https://www.dnsbl.manitu.net/'],
    ['zone' => 'truncate.gbudb.net', 'name' => 'GBUdb Truncate', 'info' => 'https://www.gbudb.com/truncate/'],
    ['zone' => 'dnsbl.spfbl.net', 'name' => 'SPFBL', 'info' => 'https://spfbl.net/en/dnsbl/'],
    ['zone' => 'bl.0spam.org', 'name' => '0spam', 'info' => 'https://0spam.org/'],
    ['zone' => 'all.s5h.net', 'name' => 's5h.net', 'info' => 'https://www.usenix.org.uk/content/rbl.html'],
    ['zone' => 'spam.dnsbl.anonmails.de', 'name' => 'Anonmails', 'info' => 'https://anonmails.de/dnsbl.php'],
    ['zone' => 'dnsbl.kempt.net', 'name' => 'Kempt', 'info' => null],
    ['zone' => 'bl.blocklist.de', 'name' => 'blocklist.de', 'info' => 'https://www.blocklist.de/en/search.html'],
    ['zone' => 'rbl.interserver.net', 'name' => 'InterServer', 'info' => 'https://www.interserver.net/rbl/'],
    ['zone' => 'bl.nordspam.com', 'name' => 'NordSpam', 'info' => 'https://www.nordspam.com/'],
    ['zone' => 'backscatter.spameatingmonkey.net', 'name' => 'SEM Backscatter', 'info' => 'https://spameatingmonkey.com/',
        'note' => 'Lists servers that send bounces to forged senders, not spam sources.'],
    ['zone' => 'bl.spameatingmonkey.net', 'name' => 'SEM Black', 'info' => 'https://spameatingmonkey.com/'],
    ['zone' => 'dnsbl.zapbl.net', 'name' => 'ZapBL', 'info' => 'https://zapbl.net/'],
    ['zone' => 'bl.mxrbl.com', 'name' => 'MXRBL', 'info' => 'https://mxrbl.com/'],
    ['zone' => 'dnsrbl.swinog.ch', 'name' => 'SWINOG', 'info' => 'https://antispam.imp.ch/'],
    ['zone' => 'black.junkemailfilter.com', 'name' => 'JunkEmailFilter', 'info' => 'https://www.junkemailfilter.com/'],
    ['zone' => 'bl.suomispam.net', 'name' => 'Suomispam', 'info' => 'https://suomispam.net/'],
];

const DOMAIN_LISTS = [
    ['zone' => 'dbl.spamhaus.org', 'name' => 'Spamhaus DBL', 'info' => 'https://check.spamhaus.org/', 'test' => 'dbltest.com'],
    ['zone' => 'multi.surbl.org', 'name' => 'SURBL', 'info' => 'https://surbl.org/surbl-analysis', 'test' => 'test.surbl.org'],
    ['zone' => 'multi.uribl.com', 'name' => 'URIBL', 'info' => 'https://admin.uribl.com/', 'test' => 'test.uribl.com'],
    ['zone' => 'dbl.nordspam.com', 'name' => 'NordSpam DBL', 'info' => 'https://www.nordspam.com/', 'test' => 'test'],
    ['zone' => 'uribl.spameatingmonkey.net', 'name' => 'SEM URI', 'info' => 'https://spameatingmonkey.com/', 'test' => 'test'],
];

/**
 * What one list's answer means. Codes in 127.255.255.0/24 (and 127.0.0.1 from URI lists) are the lists' own
 * "query refused" signals; anything outside 127.0.0.0/8 is not a valid list answer.
 * @return array{0: string, 1: ?string} state and reason
 */
function listAnswer(array $r, bool $domainList): array
{
    $o = outcome($r, 'A');
    if ($o === 'timeout') {
        return ['unavailable', 'The list did not answer in time.'];
    }
    if (in_array($o, ['servfail', 'refused', 'error'], true)) {
        return ['unavailable', "The list’s servers answered {$r['status']}."];
    }
    if ($o !== 'found') {
        return ['not_listed', null];
    }
    $codes = array_column(answersOf($r, 'A'), 'value');
    if (array_filter($codes, fn ($c) => !str_starts_with($c, '127.'))) {
        return ['invalid', 'Answered ' . implode(', ', $codes) . ', which is not a valid list answer.'];
    }
    if (array_filter($codes, fn ($c) => str_starts_with($c, '127.255.255.') || ($domainList && $c === '127.0.0.1'))) {
        return ['blocked', 'The list refused our query. It does not answer queries that arrive through public DNS resolvers.'];
    }
    return ['listed', null];
}

/** Each list's own test entries, checked at most every 10 minutes and remembered between visitors. */
function listHealth(array $lists, bool $domainLists): array
{
    $dir = stateDir();
    $file = $dir ? "{$dir}/list-health-" . ($domainLists ? 'domain' : 'ip') . '.json' : null;
    $cached = $file && is_file($file) ? json_decode((string) @file_get_contents($file), true) : null;
    if (is_array($cached) && ($cached['at'] ?? 0) > time() - 600 && array_keys($cached['lists'] ?? []) === array_column($lists, 'zone')) {
        return $cached['lists'];
    }
    $queries = [];
    foreach ($lists as $l) {
        $queries[] = [($domainLists ? $l['test'] : '2.0.0.127') . '.' . $l['zone'], 'A'];
        $queries[] = [($domainLists ? 'invalid' : '1.0.0.127') . '.' . $l['zone'], 'A'];
    }
    $answers = digQueries($queries);
    $health = [];
    foreach ($lists as $i => $l) {
        [$positive] = listAnswer($answers[2 * $i], $domainLists);
        [$negative] = listAnswer($answers[2 * $i + 1], $domainLists);
        $health[$l['zone']] = match (true) {
            $positive === 'listed' && $negative === 'not_listed' => 'ok',
            $positive === 'blocked' || $negative === 'blocked' => 'blocked',
            $positive === 'unavailable' || $negative === 'unavailable' => 'unavailable',
            $negative === 'listed' => 'lists_everything',
            default => 'test_not_listed',
        };
    }
    if ($file) {
        @file_put_contents($file, json_encode(['at' => time(), 'lists' => $health]), LOCK_EX);
    }
    return $health;
}

function checkLists(string $key, array $lists, bool $domainLists): array
{
    $health = listHealth($lists, $domainLists);
    $answers = digQueries(array_map(fn ($l) => ["{$key}.{$l['zone']}", 'A'], $lists));
    $listed = [];
    $results = [];
    foreach ($lists as $i => $l) {
        [$state, $reason] = listAnswer($answers[$i], $domainLists);
        $h = $health[$l['zone']] ?? 'ok';
        if (in_array($state, ['listed', 'not_listed'], true) && $h !== 'ok') {
            [$state, $reason] = match ($h) {
                'blocked' => ['blocked', 'The list refuses queries from this server (it does not serve public DNS resolvers), so we cannot check it.'],
                'unavailable' => ['unavailable', 'The list did not answer its own test query, so its answer cannot be trusted right now.'],
                'lists_everything' => ['invalid', 'The list answers “listed” for an address it should never list, so its answers cannot be trusted.'],
                default => ['invalid', 'The list does not list its own test entry, so a “not listed” answer cannot be trusted.'],
            };
        }
        if ($state === 'listed') {
            $listed[] = $i;
        }
        $results[$i] = ['list' => $l['zone'], 'name' => $l['name'], 'info' => $l['info'], 'note' => $l['note'] ?? null,
            'kind' => $domainLists ? 'domain' : 'ip', 'state' => $state,
            'codes' => $state === 'listed' ? array_column(answersOf($answers[$i], 'A'), 'value') : [], 'reason' => $reason];
    }
    // Lists publish why an entry is listed (often with a link to their lookup or removal page) as TXT.
    if ($listed) {
        $txt = digQueries(array_map(fn ($i) => ["{$key}.{$lists[$i]['zone']}", 'TXT'], $listed));
        foreach ($listed as $n => $i) {
            $why = implode(' ', array_column(answersOf($txt[$n], 'TXT'), 'value'));
            $results[$i]['reason'] = $why !== '' ? substr($why, 0, 400) : null;
        }
    }
    return array_values($results);
}

function toolBlacklist(): array
{
    rateLimit('lists', 6);
    $input = normalizeHost(param('host'));
    $domain = null;
    $ips = [];
    if (isIpv4($input)) {
        $ip = $input;
    } elseif (isIp($input)) {
        fail('Only IPv4 addresses can be checked: these lists do not cover IPv6.');
    } elseif (isDomain($input)) {
        $domain = $input;
        $found = addresses($input);
        $ips = array_values(array_filter($found['ips'], 'isIpv4'));
        $ip = $ips[0] ?? null;
    } else {
        fail('Enter an IPv4 address, a mail server or a domain.');
    }
    if ($ip !== null && !isPublicIp($ip)) {
        fail("{$ip} is not a public address, so it cannot be on these lists.");
    }
    $results = [];
    if ($ip !== null) {
        $results = checkLists(implode('.', array_reverse(explode('.', $ip))), IP_LISTS, false);
    }
    if ($domain !== null) {
        array_push($results, ...checkLists($domain, DOMAIN_LISTS, true));
    }
    return ['input' => $input, 'ip' => $ip, 'addresses' => $ips, 'domain' => $domain, 'results' => $results];
}

// ---------------------------------------------------------------------------
// BGP and AS data. Routes come from RIPEstat, which reads RIPE NCC's Routing Information Service (RIS): route
// collectors that take full BGP feeds from hundreds of networks worldwide. So results show the internet's view
// of a prefix, not this server's. Network details come from PeeringDB, and AS names from Team Cymru's DNS
// service. Answers are kept for a few minutes, so repeat lookups do not ask these free services again.
// ---------------------------------------------------------------------------

const BGP_CACHE_SECONDS = 300;

function ripestat(string $call, array $params): string
{
    return "https://stat.ripe.net/data/{$call}/data.json?" . http_build_query($params + ['sourceapp' => 'pingomni']);
}

/**
 * Several JSON GETs at once, each answer cached for $ttl seconds.
 * @param array<string, string> $urls
 * @return array<string, ?array> the decoded answer for each key, or null when that request failed
 */
function fetchJson(array $urls, int $ttl, int $timeout = 15): array
{
    $dir = stateDir();
    $out = array_fill_keys(array_keys($urls), null);
    $multi = curl_multi_init();
    $pending = [];
    foreach ($urls as $key => $url) {
        $file = $dir ? "{$dir}/http-" . hash('sha256', $url) . '.json' : null;
        if ($file && is_file($file) && filemtime($file) > time() - $ttl) {
            $out[$key] = json_decode((string) @file_get_contents($file), true);
            if (is_array($out[$key])) {
                continue;
            }
        }
        $c = curl_init($url);
        curl_setopt_array($c, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 4,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_USERAGENT => USER_AGENT,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_MAXFILESIZE => 16 * 1024 * 1024,
        ]);
        curl_multi_add_handle($multi, $c);
        $pending[$key] = [$c, $file];
    }
    do {
        $status = curl_multi_exec($multi, $running);
        if ($running) {
            curl_multi_select($multi, 1.0);
        }
    } while ($running && $status === CURLM_OK);
    foreach ($pending as $key => [$c, $file]) {
        $body = (string) curl_multi_getcontent($c);
        $data = curl_getinfo($c, CURLINFO_HTTP_CODE) === 200 ? json_decode($body, true) : null;
        $out[$key] = is_array($data) ? $data : null;
        if ($file && $out[$key] !== null) {
            @file_put_contents($file, $body, LOCK_EX);
        }
        curl_multi_remove_handle($multi, $c);
    }
    curl_multi_close($multi);
    // Now and then, clear out answers that are long past their time.
    if ($dir && random_int(1, 50) === 1) {
        foreach (glob("{$dir}/http-*.json") ?: [] as $old) {
            if (@filemtime($old) < time() - 3600) {
                @unlink($old);
            }
        }
    }
    return $out;
}

/** The data part of a RIPEstat answer, or null when the call failed. */
function ripestatData(?array $answer): ?array
{
    return ($answer['status'] ?? '') === 'ok' && is_array($answer['data'] ?? null) ? $answer['data'] : null;
}

function needRipestat(?array $data): array
{
    return $data ?? fail('RIPEstat, where the routing data comes from, did not answer. Try again in a moment.', 502);
}

/** Holder names for AS numbers, from Team Cymru's DNS service. @return array<int, array{name: string, country: ?string}> */
function asNames(array $asns): array
{
    $asns = array_slice(array_values(array_unique(array_filter($asns))), 0, 64);
    $answers = digQueries(array_map(fn ($a) => ["AS{$a}.asn.cymru.com", 'TXT'], $asns));
    $names = [];
    foreach ($asns as $i => $asn) {
        // "15169 | US | arin | 2000-03-30 | GOOGLE - Google LLC, US"
        $f = array_map('trim', explode('|', answersOf($answers[$i], 'TXT')[0]['value'] ?? ''));
        if (count($f) >= 5 && $f[4] !== '') {
            $names[$asn] = ['name' => preg_replace('/, [A-Z]{2}$/', '', $f[4]), 'country' => $f[1] ?: null];
        }
    }
    return $names;
}

/** What a special-purpose AS number is for, or null for an ordinary one. */
function asnSpecial(int $asn): ?string
{
    return match (true) {
        $asn === 0 => 'AS0 is reserved: it must never appear in a route (RFC 7607).',
        $asn === 23456 => 'AS23456 (AS_TRANS) stands in for 4-byte AS numbers on old routers that only understand 2-byte ones (RFC 6793).',
        $asn >= 64496 && $asn <= 64511, $asn >= 65536 && $asn <= 65551 => 'This AS number is reserved for documentation and examples (RFC 5398).',
        $asn >= 64512 && $asn <= 65534, $asn >= 4200000000 && $asn <= 4294967294 => 'This is a private AS number (RFC 6996): used inside networks, never announced on the internet.',
        $asn === 65535, $asn === 4294967295 => 'This AS number is reserved (RFC 7300).',
        default => null,
    };
}

/** "AS15169", "as 15169" or "15169" as 15169. */
function asnParam(): int
{
    $raw = param('asn', 32);
    if (isIp(normalizeHost($raw))) {
        fail('That is an IP address. Use Prefix lookup to find the network that announces it.');
    }
    if (!preg_match('/^(?:AS\s*)?(\d{1,10})$/i', $raw, $m) || (int) $m[1] > 4294967295) {
        fail('Enter an AS number, like AS15169 or 15169.');
    }
    return (int) $m[1];
}

/**
 * The address or prefix to look up in the routing table: an IP, a prefix (8.8.8.0/24) or a host name (looked up
 * by its first address). @return array{0: string, 1: ?string} the resource, and the host name it came from
 */
function routeResource(): array
{
    $raw = param('resource', 100);
    $private = 'Private, loopback and reserved addresses are not routed on the internet, so they are not in the global routing table.';
    if (preg_match('#^([0-9a-f:.]+)/(\d{1,3})$#i', $raw, $m)) {
        if (!isIp($m[1]) || (int) $m[2] > (isIpv4($m[1]) ? 32 : 128)) {
            fail('Enter a valid prefix, like 8.8.8.0/24 or 2001:db8::/32.');
        }
        if (!isPublicIp($m[1])) {
            fail($private);
        }
        return [strtolower($m[1]) . '/' . (int) $m[2], null];
    }
    $host = normalizeHost($raw);
    if (isIp($host)) {
        if (!isPublicIp($host)) {
            fail($private);
        }
        return [$host, null];
    }
    if (!isDomain($host)) {
        fail('Enter an IP address, a prefix like 8.8.8.0/24, or a hostname.');
    }
    $ips = addresses($host)['ips'];
    $ip = array_values(array_filter($ips, 'isIpv4'))[0] ?? $ips[0] ?? fail("{$host} does not resolve to an IP address.", 422);
    if (!isPublicIp($ip)) {
        fail("{$host} points to {$ip}, which is not a public address, so it is not in the global routing table.", 422);
    }
    return [$ip, $host];
}

/** Sort key for prefixes: IPv4 before IPv6, then by address and length. */
function prefixKey(string $prefix): string
{
    [$ip, $len] = explode('/', $prefix) + [1 => '0'];
    $packed = (string) @inet_pton($ip);
    return (strlen($packed) === 4 ? '4' : '6') . $packed . chr((int) $len);
}

/** An AS path from RIPEstat as AS numbers, with prepends (the same AS repeated) collapsed. AS sets are left out. */
function cleanPath(array $path): array
{
    $clean = [];
    foreach ($path as $asn) {
        if (is_int($asn) && end($clean) !== $asn) {
            $clean[] = $asn;
        }
    }
    return $clean;
}

/**
 * Routing hygiene of every prefix an AS announces, from IRR Explorer: whether RPKI and the IRR agree with what BGP
 * carries. Prefixes the AS only registered (in the IRR or RPKI) but does not announce are counted, not listed.
 */
function asHygiene(?array $answer, int $asn): ?array
{
    if (!is_array($answer['directOrigin'] ?? null)) {
        return null;
    }
    $counts = ['success' => 0, 'info' => 0, 'warning' => 0, 'danger' => 0];
    $problems = [];
    $notes = [];
    $registeredOnly = 0;
    foreach ($answer['directOrigin'] as $p) {
        if (!in_array($asn, array_map('intval', $p['bgpOrigins'] ?? []), true)) {
            $registeredOnly++;
            continue;
        }
        $level = in_array($p['categoryOverall'] ?? '', ['success', 'info', 'warning', 'danger'], true) ? $p['categoryOverall'] : 'info';
        $counts[$level]++;
        $texts = array_values(array_unique(array_map(fn ($m) => (string) $m['text'], array_filter($p['messages'] ?? [], fn ($m) => ($m['category'] ?? '') !== 'success'))));
        if ($level === 'danger' || $level === 'warning') {
            $problems[] = ['prefix' => (string) $p['prefix'], 'level' => $level, 'messages' => $texts];
        } elseif ($level === 'info' && $texts) {
            $notes[$texts[0]] = ($notes[$texts[0]] ?? 0) + 1;
        }
    }
    usort($problems, fn ($a, $b) => ($a['level'] === 'danger' ? 0 : 1) <=> ($b['level'] === 'danger' ? 0 : 1) ?: strcmp(prefixKey($a['prefix']), prefixKey($b['prefix'])));
    arsort($notes);
    return [
        'announced' => array_sum($counts),
        'counts' => $counts,
        'problems' => array_slice($problems, 0, 200),
        'problemTotal' => count($problems),
        'notes' => array_map(fn ($text, $n) => ['text' => $text, 'prefixes' => $n], array_keys($notes), $notes),
        'registeredOnly' => $registeredOnly,
    ];
}

function toolAsn(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    $asn = asnParam();
    $special = asnSpecial($asn);
    if ($special !== null) {
        return ['via' => 'ripestat', 'asn' => $asn, 'special' => $special, 'holder' => null, 'announced' => false, 'block' => null,
            'prefixes' => ['v4' => 0, 'v6' => 0, 'list' => []], 'neighbours' => null, 'peeringdb' => null, 'hygiene' => null];
    }
    $d = fetchJson([
        'overview' => ripestat('as-overview', ['resource' => "AS{$asn}"]),
        'prefixes' => ripestat('announced-prefixes', ['resource' => "AS{$asn}"]),
        'neighbours' => ripestat('asn-neighbours', ['resource' => "AS{$asn}"]),
        'peeringdb' => "https://www.peeringdb.com/api/net?asn={$asn}",
        'irr' => "https://irrexplorer.nlnog.net/api/prefixes/asn/AS{$asn}",
    ], BGP_CACHE_SECONDS, 20);
    $o = needRipestat(ripestatData($d['overview']));

    $prefixes = array_column(ripestatData($d['prefixes'])['prefixes'] ?? [], 'prefix');
    usort($prefixes, fn ($a, $b) => strcmp(prefixKey($a), prefixKey($b)));
    $v6 = count(array_filter($prefixes, fn ($p) => str_contains($p, ':')));

    // RIS sees each neighbour on the left (towards the collectors: upstreams and peers) or the right (towards
    // the origin: customers) of this AS in the paths it collects.
    $nb = ripestatData($d['neighbours']);
    $all = $nb['neighbours'] ?? [];
    usort($all, fn ($a, $b) => $b['power'] <=> $a['power']);
    $side = fn (string $type) => array_slice(array_values(array_filter($all, fn ($n) => $n['type'] === $type)), 0, 25);
    [$left, $right] = [$side('left'), $side('right')];
    $names = asNames(array_column(array_merge($left, $right), 'asn'));
    $row = fn ($n) => ['asn' => $n['asn'], 'name' => $names[$n['asn']]['name'] ?? null, 'country' => $names[$n['asn']]['country'] ?? null,
        'power' => $n['power'], 'v4' => $n['v4_peers'], 'v6' => $n['v6_peers']];

    $net = $d['peeringdb']['data'][0] ?? null;
    return [
        'hygiene' => asHygiene($d['irr'], $asn),
        'via' => 'ripestat',
        'asn' => $asn,
        'special' => null,
        'holder' => ($o['holder'] ?? '') !== '' ? $o['holder'] : null,
        'announced' => (bool) ($o['announced'] ?? false),
        'block' => $o['block'] ?? null,
        'prefixes' => ['v4' => count($prefixes) - $v6, 'v6' => $v6, 'list' => array_slice($prefixes, 0, 1000)],
        'neighbours' => $nb === null ? null : [
            'counts' => $nb['neighbour_counts'] ?? null,
            'left' => array_map($row, $left),
            'right' => array_map($row, $right),
        ],
        'peeringdb' => $net ? [
            'id' => $net['id'],
            'name' => $net['name'] ?? null,
            'aka' => ($net['aka'] ?? '') ?: null,
            'website' => ($net['website'] ?? '') ?: null,
            'type' => ($net['info_type'] ?? '') ?: null,
            'traffic' => ($net['info_traffic'] ?? '') ?: null,
            'ratio' => ($net['info_ratio'] ?? '') ?: null,
            'scope' => ($net['info_scope'] ?? '') ?: null,
            'policy' => ($net['policy_general'] ?? '') ?: null,
            'irrAsSet' => ($net['irr_as_set'] ?? '') ?: null,
            'ixCount' => $net['ix_count'] ?? null,
            'facCount' => $net['fac_count'] ?? null,
            'updated' => $net['updated'] ?? null,
        ] : null,
        'peeringdbFailed' => $d['peeringdb'] === null,
        'hygieneFailed' => $d['irr'] === null,
        'settings' => 'Routing data from RIPEstat (RIPE NCC route collectors), network details from PeeringDB, RPKI and IRR from NLNOG IRR Explorer',
    ];
}

function toolPrefix(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    [$resource, $host] = routeResource();
    $o = needRipestat(ripestatData(fetchJson(['o' => ripestat('prefix-overview', ['resource' => $resource])], BGP_CACHE_SECONDS)['o']));
    $base = ['via' => 'ripestat', 'query' => $resource, 'host' => $host, 'prefix' => $o['resource'] ?? $resource, 'announced' => (bool) ($o['announced'] ?? false),
        'block' => $o['block'] ?? null, 'settings' => 'Routing data from RIPEstat (RIPE NCC route collectors), RPKI from RIPEstat’s validator'];
    if (!$base['announced']) {
        return $base + ['origins' => [], 'visibility' => null, 'firstSeen' => null, 'lessSpecifics' => [], 'moreSpecifics' => [], 'rpki' => [], 'paths' => null];
    }
    $prefix = $base['prefix'];
    $origins = array_slice($o['asns'] ?? [], 0, 4);
    $urls = ['status' => ripestat('routing-status', ['resource' => $prefix]), 'state' => ripestat('bgp-state', ['resource' => $prefix])];
    foreach ($origins as $origin) {
        $urls["rpki{$origin['asn']}"] = ripestat('rpki-validation', ['resource' => "AS{$origin['asn']}", 'prefix' => $prefix]);
    }
    $d = fetchJson($urls, BGP_CACHE_SECONDS);
    $status = ripestatData($d['status']);

    // Every collector peer's path to the prefix: how many there are, which ones are most common, and which
    // networks carry the prefix just before its origin (the origin's upstreams, as the internet sees them).
    $paths = null;
    $state = ripestatData($d['state']);
    if ($state !== null) {
        $count = [];
        $upstreams = [];
        foreach ($state['bgp_state'] ?? [] as $route) {
            $path = cleanPath($route['path'] ?? []);
            if (!$path) {
                continue;
            }
            $key = implode(' ', $path);
            $count[$key] = ($count[$key] ?? 0) + 1;
            if (count($path) > 1) {
                $up = $path[count($path) - 2];
                $upstreams[$up] = ($upstreams[$up] ?? 0) + 1;
            }
        }
        arsort($count);
        arsort($upstreams);
        $upstreams = array_slice($upstreams, 0, 15, true);
        $names = asNames(array_keys($upstreams));
        $paths = [
            'total' => array_sum($count),
            'unique' => count($count),
            'upstreams' => array_map(fn ($asn, $n) => ['asn' => $asn, 'name' => $names[$asn]['name'] ?? null, 'paths' => $n], array_keys($upstreams), $upstreams),
            'top' => array_map(fn ($key, $n) => ['path' => array_map('intval', explode(' ', (string) $key)), 'peers' => $n], array_keys(array_slice($count, 0, 20, true)), array_slice($count, 0, 20, true)),
        ];
    }

    $rpki = [];
    foreach ($origins as $origin) {
        $v = ripestatData($d["rpki{$origin['asn']}"]);
        $rpki[] = ['asn' => $origin['asn'], 'status' => $v['status'] ?? null,
            'roas' => array_map(fn ($r) => ['asn' => (int) $r['origin'], 'prefix' => $r['prefix'], 'maxLength' => $r['max_length'], 'validity' => $r['validity']], $v['validating_roas'] ?? [])];
    }
    $vis = fn (string $af) => isset($status['visibility'][$af]) && $status['visibility'][$af]['total_ris_peers'] > 0
        ? ['seeing' => $status['visibility'][$af]['ris_peers_seeing'], 'total' => $status['visibility'][$af]['total_ris_peers']] : null;
    return $base + [
        'origins' => array_map(fn ($a) => ['asn' => $a['asn'], 'holder' => $a['holder'] ?? null], $origins),
        'visibility' => $vis(str_contains($prefix, ':') ? 'v6' : 'v4'),
        'firstSeen' => isset($status['first_seen']['time']) ? ['time' => $status['first_seen']['time'], 'origin' => (int) $status['first_seen']['origin']] : null,
        'lessSpecifics' => array_slice($status['less_specifics'] ?? [], 0, 30),
        'moreSpecifics' => array_slice($status['more_specifics'] ?? [], 0, 50),
        'moreSpecificsTotal' => count($status['more_specifics'] ?? []),
        'rpki' => $rpki,
        'paths' => $paths,
    ];
}

function toolLookingGlass(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    [$resource, $host] = routeResource();
    $data = needRipestat(ripestatData(fetchJson(['lg' => ripestat('looking-glass', ['resource' => $resource])], BGP_CACHE_SECONDS)['lg']));
    $collectors = [];
    foreach ($data['rrcs'] ?? [] as $rrc) {
        $peers = array_map(fn ($p) => [
            'peer' => $p['peer'],
            'path' => array_map('intval', array_values(array_filter(explode(' ', (string) $p['as_path']), 'ctype_digit'))),
            'prefix' => $p['prefix'],
            'origin' => $p['origin'],
            'nextHop' => $p['next_hop'],
            'communities' => trim(($p['community'] ?? '') . ' ' . ($p['largeCommunity'] ?? '')),
            'updated' => $p['last_updated'] ?? null,
        ], $rrc['peers'] ?? []);
        usort($peers, fn ($a, $b) => count($a['path']) <=> count($b['path']) ?: ($a['path'][0] ?? 0) <=> ($b['path'][0] ?? 0));
        $collectors[] = ['rrc' => $rrc['rrc'], 'location' => $rrc['location'], 'peers' => $peers];
    }
    usort($collectors, fn ($a, $b) => strnatcmp($a['rrc'], $b['rrc']));
    $prefix = $collectors[0]['peers'][0]['prefix'] ?? null;
    return [
        'via' => 'ripestat',
        'query' => $resource,
        'host' => $host,
        'prefix' => $prefix,
        'collectors' => $collectors,
        'peers' => array_sum(array_map(fn ($c) => count($c['peers']), $collectors)),
        'settings' => 'Current routes at RIPE NCC’s RIS route collectors (RIPEstat looking glass)',
    ];
}

// ---------------------------------------------------------------------------
// Announcement check: everything that decides whether the internet accepts and carries a prefix from an AS, in
// one run. BGP state and history come from RIPEstat, IRR route objects from NLNOG's IRR Explorer (every major
// IRR at once), RPKI from RIPEstat's validator. It also works before a prefix is announced, as a pre-flight check.
// ---------------------------------------------------------------------------

const HISTORY_DAYS = 30;

/** "203.0.113.5/24" as "203.0.113.0/24": the network address of a prefix, with host bits cleared. */
function networkPrefix(string $ip, int $len): string
{
    $bin = (string) inet_pton($ip);
    $out = '';
    for ($i = 0; $i < strlen($bin); $i++) {
        $bits = max(0, min(8, $len - 8 * $i));
        $out .= chr(ord($bin[$i]) & ((0xff << (8 - $bits)) & 0xff));
    }
    return inet_ntop($out) . "/{$len}";
}

/** Whether $inner is $outer or lies inside it. */
function prefixWithin(string $inner, string $outer): bool
{
    [$ip, $len] = explode('/', $inner) + [1 => '-1'];
    [$oip, $olen] = explode('/', $outer) + [1 => '-1'];
    return isIp($ip) && isIp($oip) && isIpv4($ip) === isIpv4($oip) && (int) $len >= (int) $olen && inCidr($ip, $outer);
}

/** How a prefix's length fares in the filters most networks run: /24 for IPv4 and /48 for IPv6 at the most. */
function prefixSizeCheck(string $prefix): array
{
    [$ip, $len] = explode('/', $prefix);
    $v4 = isIpv4($ip);
    $max = $v4 ? 24 : 48;
    return (int) $len > $max
        ? ['area' => 'size', 'level' => 'issue', 'text' => "A /{$len} is longer than /{$max}. Most networks filter " . ($v4 ? 'IPv4' : 'IPv6') . " prefixes longer than /{$max}, so it will not reach most of the internet. Announce the covering /{$max} (or a shorter prefix) instead."]
        : ['area' => 'size', 'level' => 'pass', 'text' => "A /{$len} is within what networks accept (" . ($v4 ? 'IPv4' : 'IPv6') . " prefixes up to /{$max})."];
}

/** What RPKI says about one origin AS, as a check. */
function rpkiCheck(int $asn, ?array $v): array
{
    $roas = $v['validating_roas'] ?? [];
    $max = $roas ? max(array_map(fn ($r) => (int) $r['max_length'], array_filter($roas, fn ($r) => (int) $r['origin'] === $asn) ?: $roas)) : null;
    return match ($v['status'] ?? null) {
        'valid' => ['area' => 'rpki', 'level' => 'pass', 'text' => "RPKI valid: a ROA allows AS{$asn} to announce it (max length /{$max})."],
        'invalid_asn' => ['area' => 'rpki', 'level' => 'issue', 'text' => "RPKI invalid for AS{$asn}: ROAs cover this prefix, but none allows AS{$asn}. Networks that validate RPKI, which includes most large transit providers, drop the route. Create a ROA for AS{$asn} in your RIR’s portal."],
        'invalid_length' => ['area' => 'rpki', 'level' => 'issue', 'text' => "RPKI invalid for AS{$asn}: a ROA allows AS{$asn}, but only up to /{$max}, and this prefix is more specific. Networks that validate RPKI drop it. Raise the ROA’s max length or add a ROA for this exact prefix."],
        'unknown' => ['area' => 'rpki', 'level' => 'info', 'text' => "No ROA covers this prefix (RPKI “not found”). Networks accept the route, but nothing protects it against hijacks. A ROA for AS{$asn} is recommended."],
        default => ['area' => 'rpki', 'level' => 'failed', 'text' => "RIPEstat’s RPKI validator did not answer for AS{$asn}, so RPKI was not checked. Try again in a minute."],
    };
}

/**
 * Route objects for the prefix from IRR Explorer's answer: those for exactly this prefix, and those of covering
 * prefixes. @return array{exact: list<array{source: string, asn: int}>, covering: list<array{prefix: string, source: string, asn: int}>}
 */
function irrObjects(array $answer, string $prefix): array
{
    $exact = [];
    $covering = [];
    foreach ($answer as $entry) {
        $p = (string) ($entry['prefix'] ?? '');
        $isExact = $p === $prefix;
        if (!$isExact && !($p !== '' && prefixWithin($prefix, $p))) {
            continue;
        }
        foreach ($entry['irrRoutes'] ?? [] as $source => $routes) {
            foreach ($routes as $route) {
                $row = ['source' => (string) $source, 'asn' => (int) $route['asn']];
                if ($isExact) {
                    $exact[] = $row;
                } else {
                    $covering[] = ['prefix' => $p] + $row;
                }
            }
        }
    }
    $key = fn ($r) => ($r['prefix'] ?? '') . $r['source'] . $r['asn'];
    $unique = fn (array $rows) => array_values(array_combine(array_map($key, $rows), $rows) ?: []);
    return ['exact' => $unique($exact), 'covering' => $unique($covering)];
}

/** What the IRR says about one origin AS, as a check. */
function irrCheck(int $asn, ?array $irr, string $prefix): array
{
    if ($irr === null) {
        return ['area' => 'irr', 'level' => 'failed', 'text' => 'IRR Explorer did not answer, so route objects were not checked. Try again in a minute.'];
    }
    $mine = array_values(array_filter($irr['exact'], fn ($r) => $r['asn'] === $asn));
    if ($mine) {
        return ['area' => 'irr', 'level' => 'pass', 'text' => "A route object for {$prefix} with origin AS{$asn} is registered in " . implode(', ', array_unique(array_column($mine, 'source'))) . '.'];
    }
    $object = str_contains($prefix, ':') ? 'route6' : 'route';
    if ($irr['exact']) {
        $others = implode(', ', array_unique(array_map(fn ($r) => "AS{$r['asn']}", $irr['exact'])));
        return ['area' => 'irr', 'level' => 'issue', 'text' => "Route objects for {$prefix} exist only for {$others}. Upstreams and route servers that filter on IRR data will reject it from AS{$asn}. Register a {$object} object with origin AS{$asn}."];
    }
    $cover = array_values(array_filter($irr['covering'], fn ($r) => $r['asn'] === $asn));
    return $cover
        ? ['area' => 'irr', 'level' => 'issue', 'text' => "No route object for exactly {$prefix}; only the covering {$cover[0]['prefix']} has one for AS{$asn}. Filters built from the IRR usually need an exact match, so register a {$object} object for {$prefix} too."]
        : ['area' => 'irr', 'level' => 'issue', 'text' => "No IRR route object for {$prefix} with origin AS{$asn}. Many upstreams and internet exchange route servers build their filters from IRR data and will drop the route. Register a {$object} object in your RIR’s database."];
}

/**
 * Who originated the prefix over the last HISTORY_DAYS days, as segments of time with the number of full-table
 * RIS peers that saw it. Only the exact prefix counts; RIPEstat also returns covering and more specific ones.
 */
function originHistory(?array $data, string $prefix): ?array
{
    if ($data === null) {
        return null;
    }
    $origins = [];
    foreach ($data['by_origin'] ?? [] as $o) {
        foreach ($o['prefixes'] ?? [] as $p) {
            if (($p['prefix'] ?? '') !== $prefix) {
                continue;
            }
            $segments = array_map(fn ($t) => ['start' => $t['starttime'] . 'Z', 'end' => $t['endtime'] . 'Z', 'peers' => (int) round($t['full_peers_seeing'])], $p['timelines'] ?? []);
            $origins[] = ['asn' => (int) $o['origin'], 'segments' => $segments];
        }
    }
    $max = $data['latest_max_ff_peers'][str_contains($prefix, ':') ? 'v6' : 'v4'] ?? null;
    return ['start' => ($data['query_starttime'] ?? '') . 'Z', 'end' => ($data['query_endtime'] ?? '') . 'Z', 'maxPeers' => $max, 'origins' => $origins];
}

/** Checks on the history: other origins in the window, and gaps when the prefix was not announced. */
function historyChecks(array $history, array $current): array
{
    $checks = [];
    $others = array_values(array_filter($history['origins'], fn ($o) => !in_array($o['asn'], $current, true)));
    foreach ($others as $o) {
        $from = substr($o['segments'][0]['start'] ?? '', 0, 10);
        $to = substr(end($o['segments'])['end'] ?? '', 0, 10);
        $checks[] = ['area' => 'history', 'level' => 'issue', 'text' => "AS{$o['asn']} also originated this prefix between {$from} and {$to}. If that was not a planned move between providers, it may have been a hijack or a leak."];
    }
    $start = strtotime($history['start']);
    $end = strtotime($history['end']);
    $mine = array_values(array_filter($history['origins'], fn ($o) => in_array($o['asn'], $current, true)));
    if ($mine && $start && $end) {
        $spans = [];
        foreach ($mine as $o) {
            foreach ($o['segments'] as $s) {
                $spans[] = [strtotime($s['start']), strtotime($s['end'])];
            }
        }
        usort($spans, fn ($a, $b) => $a[0] <=> $b[0]);
        // Count gaps longer than one RIPEstat time step (8 hours) between the spans the prefix was seen.
        $gaps = 0;
        $missing = 0;
        $cursor = $start;
        $firstSeen = $spans[0][0];
        foreach ($spans as [$a, $b]) {
            if ($a - $cursor > 8 * 3600 && $cursor > $start) {
                $gaps++;
                $missing += $a - $cursor;
            }
            $cursor = max($cursor, $b + 1);
        }
        $days = HISTORY_DAYS;
        if ($firstSeen - $start > 8 * 3600) {
            $checks[] = ['area' => 'history', 'level' => 'info', 'text' => 'First announced on ' . gmdate('Y-m-d', $firstSeen) . ", within the last {$days} days."];
        }
        $checks[] = $gaps
            ? ['area' => 'history', 'level' => 'issue', 'text' => "It dropped out of the routing table {$gaps} " . ($gaps === 1 ? 'time' : 'times') . " in the last {$days} days, for about " . max(1, (int) round($missing / 3600)) . ' hours in total.']
            : ['area' => 'history', 'level' => 'pass', 'text' => "Announced without interruption " . ($firstSeen - $start > 8 * 3600 ? 'since then' : "for the last {$days} days") . '.'];
    }
    return $checks;
}

function toolAnnounce(): array
{
    rateLimit('light', LIGHT_PER_MINUTE);
    [$resource, $host] = routeResource();
    $expected = param('asn', 32) !== '' ? asnParam() : null;
    if ($expected !== null && asnSpecial($expected) !== null) {
        fail(asnSpecial($expected));
    }

    // A prefix is checked as given (so a planned one can be checked); an address is checked as the prefix that covers it.
    if (str_contains($resource, '/')) {
        [$ip, $len] = explode('/', $resource);
        $prefix = networkPrefix($ip, (int) $len);
    } else {
        $o = needRipestat(ripestatData(fetchJson(['o' => ripestat('prefix-overview', ['resource' => $resource])], BGP_CACHE_SECONDS)['o']));
        if (!($o['announced'] ?? false)) {
            fail("No route covers {$resource} right now. To check a prefix before you announce it, enter the prefix itself, like 203.0.113.0/24, and the AS that will announce it.", 422);
        }
        $prefix = (string) $o['resource'];
    }

    $d = fetchJson([
        'status' => ripestat('routing-status', ['resource' => $prefix]),
        'visibility' => ripestat('visibility', ['resource' => $prefix]),
        'history' => ripestat('routing-history', ['resource' => $prefix, 'starttime' => gmdate('Y-m-d\T00:00', time() - HISTORY_DAYS * 86400)]),
        'irr' => 'https://irrexplorer.nlnog.net/api/prefixes/prefix/' . $prefix,
    ], BGP_CACHE_SECONDS, 20);
    $status = needRipestat(ripestatData($d['status']));
    $origins = array_values(array_unique(array_map(fn ($o) => (int) $o['origin'], $status['origins'] ?? [])));
    $announced = (bool) $origins;
    $checkAs = array_slice($expected !== null ? [$expected] : $origins, 0, 4);

    $rpkiAnswers = $checkAs ? fetchJson(array_combine(
        array_map(fn ($a) => "AS{$a}", $checkAs),
        array_map(fn ($a) => ripestat('rpki-validation', ['resource' => "AS{$a}", 'prefix' => $prefix]), $checkAs),
    ), BGP_CACHE_SECONDS, 25) : [];
    $irr = is_array($d['irr']) && array_is_list($d['irr']) ? irrObjects($d['irr'], $prefix) : null;

    $checks = [prefixSizeCheck($prefix)];

    // Who announces it, against who should.
    $list = fn (array $asns) => implode(', ', array_map(fn ($a) => "AS{$a}", $asns));
    $checks[] = match (true) {
        !$announced && $expected !== null => ['area' => 'origin', 'level' => 'info', 'text' => "{$prefix} is not in the global routing table. The checks below show whether networks will accept it once AS{$expected} announces it."],
        !$announced => ['area' => 'origin', 'level' => 'inconclusive', 'text' => "{$prefix} is not in the global routing table. Enter the AS that will announce it to check RPKI and IRR before you go live."],
        $expected !== null && !in_array($expected, $origins, true) => ['area' => 'origin', 'level' => 'issue', 'text' => "Announced by {$list($origins)}, not AS{$expected}. If you did not authorise " . (count($origins) === 1 ? 'that network' : 'those networks') . ', this may be a hijack or an announcement left behind after a move.'],
        count($origins) > 1 => ['area' => 'origin', 'level' => 'issue', 'text' => "Announced by " . count($origins) . " networks at once: {$list($origins)}. Several origins (MOAS) can be intended, for anycast or during a move between providers, or can be a hijack. Check that every one is expected."],
        $expected !== null => ['area' => 'origin', 'level' => 'pass', 'text' => "Announced by AS{$expected}, as expected."],
        default => ['area' => 'origin', 'level' => 'info', 'text' => "Announced by AS{$origins[0]}. Enter the AS you expect to check that it is the right one."],
    };

    $rpki = [];
    foreach ($checkAs as $asn) {
        $v = ripestatData($rpkiAnswers["AS{$asn}"] ?? null);
        $checks[] = rpkiCheck($asn, $v);
        $rpki[] = ['asn' => $asn, 'status' => $v['status'] ?? null,
            'roas' => array_map(fn ($r) => ['asn' => (int) $r['origin'], 'prefix' => $r['prefix'], 'maxLength' => (int) $r['max_length'], 'validity' => $r['validity']], $v['validating_roas'] ?? [])];
    }
    foreach ($checkAs as $asn) {
        $checks[] = irrCheck($asn, $irr, $prefix);
    }

    // Visibility: the share of RIS full-table peers that carry it, collector by collector.
    $visibility = null;
    $af = str_contains($prefix, ':') ? 'ipv6' : 'ipv4';
    $vis = ripestatData($d['visibility']);
    if ($announced && $vis !== null) {
        $collectors = [];
        $missingAsns = [];
        foreach ($vis['visibilities'] ?? [] as $c) {
            $total = (int) ($c["{$af}_full_table_peer_count"] ?? 0);
            if ($total === 0) {
                continue;
            }
            $notSeeing = array_map(fn ($p) => ['asn' => (int) $p['asn'], 'ip' => $p['ip']], $c["{$af}_full_table_peers_not_seeing"] ?? []);
            array_push($missingAsns, ...array_column($notSeeing, 'asn'));
            $collectors[] = ['rrc' => $c['probe']['name'], 'city' => $c['probe']['city'] ?? null, 'country' => $c['probe']['country'] ?? null,
                'ixp' => $c['probe']['ixp'] ?? null, 'total' => $total, 'notSeeing' => $notSeeing];
        }
        $names = asNames($missingAsns);
        foreach ($collectors as &$c) {
            foreach ($c['notSeeing'] as &$p) {
                $p['name'] = $names[$p['asn']]['name'] ?? null;
            }
        }
        unset($c, $p);
        $total = array_sum(array_column($collectors, 'total'));
        $missing = array_sum(array_map(fn ($c) => count($c['notSeeing']), $collectors));
        $visibility = ['seeing' => $total - $missing, 'total' => $total, 'collectors' => $collectors];
        if ($total > 0) {
            $share = ($total - $missing) / $total;
            $pct = (int) round($share * 100);
            $invalid = (bool) array_filter($rpki, fn ($x) => str_starts_with((string) $x['status'], 'invalid'));
            $checks[] = match (true) {
                $share >= 0.95 => ['area' => 'visibility', 'level' => 'pass', 'text' => "Seen by {$pct}% of full-table RIS peers ({$visibility['seeing']} of {$total}): it reaches essentially the whole internet."],
                default => ['area' => 'visibility', 'level' => 'issue', 'text' => "Seen by only {$pct}% of full-table RIS peers ({$visibility['seeing']} of {$total}), so parts of the internet have no route to it." . ($invalid ? ' That fits the RPKI result: networks that validate RPKI drop invalid routes.' : ' Check the RPKI and IRR results above; a filter at an upstream is the usual cause.')],
            };
        }
    }

    $history = $announced ? originHistory(ripestatData($d['history']), $prefix) : null;
    if ($history !== null) {
        // The origin check already judges the current origins, so history only reports others.
        array_push($checks, ...historyChecks($history, array_values(array_unique(array_merge($origins, $expected !== null ? [$expected] : [])))));
        $names = asNames(array_column($history['origins'], 'asn'));
        foreach ($history['origins'] as &$o) {
            $o['name'] = $names[$o['asn']]['name'] ?? null;
        }
        unset($o);
    } elseif ($announced) {
        $checks[] = ['area' => 'history', 'level' => 'failed', 'text' => 'RIPEstat did not return the routing history, so recent changes were not checked.'];
    }

    // Other announcements inside it, and the prefix that would catch its traffic if it were withdrawn.
    $own = $expected !== null ? [$expected] : $origins;
    $more = array_map(fn ($m) => ['prefix' => $m['prefix'], 'origin' => (int) $m['origin']], $status['more_specifics'] ?? []);
    $foreign = array_values(array_filter($more, fn ($m) => !in_array($m['origin'], $own, true)));
    if ($foreign) {
        $checks[] = ['area' => 'specifics', 'level' => 'issue', 'text' => count($foreign) . ' more specific ' . (count($foreign) === 1 ? 'prefix is' : 'prefixes are') . " announced inside it by other networks (" . $list(array_slice(array_unique(array_column($foreign, 'origin')), 0, 5)) . '). Traffic for those addresses goes to them, because routers prefer the most specific route. If they are not your customers, this may be a hijack.'];
    } elseif ($more) {
        $checks[] = ['area' => 'specifics', 'level' => 'info', 'text' => count($more) . ' more specific ' . (count($more) === 1 ? 'prefix is' : 'prefixes are') . ' announced inside it by the same AS, usually for traffic engineering.'];
    } elseif ($announced) {
        $checks[] = ['area' => 'specifics', 'level' => 'pass', 'text' => 'No other network announces a more specific prefix inside it.'];
    }
    $less = array_map(fn ($l) => ['prefix' => $l['prefix'], 'origin' => (int) $l['origin']], $status['less_specifics'] ?? []);

    $names = asNames(array_merge($origins, $checkAs));
    return [
        'via' => 'ripestat',
        'query' => $resource,
        'host' => $host,
        'prefix' => $prefix,
        'expected' => $expected,
        'announced' => $announced,
        'origins' => array_map(fn ($a) => ['asn' => $a, 'name' => $names[$a]['name'] ?? null], $origins),
        'expectedName' => $expected !== null ? ($names[$expected]['name'] ?? null) : null,
        'checks' => $checks,
        'rpki' => $rpki,
        'irr' => $irr,
        'visibility' => $visibility,
        'history' => $history,
        'moreSpecifics' => array_slice($more, 0, 100),
        'moreSpecificsTotal' => count($more),
        'lessSpecifics' => array_slice($less, 0, 20),
        'settings' => 'BGP state and history from RIPEstat (RIPE NCC route collectors), IRR from NLNOG IRR Explorer, RPKI from RIPEstat’s validator',
    ];
}

// ---------------------------------------------------------------------------

const TOOLS = [
    'myip' => 'toolMyIp', 'ping' => 'toolPing', 'traceroute' => 'toolTraceroute', 'mtr' => 'toolMtr', 'port' => 'toolPort', 'ports' => 'toolPorts',
    'reverse' => 'toolReverse', 'proxy' => 'toolProxy', 'bandwidth' => 'toolBandwidth', 'dns' => 'toolDns',
    'mx' => 'toolMx', 'ns' => 'toolNs', 'dnssec' => 'toolDnssec', 'spf' => 'toolSpf', 'dmarc' => 'toolDmarc', 'dkim' => 'toolDkim',
    'smtp' => 'toolSmtp', 'mailpolicy' => 'toolMailPolicy', 'tls' => 'toolTls', 'whois' => 'toolWhois', 'blacklist' => 'toolBlacklist',
    'asn' => 'toolAsn', 'prefix' => 'toolPrefix', 'lg' => 'toolLookingGlass', 'announce' => 'toolAnnounce',
];

if (!defined('PINGOMNI_TEST')) {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        respond(['ok' => false, 'error' => 'Only GET is supported.'], 405);
    }
    $tool = (string) ($_GET['tool'] ?? '');
    if (!isset(TOOLS[$tool])) {
        respond(['ok' => false, 'error' => 'Unknown tool.'], 404);
    }
    try {
        $result = (TOOLS[$tool])();
    } catch (ToolFailure $e) {
        if ($e->retryAfter !== null) {
            header('Retry-After: ' . $e->retryAfter);
        }
        respond(['ok' => false, 'error' => $e->getMessage()] + ($e->retryAfter !== null ? ['retryAfter' => $e->retryAfter] : []), $e->status);
    }
    respond(['ok' => true, 'measuredAt' => gmdate('Y-m-d\TH:i:s\Z'), 'origin' => ['location' => SERVER_LOCATION]] + $result);
}
