<?php

// Tests for the API's parsing and judgement: no network needed. Run with `npm test`, or
// `php tests/api.test.php path/to/index.php` to test another copy of the API.

declare(strict_types=1);

const PINGOMNI_TEST = true;
require $argv[1] ?? __DIR__ . '/../api/index.php';

$failed = 0;
$passed = 0;

function check(string $name, bool $ok): void
{
    global $failed, $passed;
    if ($ok) {
        $passed++;
        return;
    }
    $failed++;
    fwrite(STDERR, "FAIL: {$name}\n");
}

function same(string $name, mixed $actual, mixed $expected): void
{
    check($name . ' (got ' . json_encode($actual) . ')', $actual === $expected);
}

// --- Addresses this server must never reach ---------------------------------
foreach (['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '100.64.0.1', '169.254.1.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '192.0.2.1', '198.18.0.1', '::1', '::', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a00:1', '2002:a00:1::1', '2001:0:a00:1::1',
    'fe80::1', 'fd00::1', 'ff02::1', '2001:db8::1'] as $ip) {
    same("isPublicIp({$ip})", isPublicIp($ip), false);
}
foreach (['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2a00:1450:4001::1'] as $ip) {
    same("isPublicIp({$ip})", isPublicIp($ip), true);
}

// --- Input normalisation ---------------------------------------------------
same('normalizeHost strips scheme, path and port', normalizeHost('https://Example.COM:8443/path'), 'example.com');
same('normalizeHost keeps IPv6', normalizeHost('2001:db8::1'), '2001:db8::1');
same('normalizeHost unwraps [IPv6]:port', normalizeHost('[2001:db8::1]:443'), '2001:db8::1');
same('normalizeHost takes the domain of an email address', normalizeHost('user@example.com'), 'example.com');
same('arpaName v4', arpaName('8.8.4.4'), '4.4.8.8.in-addr.arpa');
same('arpaName v6', substr(arpaName('2001:db8::1'), 0, 8), '1.0.0.0.');

// --- dig output ------------------------------------------------------------
$nx = <<<'DIG'
; <<>> DiG 9.18.39 <<>> -q nope.example -t A
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 1
;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1

;; AUTHORITY SECTION:
example.		300	IN	SOA	ns.icann.org. noc.dns.icann.org. 2024 7200 3600 1209600 3600

;; Query time: 41 msec
;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)
DIG;
$r = parseDig($nx);
same('NXDOMAIN status', outcome($r, 'A'), 'nxdomain');
same('server and time', [$r['server'], $r['ms']], ['127.0.0.53', 41]);
same('authority kept apart from answers', [count($r['answers']), count($r['authority'])], [0, 1]);

$txt = <<<'DIG'
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 2
;; flags: qr rd ra ad; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1

;; ANSWER SECTION:
www.example.com.	60	IN	CNAME	example.com.
example.com.	300	IN	TXT	"v=spf1 include:_spf.example.net " "-all"
example.com.	300	IN	TXT	"say \"hi\" \059 ok"
DIG;
$r = parseDig($txt);
same('TXT strings joined', answersOf($r, 'TXT')[0]['value'], 'v=spf1 include:_spf.example.net -all');
same('TXT escapes decoded', answersOf($r, 'TXT')[1]['value'], 'say "hi" ; ok');
same('CNAME trailing dot removed', answersOf($r, 'CNAME')[0]['value'], 'example.com');
same('AD flag read', in_array('ad', $r['flags'], true), true);
same('nodata', outcome(parseDig(";; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 3\n;; flags: qr rd ra;"), 'MX'), 'nodata');
same('no header means timeout', outcome(parseDig(";; connection timed out; no servers could be reached"), 'A'), 'timeout');
same('SERVFAIL', outcome(parseDig(";; ->>HEADER<<- opcode: QUERY, status: SERVFAIL, id: 4"), 'A'), 'servfail');

$mx = parseDig(";; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 5\n\n;; ANSWER SECTION:\nexample.com.\t300\tIN\tMX\t0 .\n");
same('null MX keeps its dot', answersOf($mx, 'MX')[0]['value'], '0 .');
same('null MX parts', mxParts('0 .'), [0, '']);
same('MX parts', mxParts('10 Mail.Example.com.'), [10, 'mail.example.com']);

// --- SOA ---------------------------------------------------------------------
same('SOA contact', soaEmail('dns\\.admin.example.com.'), 'dns.admin@example.com');
same('SOA fields', soaFields('ns1.example.com hostmaster.example.com 2024010101 7200 900 1209600 300')['contact'], 'hostmaster@example.com');

// --- SPF ---------------------------------------------------------------------
same('SPF records picked from TXT', spfRecords(['google-site-verification=x', 'v=spf1 -all', 'v=spf10 nope']), ['v=spf1 -all']);
$p = parseSpf('v=spf1 ip4:192.0.2.0/24 include:_spf.example.net mx ~all');
same('SPF all qualifier', $p['all'], '~');
same('SPF lookup terms', array_column(array_filter($p['terms'], fn ($t) => $t['lookup']), 'name'), ['include', 'mx']);
same('SPF valid record has no problems', array_filter(array_column($p['terms'], 'problem')), []);
$bad = parseSpf('v=spf1 ip4:1.2.3.4/33 include: foo -all a');
same('SPF bad ip4', $bad['terms'][0]['problem'] !== null, true);
same('SPF empty include', $bad['terms'][1]['problem'] !== null, true);
same('SPF unknown mechanism', str_contains((string) $bad['terms'][2]['problem'], 'not an SPF mechanism'), true);
same('SPF term after all', str_contains((string) $bad['terms'][4]['problem'], 'after “all”'), true);
same('SPF redirect is a lookup', parseSpf('v=spf1 redirect=_spf.example.com')['redirect'], '_spf.example.com');

// --- DMARC -------------------------------------------------------------------
same('DMARC tags', tagList('v=DMARC1; p=reject; rua=mailto:a@example.com'), ['v' => 'DMARC1', 'p' => 'reject', 'rua' => 'mailto:a@example.com']);
same('valid DMARC', dmarcProblems('v=DMARC1; p=quarantine; pct=50; rua=mailto:d@example.com!10m', tagList('v=DMARC1; p=quarantine; pct=50; rua=mailto:d@example.com!10m')), []);
same('DMARC without p', count(dmarcProblems('v=DMARC1; rua=mailto:a@example.com', tagList('v=DMARC1; rua=mailto:a@example.com'))), 1);
same('DMARC bad values', count(dmarcProblems('v=DMARC1; p=block; pct=200; adkim=x; rua=a@example.com', tagList('v=DMARC1; p=block; pct=200; adkim=x; rua=a@example.com'))), 4);
same('DMARC v not first', count(dmarcProblems('p=none; v=DMARC1', tagList('p=none; v=DMARC1'))), 1);

// --- Blacklist answers ------------------------------------------------------
$answer = fn (string $status, array $codes = []) => ['status' => $status, 'answers' => array_map(fn ($c) => ['name' => 'x', 'ttl' => 1, 'type' => 'A', 'value' => $c], $codes)];
same('not listed', listAnswer($answer('NXDOMAIN'), false)[0], 'not_listed');
same('listed', listAnswer($answer('NOERROR', ['127.0.0.2']), false)[0], 'listed');
same('Spamhaus refusal is blocked, not listed', listAnswer($answer('NOERROR', ['127.255.255.254']), false)[0], 'blocked');
same('URIBL refusal is blocked', listAnswer($answer('NOERROR', ['127.0.0.1']), true)[0], 'blocked');
same('SERVFAIL is unavailable, not clean', listAnswer($answer('SERVFAIL'), false)[0], 'unavailable');
same('timeout is unavailable', listAnswer($answer('TIMEOUT'), false)[0], 'unavailable');
same('a public address as answer is invalid', listAnswer($answer('NOERROR', ['8.8.8.8']), false)[0], 'invalid');

// --- BGP input and paths -----------------------------------------------------
/** What a parameter reader returns for one value, or the error text it fails with. */
$given = function (string $name, string $value, callable $read) {
    $_GET = [$name => $value];
    try {
        return $read();
    } catch (ToolFailure $e) {
        return 'error: ' . $e->getMessage();
    }
};
same('AS number with prefix', $given('asn', 'AS15169', 'asnParam'), 15169);
same('AS number lower case with space', $given('asn', 'as 3269', 'asnParam'), 3269);
same('bare AS number', $given('asn', '4200000001', 'asnParam'), 4200000001);
same('AS number above 32 bits refused', str_starts_with($given('asn', '4294967296', 'asnParam'), 'error'), true);
same('IP given as an AS number points to prefix lookup', str_contains($given('asn', '8.8.8.8', 'asnParam'), 'Prefix lookup'), true);
same('prefix kept', $given('resource', '8.8.8.0/24', 'routeResource'), ['8.8.8.0/24', null]);
same('IPv6 prefix lower-cased', $given('resource', '2001:4860::/32', 'routeResource'), ['2001:4860::/32', null]);
same('IP kept', $given('resource', '1.1.1.1', 'routeResource'), ['1.1.1.1', null]);
same('prefix length out of range', str_starts_with($given('resource', '8.8.8.0/33', 'routeResource'), 'error'), true);
same('private prefix refused', str_contains($given('resource', '10.0.0.0/8', 'routeResource'), 'not routed'), true);
same('documentation address refused', str_contains($given('resource', '203.0.113.5', 'routeResource'), 'not routed'), true);
$_GET = [];
same('private AS explained', str_contains((string) asnSpecial(64512), 'private'), true);
same('32-bit private AS explained', str_contains((string) asnSpecial(4200000001), 'private'), true);
same('documentation AS explained', str_contains((string) asnSpecial(64500), 'documentation'), true);
same('AS_TRANS explained', str_contains((string) asnSpecial(23456), 'AS_TRANS'), true);
same('ordinary AS is not special', asnSpecial(15169), null);
same('prepends collapsed, AS sets dropped', cleanPath([3356, 3356, 3356, [64500, 64501], 15169, 15169]), [3356, 15169]);
$prefixes = ['2a01:2000::/20', '8.8.8.0/24', '2.112.0.0/15', '8.8.0.0/16', '2001:db8::/32'];
usort($prefixes, fn ($a, $b) => strcmp(prefixKey($a), prefixKey($b)));
same('prefixes sorted IPv4 first, by address, then length', $prefixes, ['2.112.0.0/15', '8.8.0.0/16', '8.8.8.0/24', '2001:db8::/32', '2a01:2000::/20']);

// --- Announcement check ----------------------------------------------------
same('host bits cleared', networkPrefix('203.0.113.77', 24), '203.0.113.0/24');
same('host bits cleared in IPv6', networkPrefix('2001:db8:1:2::1', 32), '2001:db8::/32');
same('prefix inside its cover', prefixWithin('193.0.0.0/24', '193.0.0.0/21'), true);
same('prefix within itself', prefixWithin('193.0.0.0/21', '193.0.0.0/21'), true);
same('cover is not within the more specific', prefixWithin('193.0.0.0/21', '193.0.0.0/24'), false);
same('families never overlap', prefixWithin('2001:db8::/32', '0.0.0.0/0'), false);
same('/24 accepted', prefixSizeCheck('8.8.8.0/24')['level'], 'pass');
same('/25 filtered', prefixSizeCheck('8.8.8.0/25')['level'], 'issue');
same('/48 accepted', prefixSizeCheck('2001:4860:1::/48')['level'], 'pass');
same('/49 filtered', prefixSizeCheck('2001:4860:1::/49')['level'], 'issue');
$irrAnswer = [
    ['prefix' => '193.0.0.0/21', 'irrRoutes' => ['RIPE' => [['asn' => 3333]]]],
    ['prefix' => '193.0.0.0/24', 'irrRoutes' => ['RADB' => [['asn' => 64500]], 'RIPE' => [['asn' => 64500]]]],
    ['prefix' => '193.0.4.0/24', 'irrRoutes' => ['RIPE' => [['asn' => 3333]]]],
];
$irr = irrObjects($irrAnswer, '193.0.0.0/24');
same('exact route objects', $irr['exact'], [['source' => 'RADB', 'asn' => 64500], ['source' => 'RIPE', 'asn' => 64500]]);
same('covering route objects, not siblings', $irr['covering'], [['prefix' => '193.0.0.0/21', 'source' => 'RIPE', 'asn' => 3333]]);
same('route object for the AS passes', irrCheck(64500, $irr, '193.0.0.0/24')['level'], 'pass');
same('route objects only for another AS', str_contains(irrCheck(3333, $irr, '193.0.0.0/24')['text'], 'exist only for AS64500'), true);
same('only a covering route object', str_contains(irrCheck(3333, irrObjects([$irrAnswer[0]], '193.0.0.0/24'), '193.0.0.0/24')['text'], 'covering 193.0.0.0/21'), true);
same('IPv6 asks for a route6 object', str_contains(irrCheck(1, ['exact' => [], 'covering' => []], '2001:db8::/32')['text'], 'route6'), true);
same('IRR unavailable', irrCheck(1, null, '8.8.8.0/24')['level'], 'failed');
same('RPKI valid', rpkiCheck(3333, ['status' => 'valid', 'validating_roas' => [['origin' => '3333', 'max_length' => 24]]])['level'], 'pass');
same('RPKI too specific', str_contains(rpkiCheck(3333, ['status' => 'invalid_length', 'validating_roas' => [['origin' => '3333', 'max_length' => 21]]])['text'], 'only up to /21'), true);
same('RPKI unavailable', rpkiCheck(3333, null)['level'], 'failed');
$history = ['start' => '2026-09-01T00:00:00Z', 'end' => '2026-10-01T00:00:00Z', 'maxPeers' => 100, 'origins' => [
    ['asn' => 3333, 'segments' => [['start' => '2026-09-01T00:00:00Z', 'end' => '2026-09-10T00:00:00Z', 'peers' => 99], ['start' => '2026-09-12T00:00:00Z', 'end' => '2026-10-01T00:00:00Z', 'peers' => 99]]],
    ['asn' => 64500, 'segments' => [['start' => '2026-09-20T00:00:00Z', 'end' => '2026-09-21T00:00:00Z', 'peers' => 30]]],
]];
$hc = historyChecks($history, [3333]);
same('another origin in the window', str_contains($hc[0]['text'], 'AS64500 also originated'), true);
same('a two-day gap counted', str_contains($hc[1]['text'], 'dropped out of the routing table 1 time') && str_contains($hc[1]['text'], '48 hours'), true);
$history['origins'][0]['segments'] = [['start' => '2026-09-01T00:00:00Z', 'end' => '2026-10-01T00:00:00Z', 'peers' => 99]];
same('no gaps', historyChecks(['origins' => [$history['origins'][0]]] + $history, [3333])[0]['level'], 'pass');

// --- TLS, DNSSEC and mail policies -------------------------------------------
same('certificate name exact', certNameMatches(['mail.example.com'], 'mail.example.com'), true);
same('wildcard covers one label', certNameMatches(['*.example.com'], 'mail.example.com'), true);
same('wildcard does not cover two labels', certNameMatches(['*.example.com'], 'a.b.example.com'), false);
same('wildcard does not cover the apex', certNameMatches(['*.example.com'], 'example.com'), false);
same('names compared case-insensitively', certNameMatches(['Mail.Example.com'], 'mail.example.COM.'), true);
same('MTA-STS mx pattern exact', stsMxMatches('mx1.example.com', 'mx1.example.com.'), true);
same('MTA-STS mx wildcard', stsMxMatches('*.example.com', 'mx1.example.com'), true);
same('MTA-STS mx wildcard is one label', stsMxMatches('*.example.com', 'a.mx.example.com'), false);
$keysRaw = <<<'DIG'
example.com.		3600 IN	DNSKEY 256 3 13 (
				oJMRESz5E4gYzS/q6XDrvU1qMPYIjCWzJaOau8XNEZeqCYKD5ar0IRd8
				) ; ZSK; alg = ECDSAP256SHA256 ; key id = 34505
example.com.		3600 IN	DNSKEY 257 3 13 (
				mdsswUyr3DPW132mOi8V9xESWE8jTo0dxCjjnopKl+GqJxpVXckHAeF+
				) ; KSK; alg = ECDSAP256SHA256 ; key id = 2371
DIG;
same('DNSKEY flags, algorithm, tag and role', dnskeys($keysRaw), [
    ['flags' => 256, 'algorithm' => 13, 'tag' => 34505, 'role' => 'ZSK'],
    ['flags' => 257, 'algorithm' => 13, 'tag' => 2371, 'role' => 'KSK'],
]);
same('RRSIG time', dnssecTime('20261105183347'), gmmktime(18, 33, 47, 11, 5, 2026));

// --- Client keys for rate limits --------------------------------------------
$_SERVER['REMOTE_ADDR'] = '2001:db8:1:2:aaaa::1';
$a = clientKey();
$_SERVER['REMOTE_ADDR'] = '2001:db8:1:2:bbbb::9';
same('IPv6 visitors share a /64 limit', clientKey(), $a);
$_SERVER['REMOTE_ADDR'] = '198.51.100.7';
same('IPv4 visitors are keyed by address', clientKey(), '198.51.100.7');

echo "{$passed} passed, {$failed} failed\n";
exit($failed ? 1 : 0);
