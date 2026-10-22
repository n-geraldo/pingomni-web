// Subnet maths: boundaries, /31 and /32, range conversion, splitting. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatIp, parseNetwork, rangeToMasks, split, subnet } from '../src/lib/ipcalc.ts';

const row = (r: ReturnType<typeof subnet>, label: string) => r.rows.find((x) => x.label === label)?.value;

test('a /24 from a host address', () => {
    const r = subnet('192.168.1.10/24');
    assert.equal(r.cidr, '192.168.1.0/24');
    assert.equal(r.mask, '255.255.255.0');
    assert.equal(r.hostBitsSet, true);
    assert.equal(row(r, 'Broadcast'), '192.168.1.255');
    assert.equal(row(r, 'First host'), '192.168.1.1');
    assert.equal(row(r, 'Last host'), '192.168.1.254');
    assert.equal(row(r, 'Usable hosts'), '254');
});

test('netmask form and the network address itself', () => {
    const r = subnet('10.20.30.40 255.255.252.0');
    assert.equal(r.cidr, '10.20.28.0/22');
    assert.equal(subnet('10.20.28.0/22').hostBitsSet, false);
});

test('/31 has two usable addresses and no broadcast (RFC 3021)', () => {
    const r = subnet('203.0.113.8/31');
    assert.equal(r.shape, 'p2p');
    assert.equal(row(r, 'First host'), '203.0.113.8');
    assert.equal(row(r, 'Last host'), '203.0.113.9');
    assert.equal(row(r, 'Usable hosts'), '2');
    assert.match(String(row(r, 'Broadcast')), /^None/);
});

test('/32 is a single address; no mask means /32 is assumed', () => {
    const r = subnet('198.51.100.7');
    assert.equal(r.shape, 'single');
    assert.equal(r.assumed, true);
    assert.equal(row(r, 'Usable hosts'), '1');
    assert.equal(row(r, 'First host'), '198.51.100.7');
});

test('/0 covers everything', () => {
    const r = subnet('1.2.3.4/0');
    assert.equal(r.cidr, '0.0.0.0/0');
    assert.equal(row(r, 'Total addresses'), (2 ** 32).toLocaleString('en'));
});

test('invalid input is explained', () => {
    assert.throws(() => subnet('192.168.1.300/24'), /IPv4 address/);
    assert.throws(() => subnet('192.168.1.1/33'), /prefix/);
    assert.throws(() => subnet('192.168.1.1 255.0.255.0'), /netmask/);
    assert.throws(() => subnet('2001:db8::/32'), /IPv4 only/);
});

test('a range that is exactly one network', () => {
    const r = rangeToMasks('192.168.0.0', '192.168.3.255');
    assert.equal(r.exact, true);
    assert.equal(r.cover.cidr, '192.168.0.0/22');
    assert.equal(r.extra, 0);
    assert.deepEqual(r.blocks.map((b) => b.cidr), ['192.168.0.0/22']);
});

test('a ragged range: exact blocks versus the covering prefix', () => {
    const r = rangeToMasks('10.0.0.5', '10.0.0.20');
    assert.equal(r.exact, false);
    assert.equal(r.count, 16);
    assert.equal(r.cover.cidr, '10.0.0.0/27');
    assert.equal(r.extra, 32 - 16);
    assert.deepEqual(r.blocks.map((b) => b.cidr), ['10.0.0.5/32', '10.0.0.6/31', '10.0.0.8/29', '10.0.0.16/30', '10.0.0.20/32']);
    assert.equal(r.blocks.reduce((n, b) => n + b.size, 0), 16);
});

test('the whole address space as a range', () => {
    const r = rangeToMasks('0.0.0.0', '255.255.255.255');
    assert.deepEqual(r.blocks.map((b) => b.cidr), ['0.0.0.0/0']);
    assert.throws(() => rangeToMasks('10.0.0.9', '10.0.0.1'), /before/);
});

test('splitting a network', () => {
    const { network, prefix, hostBitsSet } = parseNetwork('10.1.2.3/22');
    assert.equal(formatIp(network), '10.1.0.0');
    assert.equal(hostBitsSet, true);
    const s = split(network, prefix, 24);
    assert.equal(s.count, 4);
    assert.deepEqual(s.pieces.map((p) => p.cidr), ['10.1.0.0/24', '10.1.1.0/24', '10.1.2.0/24', '10.1.3.0/24']);
    const p2p = split(network, prefix, 31, 2);
    assert.equal(p2p.count, 512);
    assert.equal(p2p.pieces.length, 2);
    assert.equal(p2p.pieces[0].broadcast, '—');
    assert.equal(p2p.pieces[0].hosts, 2);
});
