// How results are read: verdicts must follow the evidence and never overstate it. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blacklistSummary, duration, hopsAsPath, mtrVerdict, nsVerdicts, pingVerdict, propagationVerdict, routeVerdict, spfTermMeaning, traceVerdict } from '../src/lib/interpret.ts';

const hop = (address: string | null, loss: number, sent = 5) => ({ address, loss, sent, avg: address ? 10 : null });

test('ping: no replies is not called "down"', () => {
    const v = pingVerdict(4, 0);
    assert.equal(v.level, 'neutral');
    assert.match(v.detail!, /does not prove/);
    assert.equal(pingVerdict(4, 4).level, 'pass');
    assert.equal(pingVerdict(4, 3).label, '25% loss');
});

test('MTR: loss on a middle hop only is rate limiting, not a problem', () => {
    const v = mtrVerdict([hop('10.0.0.1', 0), hop('192.0.2.1', 60), hop('198.51.100.1', 0), hop('203.0.113.9', 0)]);
    assert.equal(v.level, 'pass');
    assert.match(v.detail!, /Hop 2/);
    assert.match(v.detail!, /rate limiting/);
});

test('MTR: loss that persists to the destination is located', () => {
    const v = mtrVerdict([hop('10.0.0.1', 0), hop('192.0.2.1', 0), hop('198.51.100.1', 40), hop(null, 100), hop('203.0.113.9', 40)]);
    assert.equal(v.level, 'issue');
    assert.equal(v.from, 2);
    assert.match(v.title, /hop 3/);
    assert.match(v.detail!, /20% loss/);
});

test('MTR: a destination that never answers is inconclusive', () => {
    assert.equal(mtrVerdict([hop('10.0.0.1', 0), hop(null, 100)]).level, 'neutral');
});

test('traceroute: unanswered hops are explained, not failed', () => {
    const v = traceVerdict([hop('10.0.0.1', 0), hop(null, 100), hop('203.0.113.9', 0)], true);
    assert.equal(v.level, 'pass');
    assert.match(v.detail!, /1 hop did not answer/);
    const stop = traceVerdict([hop('10.0.0.1', 0), hop(null, 100)], false);
    assert.equal(stop.level, 'neutral');
    assert.match(stop.title, /hop 1/);
});

test('DNS propagation: a sample is never called worldwide proof', () => {
    const same = propagationVerdict([
        { place: 'A', answers: ['1.1.1.1'], code: 'NOERROR' },
        { place: 'B', answers: ['1.1.1.1'], code: 'NOERROR' },
    ]);
    assert.equal(same.level, 'pass');
    assert.match(same.detail!, /sample/);
    const differ = propagationVerdict([
        { place: 'A', answers: ['1.1.1.1'], code: 'NOERROR' },
        { place: 'B', answers: ['2.2.2.2', '1.1.1.1'], code: 'NOERROR' },
        { place: 'C', answers: [], code: 'NXDOMAIN' },
    ]);
    assert.equal(differ.label, '2 different answers');
    assert.equal(differ.level, 'neutral');
    const failed = propagationVerdict([{ place: 'A', answers: [], code: null, failed: true }]);
    assert.equal(failed.level, 'failed');
});

test('name servers: serials that differ between operators are normal', () => {
    const multi = nsVerdicts([
        { host: 'dns1.p08.nsone.net', check: { state: 'authoritative', serial: 1656468023 } },
        { host: 'ns-421.awsdns-52.com', check: { state: 'authoritative', serial: 1 } },
    ]);
    assert.ok(multi.some((v) => v.label === 'Serials differ' && v.level === 'neutral'));
    const stale = nsVerdicts([
        { host: 'ns1.example.net', check: { state: 'authoritative', serial: 5 } },
        { host: 'ns2.example.net', check: { state: 'authoritative', serial: 4 } },
    ]);
    assert.ok(stale.some((v) => v.label === 'Serials differ' && v.level === 'issue'));
    const lame = nsVerdicts([
        { host: 'ns1.example.net', check: { state: 'authoritative', serial: 5 } },
        { host: 'ns2.example.net', check: { state: 'not_authoritative', serial: null } },
    ]);
    assert.ok(lame.some((v) => v.level === 'issue' && /ns2/.test(v.title)));
});

test('blacklists: coverage counts only lists that gave a usable answer', () => {
    const s = blacklistSummary([
        { name: 'A', state: 'not_listed' },
        { name: 'B', state: 'blocked' },
        { name: 'C', state: 'unavailable' },
        { name: 'D', state: 'not_listed' },
    ]);
    assert.equal(s.coverage, '2 of 4 lists checked');
    assert.equal(s.verdict.level, 'pass');
    assert.equal(s.skipped.length, 2);
    assert.equal(blacklistSummary([{ name: 'A', state: 'listed' }]).verdict.level, 'issue');
    assert.equal(blacklistSummary([{ name: 'A', state: 'blocked' }]).verdict.level, 'failed');
});

test('SPF terms and durations read plainly', () => {
    assert.equal(spfTermMeaning({ name: 'all', qualifier: '-', value: null }), 'Fail for every server not matched earlier');
    assert.equal(spfTermMeaning({ name: 'include', qualifier: '+', value: '_spf.google.com' }), 'Allows whatever _spf.google.com allows in its own SPF');
    assert.equal(duration(86400), '1 day');
    assert.equal(duration(7200), '2 h');
    assert.equal(duration(900), '15 min');
    assert.equal(duration(1209600), '2 weeks');
    assert.equal(duration(45), '45 s');
});

test('route: not announced is a fact, not a failure', () => {
    const v = routeVerdict({ query: '198.51.100.1', prefix: '198.51.100.1', announced: false, origins: [], visibility: null, rpki: [] });
    assert.equal(v.level, 'neutral');
    assert.match(v.title, /No route covers 198\.51\.100\.1/);
});

test('route: RPKI invalid outranks everything else', () => {
    const v = routeVerdict({ query: 'x', prefix: '192.0.2.0/24', announced: true, origins: [{ asn: 64500 }], visibility: { seeing: 10, total: 100 }, rpki: [{ asn: 64500, status: 'invalid_asn' }] });
    assert.equal(v.level, 'issue');
    assert.match(v.detail!, /none allows this origin/);
});

test('route: two origins are flagged, fully visible single origin passes', () => {
    const moas = routeVerdict({ query: 'x', prefix: '192.0.2.0/24', announced: true, origins: [{ asn: 1 }, { asn: 2 }], visibility: null, rpki: [{ asn: 1, status: 'unknown' }, { asn: 2, status: 'valid' }] });
    assert.equal(moas.label, 'Multiple origins');
    const ok = routeVerdict({ query: 'x', prefix: '192.0.2.0/24', announced: true, origins: [{ asn: 15169 }], visibility: { seeing: 94, total: 94 }, rpki: [{ asn: 15169, status: 'valid' }] });
    assert.equal(ok.level, 'pass');
    assert.match(ok.title, /AS15169 and seen by 94 RIS peers of 94/);
});

test('route: low visibility is reported without calling it broken', () => {
    const v = routeVerdict({ query: 'x', prefix: '192.0.2.0/24', announced: true, origins: [{ asn: 1 }], visibility: { seeing: 40, total: 100 }, rpki: [] });
    assert.equal(v.level, 'neutral');
    assert.equal(v.label, 'Partly visible');
});

test('trace AS path: silent hops and repeats left out', () => {
    assert.deepEqual(hopsAsPath([{ asn: null }, { asn: 205923 }, { asn: null }, { asn: 5603 }, { asn: 5603 }, { asn: 15169 }]), [205923, 5603, 15169]);
});
