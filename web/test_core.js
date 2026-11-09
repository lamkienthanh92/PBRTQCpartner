// node web/test_core.js
const assert = require('assert'); const PQ = require('./core.js');
const rows = PQ.makeDemo(); const pairs = rows.filter(r => r.G);
const law = PQ.fitLaw(pairs.map(p => p.A), pairs.map(p => p.G));
assert(Math.abs(law.beta - PQ.REF_BETA) < 0.08, 'law exponent');
const t0 = rows[0].t, base = rows.filter(r => r.t < t0 + 14 * 864e5), test = rows.filter(r => r.t >= t0 + 14 * 864e5);
const cal = PQ.calibrate(base.filter(r => r.G), { resultsPerDay: 165 });
const quiet = PQ.monitor(cal, test).records.filter(r => r.status === 'alarm').length / 16;
assert(quiet < 0.5, 'false alarms per day ' + quiet);
const biased = test.map(r => ({ ...r, A: r.A * 1.06 }));
assert(PQ.monitor(cal, biased).records.slice(0, 600).some(r => r.status === 'alarm'), 'bias detected');

/* classic IQC techniques */
const R = zs => zs.map((z, i) => ({ t: i, z: Array.isArray(z) ? z : [z] }));
assert.deepStrictEqual(PQ.westgard(R([[0.2, 3.4]]))[0].rules, ['1:3s'], '1:3s');
assert(PQ.westgard(R([[2.4, 0.1], [2.6, 0.3]]))[1].rules.includes('2:2s'), '2:2s across runs');
assert(PQ.westgard(R([[2.4, 2.5]]))[0].rules.includes('2:2s'), '2:2s across levels');
assert(PQ.westgard(R([[2.5, -2.5]]))[0].rules.includes('R:4s'), 'R:4s');
assert(PQ.westgard(R([[1.2, 1.5], [1.3, 1.1]]))[1].rules.includes('4:1s'), '4:1s');
assert(PQ.westgard(R(Array.from({ length: 5 }, () => [0.3, 0.2])))[4].rules.includes('10x'), '10x');
assert.strictEqual(PQ.westgard(R([[0.1, -0.4], [0.5, 0.3]])).some(x => x.reject), false, 'in control');
assert(PQ.westgard(R([[2.2, 0]]), [], true)[0].reject, '1:2s as rejection');
const shifted = R(Array.from({ length: 40 }, (_, i) => [i < 10 ? 0 : 1.5, i < 10 ? 0 : 1.5]));
assert(PQ.ewmaChart(shifted).some(x => x.signal) && PQ.cusumChart(shifted).some(x => x.signal), 'EWMA and CUSUM see a sustained 1.5 SD shift');
const iq = PQ.makeIQC({ runs: 60, error: { type: 'shift', size: 2, start: 30 } });
assert.strictEqual(iq.length, 60); assert(iq[0].v[0] > 4 && iq[0].v[0] < 7, 'IQC values around target');
const cmp = PQ.iqcCompare({ reps: 120 }), by = id => cmp.rows.find(x => x.id === id);
assert(by('s13').falseRate < 0.012, '1:3s false alarm rate ' + by('s13').falseRate);
assert(by('s12').falseRate > 0.05, '1:2s false alarm rate ' + by('s12').falseRate);
assert(by('cusum').delay[1] < by('s13').delay[1], 'CUSUM beats 1:3s for a 1 SD shift');
assert(by('wg5').delay[3] <= by('s13').delay[3], 'multirule is not slower than 1:3s for 2 SD');
console.log('core tests passed');
