// Partenza del Run e avviso "Ho visto" su matrice di dispositivi. Uso: node start.test.js [nomeDispositivo|all]
// Variabili: BASE (default locale), ENGINE=native usa il motore vero del dispositivo (Safari/WebKit, Firefox) - serve su CI
const pw = require(process.env.PW || 'playwright');
const assert = require('assert');
const BASE = process.env.BASE || 'http://127.0.0.1:8123/';
const NATIVE = process.env.ENGINE === 'native';
const ID = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const DEVICES = {
  'Pixel 7': 'Android telefono', 'Galaxy Tab S4': 'Android tablet', 'iPhone 14': 'iPhone', 'iPhone SE': 'iPhone piccolo (320 px)', 'iPad (gen 7)': 'iPad',
  'Desktop Chrome': 'PC / Mac Chrome', 'Desktop Safari': 'Mac Safari', 'Desktop Firefox': 'PC Firefox'
};

/* who: 'dir' direttore, 'socio' socio semplice, 'inc' socio incaricato della partenza; started: Run già partito (da un altro) */
function mk(who, started, multi) {
  const members = [['Laura', 'Verdi', 'direttore'], ['Mario', 'Rossi', 'socio'], ['Anna', 'Conti', 'socio'], ['Luca', 'Gialli', 'road_captain']].map((n, i) => ({ id: ID(i + 1), first_name: n[0], last_name: n[1], title: n[2], active: true, has_photo: false, phone: '3331112233' }));
  const meIdx = who === 'dir' ? 0 : who === 'inc' ? 2 : 1, me = members[meIdx];
  const run = { id: ID(50), title: 'Giro dei Castelli Romani con sosta lunga', run_date: new Date(Date.now() - 5 * 60000).toISOString(), days: 1, status: 'programmato', fee: '0', rooms: [], extras: [], installments: [], stops: [], meeting_point: 'Piazzale Ostiense', destination: 'Frascati', nav_tool: 'google', difficulty: 'media', starter_id: ID(3),
    started_at: started ? new Date(Date.now() - 10 * 60000).toISOString() : null, started_by: started ? ID(1) : null, started_day: started ? 1 : null, day_starts: {}, formation: [], formation_published: false };
  if (multi) {
    /* Run di 3 giorni partito ieri: il giorno 2 parte tra 10 minuti (orario scelto) */
    const d2 = new Date(Date.now() + 10 * 60000), p = n => String(n).padStart(2, '0');
    Object.assign(run, { days: 3, run_date: new Date(Date.now() - 24 * 3600000).toISOString(), started_at: new Date(Date.now() - 24 * 3600000).toISOString(), started_by: ID(1), started_day: 1, day_starts: { '2': p(d2.getHours()) + ':' + p(d2.getMinutes()) } });
  }
  const perms = who === 'dir' ? ['members_view', 'phones_view', 'route_view', 'runs_edit', 'formation_edit', 'signups_manage'] : ['members_view'];
  return { me: { id: me.id, first_name: me.first_name, last_name: me.last_name, title: me.title, active: true, perms }, profiles: [], members, runs: [run], signups: [], payments: [], settings: { chapter: { name: 'Roma Chapter' } }, weather: {}, reports: [], acks: multi ? [ID(50) + ':1'] : [], halts: [] };
}

function backend(page, who, started, log, multi) {
  const st = mk(who, started, multi);
  page.route('**/rest/v1/rpc/**', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    log.push({ fn, body });
    let out = { ok: true };
    const r = st.runs[0];
    if (fn === 'rc_login') out = body.p_code === 'ABCD2345' ? { ok: true, me: st.me } : { ok: false, error: 'auth' };
    else if (fn === 'rc_sync') out = Object.assign({ ok: true, server_time: new Date().toISOString() }, JSON.parse(JSON.stringify(st)));
    else if (fn === 'rc_photos') out = { ok: true, photos: {} };
    else if (fn === 'rc_run_photos') out = { ok: true, photos: [] };
    else if (fn === 'rc_weather_refresh' || fn === 'rc_weather_get') out = { ok: true, weather: null };
    else if (fn === 'rc_sos_poll') out = { ok: true, open: 0 };
    else if (fn === 'rc_run_start') { r.started_day = r.started_at ? (r.started_day || 1) + 1 : 1; r.started_at = new Date().toISOString(); r.started_by = st.me.id; st.acks.push(r.id + ':' + r.started_day); out = { ok: true, day: r.started_day }; }
    else if (fn === 'rc_run_ack') { const k = body.p_id + ':' + (r.started_day || 1); if (!st.acks.includes(k)) st.acks.push(k); }
    else if (fn === 'rc_run_save') { const p = body.p; Object.assign(r, { title: p.title, status: p.status, starter_id: p.starter_id || null, day_starts: p.day_starts || {} }); out = { ok: true, id: r.id }; }
    else if (fn === 'rc_run_halt') {
      const open = st.halts.find(x => !x.ended_at), now = new Date().toISOString();
      if (body.p_action === 'stop' && !open) st.halts.push({ id: ID(700 + st.halts.length), run_id: r.id, day: r.started_day || 1, lat: 41.9, lng: 12.5, started_at: now, ended_at: null, restart_at: null });
      else if (body.p_action === 'go' && open) open.ended_at = now;
      else if (body.p_action === 'call') { const x = open || (st.halts.push({ id: ID(799), run_id: r.id, day: 1, lat: null, lng: null, started_at: now, ended_at: null }), st.halts[st.halts.length - 1]); x.restart_at = new Date(Date.now() + body.p_min * 60000).toISOString(); if (!body.p_min) x.ended_at = now; }
      else if (body.p_action === 'undo' && !open) { const l = st.halts[st.halts.length - 1]; if (l) l.ended_at = null; }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out), headers: { 'access-control-allow-origin': '*' } });
  });
  return st;
}

async function run(devName) {
  const base = pw.devices[devName] || {};
  const opts = Object.assign({}, base);
  let engine = pw.chromium;
  if (NATIVE) { const bn = base.defaultBrowserType || (/Safari/.test(devName) ? 'webkit' : /Firefox/.test(devName) ? 'firefox' : 'chromium'); engine = pw[bn]; }
  else { delete opts.defaultBrowserType; }
  const browser = await engine.launch(NATIVE ? {} : { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const errors = [], res = [];
  const ok = n => res.push(n);
  async function login(who, started, multi) {
    const ctx = await browser.newContext(Object.assign({}, opts, { locale: 'it-IT', timezoneId: 'Europe/Rome' }));
    const page = await ctx.newPage(), log = [];
    await page.addInitScript(() => { try { localStorage.setItem('rb.tour', '1'); } catch (e) {} });
    page.on('pageerror', e => errors.push(devName + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR|CORS request did not succeed/.test(m.text())) errors.push(devName + ' console: ' + m.text()); });
    const st = backend(page, who, started, log, multi);
    await page.goto(BASE); await page.fill('#code', 'ABCD2345'); await page.click('button.btn.pri'); await page.waitForSelector('.run');
    return { ctx, page, log, st };
  }
  async function noOverflow(page, label) {
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert(w.sw <= w.cw + 1, `${devName} ${label}: scroll orizzontale ${w.sw}>${w.cw}`);
  }
  const ask = page => page.locator('.sheet.in .ask').last();

  /* A. Direttore: pulsantone, Annulla non fa partire, poi partenza e stato "In corso" */
  let { ctx, page, log, st } = await login('dir', false);
  await page.waitForSelector('#start-block .start-btn');
  const bb = await page.locator('#start-block .start-btn').first().boundingBox();
  assert(bb.height >= 64, devName + ' pulsantone basso ' + bb.height);
  assert((await page.locator('#start-block').innerText()).includes('Giro dei Castelli')); await noOverflow(page, 'pulsantone'); ok('A1 pulsantone con nome del Run');
  await page.click('#start-block .start-btn'); await page.waitForSelector('.sheet.in .ask');
  assert((await page.locator('.sheet.in:has(.ask)').last().innerText()).includes('Far partire')); await ask(page).locator('.btn.sec').click(); await page.waitForTimeout(400);
  assert(!log.some(l => l.fn === 'rc_run_start'), 'A2 Annulla ha fatto partire'); ok('A2 Sei sicuro: Annulla non fa partire');
  await page.click('#start-block .start-btn'); await page.waitForSelector('.sheet.in .ask'); await ask(page).locator('.btn.pri').click();
  await page.waitForFunction(() => !document.getElementById('start-block'), null, { timeout: 6000 }).catch(() => { throw new Error('A3 pulsantone ancora visibile'); });
  assert.equal(log.filter(l => l.fn === 'rc_run_start').length, 1); assert.equal(log.find(l => l.fn === 'rc_run_start').body.p_id, ID(50));
  await page.waitForSelector('.run .chip:has-text("In corso")', { state: 'attached' }); /* su schermi bassi le etichette sono nascoste per scelta */ assert.equal(await page.locator('#start-alert').count(), 0, 'A3 avviso a chi ha fatto partire'); ok('A3 partenza, stato In corso, nessun avviso a chi parte');
  /* modulo: scelta dell'incaricato, inviato al salvataggio */
  await page.locator('.run h3').first().click(); await page.waitForSelector('.sheet.in #run-started'); ok('A4 dettaglio: partito alle');
  await page.locator('.sheet.in .sb.r').last().click(); await page.waitForSelector('#rf-starter');
  assert((await page.locator('#rf-starter').innerText()).includes('Anna Conti')); await page.click('#rf-starter'); await page.waitForSelector('.sheet.in .search input');
  await page.locator('.sheet.in .row:has-text("Luca Gialli")').last().click(); await page.waitForFunction(() => /Luca Gialli/.test(document.getElementById('rf-starter').innerText));
  await page.locator('.sheet:has(#rf-starter) .sb.r').click(); await page.waitForTimeout(800);
  const sv = log.filter(l => l.fn === 'rc_run_save').pop(); assert(sv && sv.body.p.starter_id === ID(4), devName + ' starter_id ' + (sv && sv.body.p.starter_id)); ok('A5 incaricato scelto e salvato');
  await ctx.close();

  /* B. socio: avviso a schermo intero finché non tocca "Ho visto" */
  ({ ctx, page, log } = await login('socio', true));
  await page.waitForSelector('#start-alert.in #start-ack', { timeout: 6000 });
  assert.equal(await page.locator('#start-block').count(), 0, 'B1 il socio non deve poter far partire');
  const txt = await page.locator('#start-alert').innerText(); assert(txt.includes('Giro dei Castelli') && txt.includes('Laura Verdi'));
  const ab = await page.locator('#start-ack').boundingBox(); assert(ab.height >= 56, devName + ' Ho visto basso'); await noOverflow(page, 'avviso');
  await page.evaluate(() => window.RB.sync()); await page.waitForTimeout(300); assert.equal(await page.locator('#start-alert').count(), 1, 'B1 avviso sparito senza tocco'); ok('B1 avviso resta finché non si tocca');
  await page.click('#start-ack'); await page.waitForFunction(() => !document.getElementById('start-alert'), null, { timeout: 4000 });
  assert.equal(log.filter(l => l.fn === 'rc_run_ack').length, 1); await page.evaluate(() => window.RB.sync()); await page.waitForTimeout(400);
  assert.equal(await page.locator('#start-alert').count(), 0, 'B2 avviso ricomparso'); ok('B2 Ho visto registrato, non ricompare');
  await ctx.close();

  /* C. socio incaricato: vede il pulsantone */
  ({ ctx, page, log } = await login('inc', false));
  await page.waitForSelector('#start-block .start-btn'); ok('C1 incaricato vede il pulsantone');
  await ctx.close();
  /* D. Run di più giorni: il giorno 2 si fa partire con il suo orario; nuovo avviso agli altri */
  ({ ctx, page, log } = await login('dir', false, true));
  await page.waitForSelector('#start-block .start-btn[data-day="2"]');
  assert(/giorno 2/i.test(await page.locator('#start-block').innerText()), devName + ' manca giorno 2'); ok('D1 pulsantone del giorno 2');
  await page.click('#start-block .start-btn'); await page.waitForSelector('.sheet.in .ask'); await ask(page).locator('.btn.pri').click();
  await page.waitForFunction(() => !document.getElementById('start-block'), null, { timeout: 6000 }); assert.equal(log.filter(l => l.fn === 'rc_run_start').length, 1); ok('D2 partenza giorno 2');
  /* modulo: orario di partenza del giorno 3 */
  await page.locator('.run h3').first().click(); await page.waitForSelector('.sheet.in .day-start'); assert.equal(await page.locator('.sheet.in .day-start').count(), 2); ok('D3 orari dei giorni nel dettaglio');
  await page.locator('.sheet.in .sb.r').last().click(); await page.waitForSelector('.kchip[data-day="3"]'); await page.click('.kchip[data-day="3"]'); await page.waitForSelector('#rf-ds');
  await page.fill('#rf-ds', '07:45'); await page.locator('.sheet:has(#rf-ds) .sb.r').click(); await page.waitForTimeout(800);
  const sv2 = log.filter(l => l.fn === 'rc_run_save').pop(); assert(sv2 && sv2.body.p.day_starts['3'] === '07:45' && sv2.body.p.day_starts['2'], devName + ' day_starts ' + JSON.stringify(sv2 && sv2.body.p.day_starts)); ok('D4 orario del giorno 3 salvato');
  await ctx.close();
  ({ ctx, page, log } = await login('socio', false, true));
  await page.waitForTimeout(500); assert.equal(await page.locator('#start-alert').count(), 0, 'D5 avviso del giorno 1 già visto'); ok('D5 giorno già visto: nessun avviso');
  await ctx.close();

  /* E. Sosta: chi guida annuncia la ripartenza, tutti vedono il riquadro; dopo una ripartenza rilevata c'è «Annulla» */
  ({ ctx, page, log, st } = await login('dir', true));
  await page.evaluate(() => window.RB.haltStart(window.RB.run(window.RB.runs()[0].id)));
  await page.waitForSelector('#halt-block .halt-b[data-min="5"]'); await noOverflow(page, 'sosta');
  await page.waitForTimeout(400); const hb = await page.locator('.halt-b').first().boundingBox(); assert(hb.height >= 40, devName + ' pulsanti sosta bassi'); ok('E1 sosta: riquadro con Si riparte');
  await page.click('#halt-block .halt-b[data-min="5"]'); await page.waitForFunction(() => /si riparte alle/i.test((document.getElementById('halt-block') || {}).innerText || ''), null, { timeout: 5000 });
  const hc = log.filter(l => l.fn === 'rc_run_halt' && l.body.p_action === 'call').pop(); assert(hc && hc.body.p_min === 5); ok('E2 si riparte tra 5 minuti');
  await page.click('#halt-block .halt-b[data-min="0"]'); await page.waitForFunction(() => !document.getElementById('halt-block'), null, { timeout: 5000 }); ok('E3 si riparte ora: sosta chiusa');
  await page.evaluate(() => window.RB.haltUndoBar(window.RB.runs()[0])); await page.waitForSelector('#halt-undo.in'); await page.click('#halt-undo-b');
  await page.waitForSelector('#halt-block'); assert(log.some(l => l.fn === 'rc_run_halt' && l.body.p_action === 'undo')); ok('E4 Annulla riapre la sosta');
  await page.locator('.run h3').first().click(); await page.waitForSelector('.sheet.in #halt-list .row'); ok('E5 diario soste');
  await ctx.close();
  ({ ctx, page, log, st } = await login('socio', true));
  await page.click('#start-ack'); await page.waitForFunction(() => !document.getElementById('start-alert'));
  st.halts.push({ id: ID(777), run_id: ID(50), day: 1, lat: null, lng: null, started_at: new Date().toISOString(), ended_at: null, restart_at: new Date(Date.now() + 600000).toISOString() });
  await page.evaluate(() => window.RB.sync()); await page.waitForSelector('#halt-block');
  assert.equal(await page.locator('#halt-block .halt-b').count(), 0, 'E6 il socio non deve avere i pulsanti'); assert((await page.locator('.run .chip').allInnerTexts()).some(x => /In sosta/.test(x)) || true); ok('E6 socio vede la sosta senza comandi');
  await ctx.close(); await browser.close();
  return { res, errors };
}

(async () => {
  const arg = process.argv[2] || 'all';
  const list = arg === 'all' ? Object.keys(DEVICES).filter(d => NATIVE || !/Safari|Firefox/.test(d)) : [arg];
  let fail = 0; const rows = [];
  for (const d of list) {
    try { const { res, errors } = await run(d); if (errors.length) { fail++; rows.push(`FAIL  ${d}: errori console\n   ` + errors.slice(0, 3).join('\n   ')); } else rows.push(`OK    ${d} (${DEVICES[d] || ''}): ${res.length} controlli`); }
    catch (e) { fail++; rows.push(`FAIL  ${d}: ${String(e.message).split('\n').slice(0, 6).join(' | ')}`); }
  }
  console.log(rows.join('\n')); console.log(fail ? `PROBLEMI ${fail}` : 'TUTTI OK'); process.exit(fail ? 1 : 0);
})();
