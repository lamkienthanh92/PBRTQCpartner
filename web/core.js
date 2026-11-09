/* PartnerQC core: no DOM access. Shared by the web app and the Node tests. */
const PQ = (() => {
  const REF_BETA = 0.653, MGDL = 18.016, PFR_MULTI = 0.0073;
  const U = Array.from({ length: 49 }, (_, i) => 0.02 + 0.02 * i);
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function normal(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const sortNum = a => Float64Array.from(a).sort();
  function q(sorted, p) { const h = (sorted.length - 1) * p, i = Math.floor(h), j = Math.min(i + 1, sorted.length - 1); return sorted[i] + (h - i) * (sorted[j] - sorted[i]); }
  const mean = a => { let s = 0; for (const v of a) s += v; return s / a.length; };
  const sd = a => { const m = mean(a); let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / a.length); };
  function linfit(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; } const b = sxy / sxx; return { slope: b, intercept: my - b * mx }; }
  function corr(x, y) { const mx = mean(x), my = mean(y); let a = 0, b = 0, c = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); }
  const clip = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  /* Distribution law ln Q(HbA1c) = alpha + beta ln Q(glucose); A in %, G in mmol/L */
  function fitLaw(A, G, boot = 0, seed = 11) {
    const la = A.map(Math.log), lg = G.map(Math.log);
    const one = (xa, xg) => { const sa = sortNum(xa), sg = sortNum(xg); const qa = U.map(p => q(sa, p)), qg = U.map(p => q(sg, p)); const f = linfit(qg, qa); return { beta: f.slope, alpha: f.intercept, qa, qg }; };
    const res = one(la, lg); res.r = corr(la, lg); res.n = la.length;
    if (boot > 0) {
      const r = rng(seed), bs = [];
      for (let b = 0; b < boot; b++) { const xa = [], xg = []; for (let i = 0; i < la.length; i++) { const k = Math.floor(r() * la.length); xa.push(la[k]); xg.push(lg[k]); } bs.push(one(xa, xg).beta); }
      const s = sortNum(bs); res.ci = [q(s, 0.025), q(s, 0.975)];
    }
    return res;
  }

  /* Standardiser for a log-scale signal: clip at 0.5/99.5 percentiles, centre, scale */
  function standardiser(values) {
    const s = sortNum(values), lo = q(s, 0.005), hi = q(s, 0.995), c = values.map(v => clip(v, lo, hi));
    return { lo, hi, center: mean(c), sd: sd(c) };
  }
  const zOf = (st, v) => (clip(v, st.lo, st.hi) - st.center) / st.sd;

  /* EWMA limit h for an in-control average run length (bootstrap of baseline z) */
  function limitForARL(z, lam, targetARL, seed = 1) {
    const r = rng(seed), sdE = Math.sqrt(lam / (2 - lam)), K = 100;
    const H = Array.from({ length: K }, (_, i) => 0.5 * Math.pow(12, i / (K - 1)) * sdE);
    const steps = Math.max(150000, Math.round(40 * targetARL));
    const e = new Float64Array(K), al = new Float64Array(K);
    for (let t = 0; t < steps; t++) {
      const v = z[Math.floor(r() * z.length)];
      for (let j = 0; j < K; j++) { const x = (1 - lam) * e[j] + lam * v; if (Math.abs(x) > H[j]) { al[j]++; e[j] = 0; } else e[j] = x; }
    }
    const arl = Array.from(al, a => steps / Math.max(a, 1));
    let j = arl.findIndex(a => a >= targetARL); j = Math.min(Math.max(j < 0 ? K - 1 : j, 1), K - 1);
    const f = (Math.log(targetARL) - Math.log(arl[j - 1])) / (Math.log(arl[j]) - Math.log(arl[j - 1]) + 1e-12);
    return H[j - 1] + f * (H[j] - H[j - 1]);
  }

  /* Calibration on baseline pairs [{A,G}] */
  function calibrate(pairs, { beta = null, lam = 0.02, resultsPerDay = 150, faPerDay = 0.10, seed = 1 } = {}) {
    const A = pairs.map(p => p.A), G = pairs.map(p => p.G);
    const law = fitLaw(A, G);
    const b = beta === 'local' ? law.beta : (beta == null ? REF_BETA : +beta);
    const sp = standardiser(pairs.map(p => Math.log(p.A) - b * Math.log(p.G)));
    const sa = standardiser(A.map(Math.log)), sg = standardiser(G.map(Math.log));
    const target = resultsPerDay / faPerDay;
    const hz = (st, vals) => limitForARL(vals.map(v => zOf(st, v)), lam, target, seed);
    return {
      beta: b, center: sp.center, sd: sp.sd, lo: sp.lo, hi: sp.hi, lam, h: hz(sp, pairs.map(p => Math.log(p.A) - b * Math.log(p.G))),
      results_per_day: resultsPerDay, false_alarms_per_day: faPerDay, local_beta: law.beta, r: law.r, n_baseline: pairs.length,
      alone: { ...sa, h: hz(sa, A.map(Math.log)) }, glucose: { ...sg, h: hz(sg, G.map(Math.log)) }
    };
  }

  /* Monitor a chronological stream [{t, A, G, id}] (G may be null). Returns per-result records. */
  function monitor(cal, stream, { e0 = 0 } = {}) {
    let e = e0, eA = 0, eG = 0; const out = [];
    for (let i = 0; i < stream.length; i++) {
      const s = stream[i], lam = cal.lam;
      eA = (1 - lam) * eA + lam * zOf(cal.alone, Math.log(s.A));
      const rec = { i, t: s.t, id: s.id, A: s.A, G: s.G, status: 'no_partner', level: null };
      if (s.G && s.G > 0) {
        eG = (1 - lam) * eG + lam * zOf(cal.glucose, Math.log(s.G));
        const v = Math.log(s.A) - cal.beta * Math.log(s.G);
        rec.discordant = v < cal.lo || v > cal.hi;
        rec.z = (clip(v, cal.lo, cal.hi) - cal.center) / cal.sd;
        e = (1 - lam) * e + lam * rec.z; rec.level = e / cal.h;
        if (Math.abs(rec.level) > 1) { rec.status = 'alarm'; rec.legA = eA / cal.alone.h; rec.legG = eG / cal.glucose.h; rec.advice = advice(rec); e = 0; }
        else rec.status = Math.abs(rec.level) > 0.6 ? 'watch' : 'ok';
      }
      rec.levelA = eA / cal.alone.h; rec.levelG = eG / cal.glucose.h; out.push(rec);
    }
    return { records: out, e };
  }
  function advice(rec) {
    const dir = rec.level > 0 ? 'higher' : 'lower';
    const a = Math.abs(rec.legA) >= 0.6, g = Math.abs(rec.legG) >= 0.6;
    let hint = 'Check today’s glucose IQC. If it passed, run HbA1c IQC before releasing more HbA1c results.';
    if (g && !a) hint = 'Glucose results have shifted while HbA1c has not. Check glucose IQC first.';
    else if (a && !g) hint = 'HbA1c results have shifted while glucose has not. Run HbA1c IQC before releasing more HbA1c results.';
    return `HbA1c is running ${dir} than glucose predicts. ${hint}`;
  }

  /* IQC: two control levels, rule 1:3s/2:2s/R:4s. Probability of rejection for a bias (in CVa units) and SD multiplier k */
  const _pr = new Map();
  function pRej(biasSD, k = 1) {
    const key = `${Math.round(Math.abs(biasSD) * 20)}|${k.toFixed(2)}`; if (_pr.has(key)) return _pr.get(key);
    const r = rng(99), b = Math.round(Math.abs(biasSD) * 20) / 20; let n = 0; const N = 20000;
    for (let i = 0; i < N; i++) { const z1 = b + k * normal(r), z2 = b + k * normal(r); if (Math.abs(z1) > 3 || Math.abs(z2) > 3 || (z1 > 2 && z2 > 2) || (z1 < -2 && z2 < -2) || (Math.max(z1, z2) > 2 && Math.min(z1, z2) < -2)) n++; }
    _pr.set(key, n / N); return n / N;
  }

  /* Index of first sample at or after each scheduled time (hours of day), for every day of the stream */
  function qcIndices(stream, hours) {
    if (!stream.length) return [];
    const day0 = new Date(stream[0].t); day0.setHours(0, 0, 0, 0); const last = stream[stream.length - 1].t; const idx = new Set(); let j = 0;
    for (let d = day0.getTime(); d <= last; d += 86400000) for (const h of [...hours].sort((a, b) => a - b)) { const tt = d + h * 3600000; while (j < stream.length && stream[j].t < tt) j++; if (j < stream.length) idx.add(j); }
    return [...idx].sort((a, b) => a - b);
  }
  const hourOf = s => { const t = String(s).trim(); let m = t.match(/^(\d{1,2}):(\d{2})$/); if (m) return +m[1] + +m[2] / 60; m = t.match(/^\d{1,2}(\.\d+)?$/); return m ? +t : NaN; };

  /* Inject an error into a copy of the stream from index `onset`. spec: {type:'bias'|'drift'|'imprecision'|'glucose', size, sign} */
  function inject(stream, onset, spec, { cva = 0.02, tea = 0.08, seed = 5, horizonDays = 5 } = {}) {
    const r = rng(seed), lt = Math.log(1 + tea), t0 = stream[onset].t, out = [], bias = [], kk = [], unacc = [];
    const sizeLog = Math.log(1 + spec.size / 100) * (spec.sign || 1);
    for (let i = 0; i < stream.length; i++) {
      const s = { ...stream[i] }, after = i >= onset, hrs = (s.t - t0) / 3600000;
      let b = 0, k = 1;
      if (after && spec.type === 'bias') b = sizeLog;
      if (after && spec.type === 'drift') b = sizeLog * Math.min(Math.max(hrs / 24, 0), 1);
      if (after && spec.type === 'imprecision') k = spec.size;
      const e0 = normal(r), e1 = normal(r);
      s.A = s.A * Math.exp(b + cva * Math.sqrt(k * k - 1) * e1);
      if (after && spec.type === 'glucose' && s.G) s.G = s.G * Math.exp(sizeLog);
      out.push(s); bias.push(b); kk.push(k); unacc.push(Math.abs(b + cva * (e0 + Math.sqrt(k * k - 1) * e1)) > lt ? 1 : 0);
    }
    const cu = new Float64Array(stream.length + 1); for (let i = 0; i < stream.length; i++) cu[i + 1] = cu[i] + unacc[i];
    let hor = stream.length; const tEnd = t0 + horizonDays * 86400000; for (let i = onset; i < stream.length; i++) if (stream[i].t > tEnd) { hor = i; break; }
    return { stream: out, bias, k: kk, cu, hor };
  }

  /* Expected unacceptable results and delay until first detection, given events [{idx, after, p}] (after: event occurs after sample idx) */
  function expected(events, onset, inj, stream, cva) {
    let surv = 1, nuf = 0, hrs = 0; const end = inj.hor, base = inj.cu[onset], t0 = stream[onset].t;
    for (const ev of events.sort((a, b) => (a.idx + (a.after ? 0.5 : 0)) - (b.idx + (b.after ? 0.5 : 0)))) {
      const pos = ev.after ? ev.idx + 1 : ev.idx; if (pos < onset || pos > end) continue;
      const p = ev.p; nuf += surv * p * (inj.cu[pos] - base); hrs += surv * p * ((stream[Math.min(pos, stream.length - 1)].t - t0) / 3600000); surv *= 1 - p;
    }
    nuf += surv * (inj.cu[end] - base); hrs += surv * ((stream[Math.min(end, stream.length - 1)].t - t0) / 3600000);
    return { nuf, hours: hrs, undetected: surv };
  }
  function compare(cal, stream, onset, spec, schedules, opts) {
    const inj = inject(stream, onset, spec, opts), cva = opts.cva;
    const mon = monitor(cal, inj.stream).records;
    const qcEvents = hours => qcIndices(inj.stream, hours).filter(i => i >= onset).map(i => ({ idx: i, after: false, p: pRej(inj.bias[i] / cva, inj.k[i]) }));
    const pbEvents = mon.filter(m => m.status === 'alarm' && m.i >= onset).map(m => ({ idx: m.i, after: true, p: pRej(inj.bias[m.i] / cva, inj.k[m.i]) }));
    const res = schedules.map(s => ({ name: s.name, ...expected([...qcEvents(s.hours), ...(s.partner ? pbEvents.map(e => ({ ...e })) : [])], onset, inj, inj.stream, cva) }));
    const firstAlarm = mon.find(m => m.status === 'alarm' && m.i >= onset);
    return { res, mon, inj, firstAlarm };
  }

  /* QC plan from the delta rule: break-even ~ 59 * delta^-1.71 results/day (once-daily IQC + PBRTQC vs IQC three times daily) */
  function plan({ cva, tea, n, coverage, sdSpread, sdAlone }) {
    const sigma = tea / cva, dsec = Math.max(sigma - 1.65, 0) * cva, dLog = Math.log(1 + dsec / 100);
    const dP = dLog / sdSpread, dA = dLog / sdAlone, be1 = 59 * Math.pow(dP, -1.71), beAlone = 59 * Math.pow(dA, -1.71), be2 = 0.5 * be1, nEff = n * coverage;
    let rec, runs;
    if (sigma < 3) { rec = 'Analytical performance limits what any QC can do. Keep IQC three times daily and use PartnerQC as an extra check.'; runs = 3; }
    else if (nEff >= be1 && sigma >= 6) { rec = 'IQC once daily plus PartnerQC. Add an IQC run after reagent changes, calibration and maintenance.'; runs = 1; }
    else if (nEff >= be2) { rec = 'IQC twice daily (start of day and mid-flow) plus PartnerQC.'; runs = 2; }
    else { rec = 'Keep IQC three times daily. At this volume PartnerQC is an extra check, not a replacement.'; runs = 3; }
    return { sigma, dsec, dP, dA, be1, be2, beAlone, nEff, rec, runs, runsMonth: 30 * (runs + (runs < 3 ? 0.1 : 0)), frMonth: 30 * (runs + (runs < 3 ? 0.1 : 0)) * PFR_MULTI, frIQC3: 90 * PFR_MULTI };
  }

  /* Synthetic stream following the law (no real patients) */
  function makeDemo({ days = 30, perWeekday = 180, coverage = 0.93, seed = 7, start = '2026-09-01' } = {}) {
    const r = rng(seed), rows = []; let sid = 100000; const sdG = 0.33, sdA = 0.21, rho = 0.75;
    const d0 = new Date(start + 'T00:00:00');
    for (let d = 0; d < days; d++) {
      const day = new Date(d0.getTime() + d * 86400000), wd = day.getDay(), lamN = (wd === 0 || wd === 6) ? perWeekday * 0.15 : perWeekday;
      const n = Math.max(0, Math.round(lamN + Math.sqrt(lamN) * normal(r)));
      const hrs = Array.from({ length: n }, () => { let g = 0; for (let k = 0; k < 2; k++) g -= Math.log(r()); return Math.min(22, 5.5 + 1.1 * g * 1.1); }).sort((a, b) => a - b);
      for (const h of hrs) {
        const lg = Math.log(7.6) + sdG * normal(r), la = Math.log(7.1) + rho * sdA / sdG * (lg - Math.log(7.6)) + sdA * Math.sqrt(1 - rho * rho) * normal(r);
        rows.push({ id: 'S' + (++sid), t: day.getTime() + h * 3600000, A: Math.round(Math.exp(la) * 10) / 10, G: r() < coverage ? Math.round(Math.exp(lg) * 10) / 10 : null });
      }
    }
    return rows;
  }

  /* ---------- Classic IQC techniques ----------
     A run is {t, z:[z1, z2?]}: control results as z-scores, (value - target) / SD, one per control level. */
  const WG_ALL = ['1:3s', '2:2s', 'R:4s', '4:1s', '10x'], WG_3 = ['1:3s', '2:2s', 'R:4s'];
  /* Levey-Jennings with Westgard rules. warnAsReject: treat a 1:2s warning as a rejection (single-rule 2SD chart). */
  function westgard(runs, use = WG_ALL, warnAsReject = false) {
    const out = [], hist = [], lev = [[], []];
    for (let i = 0; i < runs.length; i++) {
      const raw = runs[i].z, z = raw.filter(v => v != null && isFinite(v)), rules = [];
      z.forEach(v => hist.push(v)); raw.forEach((v, l) => { if (v != null && isFinite(v)) lev[l].push(v); });
      const warn = z.some(v => Math.abs(v) > 2);
      if (use.includes('1:3s') && z.some(v => Math.abs(v) > 3)) rules.push('1:3s');
      if (use.includes('2:2s')) {
        let hit = z.length > 1 && ((z[0] > 2 && z[1] > 2) || (z[0] < -2 && z[1] < -2));
        for (let l = 0; l < 2 && !hit; l++) { const a = lev[l], n = a.length; if (n > 1 && ((a[n - 1] > 2 && a[n - 2] > 2) || (a[n - 1] < -2 && a[n - 2] < -2))) hit = true; }
        if (hit) rules.push('2:2s');
      }
      if (use.includes('R:4s') && z.length > 1 && Math.max(...z) > 2 && Math.min(...z) < -2) rules.push('R:4s');
      if (use.includes('4:1s') && hist.length >= 4) { const a = hist.slice(-4); if (a.every(v => v > 1) || a.every(v => v < -1)) rules.push('4:1s'); }
      if (use.includes('10x') && hist.length >= 10) { const a = hist.slice(-10); if (a.every(v => v > 0) || a.every(v => v < 0)) rules.push('10x'); }
      const reject = rules.length > 0 || (warnAsReject && warn);
      out.push({ i, t: runs[i].t, warn, rules, reject });
    }
    return out;
  }
  const runStat = r => { const z = r.z.filter(v => v != null && isFinite(v)); return z.reduce((a, b) => a + b, 0) / Math.sqrt(Math.max(z.length, 1)); }; /* N(0,1) when in control */
  function ewmaChart(runs, { lam = 0.2, L = 2.9 } = {}) {
    let e = 0; const out = [];
    for (let i = 0; i < runs.length; i++) { e = lam * runStat(runs[i]) + (1 - lam) * e; const lim = L * Math.sqrt(lam / (2 - lam) * (1 - Math.pow(1 - lam, 2 * (i + 1)))); out.push({ i, t: runs[i].t, e, lim, signal: Math.abs(e) > lim }); }
    return out;
  }
  function cusumChart(runs, { k = 0.5, h = 4 } = {}) {
    let hi = 0, lo = 0; const out = [];
    for (let i = 0; i < runs.length; i++) { const z = runStat(runs[i]); hi = Math.max(0, hi + z - k); lo = Math.max(0, lo - z - k); const signal = hi > h || lo > h; out.push({ i, t: runs[i].t, hi, lo, h, signal }); if (signal) { hi = 0; lo = 0; } }
    return out;
  }
  const IQC_METHODS = [
    { id: 's12', name: 'Shewhart 1:2s', note: 'Any control beyond 2 SD. Sensitive, but about 10% false alarms with two levels.', fn: r => westgard(r, [], true).map(x => x.reject) },
    { id: 's13', name: 'Shewhart 1:3s', note: 'Any control beyond 3 SD. Catches large errors and almost never alarms falsely.', fn: r => westgard(r, ['1:3s']).map(x => x.reject) },
    { id: 'wg3', name: 'Westgard 1:3s / 2:2s / R:4s', note: 'The rule set most laboratories use for two control levels.', fn: r => westgard(r, WG_3).map(x => x.reject) },
    { id: 'wg5', name: 'Westgard multirule + 4:1s, 10x', note: 'Adds rules for small, persistent shifts across runs.', fn: r => westgard(r, WG_ALL).map(x => x.reject) },
    { id: 'ewma', name: 'EWMA of the controls', note: 'Weighted average of recent controls (λ = 0.2, limit 2.9). Good for small shifts.', fn: r => ewmaChart(r).map(x => x.signal) },
    { id: 'cusum', name: 'CUSUM of the controls', note: 'Adds up deviations beyond 0.5 SD (decision limit 4 SD). Best for small, steady shifts.', fn: r => cusumChart(r).map(x => x.signal) }];

  /* Control results with an optional error. error: {type: 'shift'|'drift'|'imprecision', size (SD, or SD multiplier), start (run index)} */
  function makeIQC({ runs = 90, levels = [{ mean: 5.4, sd: 0.11 }, { mean: 9.8, sd: 0.2 }], error = null, seed = 3, start = '2026-09-01', perDay = 3 } = {}) {
    const r = rng(seed), d0 = new Date(start + 'T00:00:00').getTime(), hrs = [5, 13, 21, 9, 17].slice(0, perDay).sort((a, b) => a - b), out = [];
    for (let i = 0; i < runs; i++) {
      const t = d0 + Math.floor(i / perDay) * 86400000 + hrs[i % perDay] * 3600000, z = [], v = [];
      levels.forEach(lv => { let b = 0, k = 1;
        if (error && i >= error.start) { if (error.type === 'shift') b = error.size; else if (error.type === 'drift') b = error.size * Math.min(1, (i - error.start + 1) / (3 * perDay)); else if (error.type === 'imprecision') k = error.size; }
        const zz = b + k * normal(r); z.push(zz); v.push(lv.mean + zz * lv.sd); });
      out.push({ t, z, v });
    }
    return out;
  }
  /* Monte Carlo: runs until each technique first signals after a shift of each size (20 in-control runs first), and false alarms per run without a shift. */
  function iqcCompare({ shifts = [0.5, 1, 1.5, 2, 3], reps = 300, maxRuns = 60, burn = 20, levels = 2, seed = 11 } = {}) {
    const r = rng(seed), lv = Array.from({ length: levels }, () => ({ mean: 0, sd: 1 }));
    const gen = (n, shift) => { const a = []; for (let i = 0; i < n; i++) a.push({ t: i, z: lv.map(() => (i >= burn ? shift : 0) + normal(r)) }); return a; };
    const rows = IQC_METHODS.map(m => ({ id: m.id, name: m.name, note: m.note, falseRate: 0, delay: shifts.map(() => 0), missed: shifts.map(() => 0) }));
    const nIn = 100;
    for (let k = 0; k < reps; k++) { const s = gen(nIn, 0); IQC_METHODS.forEach((m, j) => { const f = m.fn(s); let c = 0; for (let i = burn; i < nIn; i++) if (f[i]) c++; rows[j].falseRate += c / (nIn - burn) / reps; }); }
    shifts.forEach((sh, si) => { for (let k = 0; k < reps; k++) { const s = gen(burn + maxRuns, sh); IQC_METHODS.forEach((m, j) => { const f = m.fn(s); let d = -1; for (let i = burn; i < f.length; i++) if (f[i]) { d = i - burn + 1; break; } if (d < 0) { rows[j].missed[si] += 1 / reps; d = maxRuns; } rows[j].delay[si] += d / reps; }); } });
    rows.forEach(x => { x.arl0 = x.falseRate > 0 ? 1 / x.falseRate : Infinity; });
    return { shifts, rows, reps, maxRuns, levels };
  }
  return { REF_BETA, MGDL, fitLaw, standardiser, zOf, calibrate, monitor, pRej, qcIndices, hourOf, inject, compare, plan, makeDemo, rng, normal, q, sortNum, mean, sd, westgard, ewmaChart, cusumChart, makeIQC, iqcCompare, IQC_METHODS, WG_ALL, WG_3 };
})();
if (typeof module !== 'undefined') module.exports = PQ;
