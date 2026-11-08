// Simulazione a 6 mesi di una popolazione di persone (30-70 anni, ogni profilo, diversa dimestichezza informatica).
// ATTENZIONE: i numeri di tocchi/caratteri/schermate e i difetti di leggibilità vengono MISURATI sull'app vera (measure.js);
// tempi, errori e abbandoni sono un MODELLO con parametri di letteratura (KLM, curva di apprendimento a potenza), non utenti reali.
const fs = require('fs'), path = require('path');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'metrics.json'), 'utf8'));
let seed = 20261108; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / 0.7071; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* compiti: valori misurati + frequenza (per Run) + chi li fa */
const T = (n, who, o) => Object.assign({ name: n, who, m: M.tasks[n] || {} }, o);
const TASKS = [
  T('primo accesso (codice 8 caratteri)', 'all', { essential: true, once: true, screenKey: 'login' }),
  T('leggere gli avvisi', 'all', { perRun: 1, screenKey: 'elenco Run' }),
  T('rispondere "Ci sono" a un Run', 'all', { essential: true, perRun: 1.3, screenKey: 'scheda Run' }),
  T('vedere il meteo', 'all', { perRun: 1.5, screenKey: 'Meteo' }),
  T('aggiungere un passeggero', 'all', { perRun: 0.25, screenKey: 'scheda Run' }),
  T('mostrare la tessera QR', 'all', { perRun: 0.6, screenKey: 'tessera' }),
  T('compilare i dati di emergenza (prima volta)', 'all', { once: true, extraChars: 70, extraTaps: 8, screenKey: 'dati emergenza' }),
  T('inviare una segnalazione SOS (con accesso)', 'all', { once: true, drill: true, screenKey: 'SOS' }),
  T('vedere le proprie statistiche', 'all', { perMonth: 0.4, screenKey: 'statistiche' }),
  T('check-in manuale di 4 partecipanti', 'staff', { perRun: 1, scale: 5, screenKey: 'scheda Run (staff)', who2: ['rc'] }),
  T('check-in con QR (4 partecipanti)', 'staff', { perRun: 0, scale: 5, screenKey: 'scheda Run (staff)', who2: ['rc'] }),
  T('esportare l\'elenco in Excel', 'staff', { perRun: 0.7, screenKey: 'scheda Run (staff)', who2: ['rc', 'dir'] }),
  T('pubblicare un avviso', 'staff', { perMonth: 1.5, extraChars: 40, screenKey: 'avvisi', who2: ['dir', 'seg'] }),
  T('aprire il modulo "nuovo Run"', 'staff', { name2: 'creare un nuovo Run (modulo completo)', perRun: 1, extraTaps: 22, extraChars: 90, screenKey: 'nuovo Run', who2: ['dir', 'rc'], essential: true }),
  T('importare Run da Excel (fino alla scelta file)', 'staff', { once: true, extraTaps: 6, screenKey: 'import Run', who2: ['admin', 'seg'] })
];
const ROLES = [['socio', 0.66, 'all'], ['rc', 0.10, 'staff'], ['dir', 0.10, 'staff'], ['seg', 0.08, 'staff'], ['admin', 0.06, 'staff']];

function population(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const age = Math.round(30 + (i + rnd()) * 40 / n), sex = i % 2 ? 'F' : 'M';
    const lit = clamp(Math.round(3.6 - (age - 30) * 0.035 + gauss() * 0.9), 1, 5); // 1 principiante ... 5 esperto
    let r = rnd(), acc = 0, role = 'socio'; for (const [k, p] of ROLES) { acc += p; if (r <= acc) { role = k; break; } }
    out.push({ id: i + 1, age, sex, lit, role, vis: age >= 50 ? 1 + (age - 50) * 0.02 : 1 });
  }
  return out;
}

/* parametri del modello (secondi) */
const P = { tap: 0.9, key: 0.55, scr: 1.6, read: 4.0 };
function attemptTime(p, task, n, scn) {
  const m = task.m, taps = (m.taps || 0) + (task.extraTaps || 0), chars = (m.chars || 0) + (task.extraChars || 0), scr = m.screens || 1;
  const ageF = 1 + 0.012 * (p.age - 30), litF = 2.3 - 0.33 * p.lit, a = 0.18 + 0.035 * p.lit, prac = Math.max(0.28, Math.pow(n, -a));
  const aud = M.screens[task.screenKey] || {}, smallTxt = aud.texts ? aud.small / aud.texts : 0;
  const readPen = p.age >= 45 ? 1 + smallTxt * 0.5 * (p.vis - 0.9) * (scn.bigText ? 0 : 1) : 1;
  const hes = (task.perRun || task.once ? 1 : 0.8) * (scr * P.scr + 6) * litF * prac * (task.essential ? 1.2 : 1);
  return ((taps * P.tap + chars * P.key * litF) * ageF + hes * readPen) * (task.scale ? 1 : 1);
}
function failP(p, task, n, scn) {
  const m = task.m, taps = (m.taps || 0) + (task.extraTaps || 0), chars = (m.chars || 0) + (task.extraChars || 0);
  const aud = M.screens[task.screenKey] || {}, smallTaps = aud.taps ? aud.tapSmall / aud.taps : 0;
  const cx = taps * 0.012 + chars * 0.006 + (m.screens || 1) * 0.015;
  const tapPen = (scn.bigTargets ? 0 : smallTaps * 0.10) * (1 + (p.age - 30) * 0.02);
  const base = (cx + tapPen) * (2.2 - 0.33 * p.lit) * (1 + (p.age - 30) * 0.008);
  const guide = scn.guide && n <= 2 ? 0.55 : 1;
  return clamp(base * Math.max(0.25, Math.pow(n, -(0.25 + 0.04 * p.lit))) * guide, 0.002, 0.6);
}

function simulate(pop, scn) {
  const res = { tasks: {}, adopt: { m1: 0, m3: 0, m6: 0 }, help: 0, memberRuns: 0, drop: [], pers: [] };
  const tk = (name) => (res.tasks[name] = res.tasks[name] || { name, first: [], fail1: [], failAll: 0, attempts: 0, t: { 1: [], 3: [], 10: [] }, byLit: {} });
  pop.forEach(p => {
    let active = true, strikes = 0, stoppedAt = null; const cnt = {};
    const loginT = TASKS[0]; if (scn.inviteLink) { loginT.m = Object.assign({}, M.tasks[loginT.name], { taps: 1, chars: 0 }); } else loginT.m = M.tasks[loginT.name];
    const doTask = (task, month, force) => {
      const n = (cnt[task.name] = (cnt[task.name] || 0) + 1), t = tk(task.name2 || task.name);
      let time = attemptTime(p, task, n, scn) * (task.scale || 1), failed = false, tries = 1;
      while (rnd() < failP(p, task, n, scn) && tries < 3) { time += attemptTime(p, task, n + 1, scn) * 0.7; tries++; failed = true; }
      const lastFail = tries >= 3;
      if (n === 1) { t.first.push(time); t.fail1.push(tries > 1 ? 1 : 0); const k = p.lit <= 2 ? 'L12' : p.lit === 3 ? 'L3' : 'L45'; (t.byLit[k] = t.byLit[k] || []).push(tries > 1 ? 1 : 0); }
      if (n === 3) t.t[3].push(time); if (n === 10) t.t[10].push(time); if (n === 1) t.t[1].push(time);
      t.attempts++; if (lastFail) { t.failAll++; if (task.essential) { strikes++; if (rnd() < 0.55) { res.help++; strikes = Math.max(0, strikes - 1); } } }
      return !lastFail;
    };
    // utenza: ogni persona che non è "socio" ha anche i compiti del suo ruolo
    const mine = TASKS.filter(t => t.who === 'all' || (t.who2 && t.who2.includes(p.role)));
    mine.filter(t => t.once).forEach(t => { if (!active) return; const ok = doTask(t, 0); if (t.essential && !ok && strikes >= 2 && rnd() < clamp(0.5 - 0.08 * p.lit + (p.age - 30) * 0.004, 0.05, 0.7)) { active = false; stoppedAt = 0.5; } });
    for (let month = 1; month <= 6 && active; month++) {
      const runs = 3, multi = month % 2 === 0;
      for (let r = 0; r < runs && active; r++) {
        res.memberRuns++;
        mine.filter(t => t.perRun).forEach(t => { if (!active) return; const k = t.perRun * (t.name.startsWith('check-in manuale') && scn.qr ? 0 : 1), reps = Math.floor(k) + (rnd() < k % 1 ? 1 : 0); for (let i = 0; i < reps; i++) { const tt = scn.qr && t.name.startsWith('check-in con QR') ? t : t; doTask(tt, month); } });
        if (scn.qr && p.role === 'rc') { const t = TASKS.find(x => x.name.startsWith('check-in con QR')); doTask(t, month); }
        if (multi && r === 0) doTask(TASKS.find(x => x.name.startsWith('rispondere')), month);
        if (!active) break;
        // disaffezione: se i compiti essenziali falliscono ripetutamente la persona smette
        if (strikes >= 3 && rnd() < clamp(0.35 - 0.05 * p.lit, 0.03, 0.4)) { active = false; stoppedAt = month; }
      }
      mine.filter(t => t.perMonth && active).forEach(t => { const k = t.perMonth, reps = Math.floor(k) + (rnd() < k % 1 ? 1 : 0); for (let i = 0; i < reps; i++) doTask(t, month); });
      if (month === 1 && active) res.adopt.m1++; if (month === 3 && active) res.adopt.m3++; if (month === 6 && active) res.adopt.m6++;
    }
    // chi ha smesso prima conta come perso
    res.pers.push({ id: p.id, age: p.age, sex: p.sex, lit: p.lit, role: p.role, active, stoppedAt });
  });
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  Object.values(res.tasks).forEach(t => { t.firstAvg = avg(t.first); t.fail1Rate = avg(t.fail1); t.t3 = avg(t.t[3]); t.t10 = avg(t.t[10]); t.failRate = t.attempts ? t.failAll / t.attempts : 0; t.lit = Object.fromEntries(Object.entries(t.byLit).map(([k, v]) => [k, avg(v)])); delete t.first; delete t.fail1; delete t.t; delete t.byLit; });
  res.n = pop.length; return res;
}

/* stesso insieme di persone per tutti gli scenari (confronto equo): 5 ripetizioni con persone diverse, poi media */
function runScenario(scn, reps) {
  const agg = { tasks: {}, adopt: { m1: 0, m3: 0, m6: 0 }, help: 0, memberRuns: 0, n: 0, pers: [] };
  for (let i = 0; i < reps; i++) {
    seed = 20261108 + i * 7919; const pop = population(60); const r = simulate(pop, scn);
    agg.n += r.n; ['m1', 'm3', 'm6'].forEach(k => agg.adopt[k] += r.adopt[k]); agg.help += r.help; agg.memberRuns += r.memberRuns; agg.pers.push(...r.pers);
    Object.values(r.tasks).forEach(t => { const a = (agg.tasks[t.name] = agg.tasks[t.name] || { name: t.name, k: 0, firstAvg: 0, fail1Rate: 0, t3: 0, t10: 0, failRate: 0, lit: { L12: [], L3: [], L45: [] } }); a.k++; ['firstAvg', 'fail1Rate', 't3', 't10', 'failRate'].forEach(f => { a[f] += t[f] || 0; }); Object.entries(t.lit).forEach(([kk, v]) => { if (v != null) a.lit[kk].push(v); }); });
  }
  Object.values(agg.tasks).forEach(a => { ['firstAvg', 'fail1Rate', 't3', 't10', 'failRate'].forEach(f => { a[f] /= a.k; }); a.lit = Object.fromEntries(Object.entries(a.lit).map(([k, v]) => [k, v.length ? v.reduce((x, y) => x + y, 0) / v.length : null])); });
  agg.adoptPct = { m1: 100 * agg.adopt.m1 / agg.n, m3: 100 * agg.adopt.m3 / agg.n, m6: 100 * agg.adopt.m6 / agg.n }; agg.helpPer100 = 100 * agg.help / agg.memberRuns; return agg;
}
const SCN = {
  base: {},
  bigTargets: { bigTargets: true, bigText: true },
  guide: { guide: true },
  invite: { inviteLink: true },
  qr: { qr: true },
  all: { bigTargets: true, bigText: true, guide: true, inviteLink: true, qr: true }
};
const out = {}; Object.entries(SCN).forEach(([k, s]) => { out[k] = runScenario(s, 8); });
// per fascia
const bands = {}; out.base.pers.forEach(p => { const b = p.age < 40 ? '30-39' : p.age < 50 ? '40-49' : p.age < 60 ? '50-59' : '60-70'; const l = p.lit <= 2 ? 'Principiante' : p.lit === 3 ? 'Medio' : 'Esperto'; [['eta', b], ['lit', l], ['ruolo', p.role], ['sesso', p.sex]].forEach(([g, k]) => { const x = ((bands[g] = bands[g] || {})[k] = (bands[g][k] || { n: 0, act: 0 })); x.n++; if (p.active) x.act++; }); });
out.bands = bands; fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(out, null, 1));
const f = x => x.toFixed(1);
console.log('SCENARIO: adozione m1/m3/m6 % | aiuti/100 Run');
Object.keys(SCN).forEach(k => console.log(k.padEnd(11), f(out[k].adoptPct.m1), f(out[k].adoptPct.m3), f(out[k].adoptPct.m6), '|', f(out[k].helpPer100)));
console.log('FASCE (attivi a 6 mesi, base):'); Object.entries(bands).forEach(([g, o]) => console.log(g, Object.entries(o).map(([k, v]) => k + ' ' + Math.round(100 * v.act / v.n) + '%(' + v.n + ')').join('  ')));
console.log('COMPITI (base): prima volta s | 3a volta s | 10a s | errori al 1° tentativo %');
Object.values(out.base.tasks).forEach(t => console.log(t.name.slice(0, 44).padEnd(45), f(t.firstAvg), f(t.t3), f(t.t10), Math.round(t.fail1Rate * 100) + '%', JSON.stringify(Object.fromEntries(Object.entries(t.lit).map(([k, v]) => [k, v == null ? null : Math.round(v * 100)])))));
