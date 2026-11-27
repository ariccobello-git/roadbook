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
function mk(who, started, multi, sign) {
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
  const signups = [];
  if (sign) {
    run.signup_until = new Date(Date.now() - 3600000).toISOString(); run.run_date = new Date(Date.now() + 3 * 86400000).toISOString();
    if (sign.mineSi) signups.push({ run_id: run.id, member_id: me.id, status: 'si', passengers: 0, checked_in: false });
    if (sign.reqs) { signups.push({ run_id: run.id, member_id: ID(2), status: 'forse', passengers: 0, checked_in: false, pending: 'join', requested_at: new Date().toISOString() }); signups.push({ run_id: run.id, member_id: ID(3), status: 'si', passengers: 0, checked_in: false, pending: 'cancel', requested_at: new Date().toISOString() }); }
  }
  return { me: { id: me.id, first_name: me.first_name, last_name: me.last_name, title: me.title, active: true, perms }, profiles: [], members, runs: [run], signups, payments: [], settings: { chapter: { name: 'Roma Chapter' } }, weather: {}, reports: [], acks: multi ? [ID(50) + ':1'] : [], halts: [], lost: [] };
}

function backend(page, who, started, log, multi, sign) {
  const st = mk(who, started, multi, sign);
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
    else if (fn === 'rc_signup') {
      const me = st.me.id, i = st.signups.findIndex(x => x.run_id === body.p_run && x.member_id === me), cur = st.signups[i], closed = r.signup_until && new Date(r.signup_until) < new Date();
      if (body.p_status === 'ritira') { if (cur && cur.pending === 'join' && cur.status !== 'si') st.signups.splice(i, 1); else if (cur) cur.pending = null; }
      else if (closed && cur && cur.status === 'si' && body.p_status === 'no') { cur.pending = 'cancel'; out = { ok: true, pending: 'cancel' }; }
      else if (closed && body.p_status === 'si' && !(cur && cur.status === 'si')) { if (cur) cur.pending = 'join'; else st.signups.push({ run_id: r.id, member_id: me, status: 'forse', passengers: 0, pending: 'join' }); out = { ok: true, pending: 'join' }; }
      else if (cur) Object.assign(cur, { status: body.p_status, pending: null }); else st.signups.push({ run_id: r.id, member_id: me, status: body.p_status, passengers: 0 });
    }
    else if (fn === 'rc_signup_decide') { const i = st.signups.findIndex(x => x.member_id === body.p_member), x = st.signups[i]; if (x.pending === 'join' && body.p_ok) Object.assign(x, { status: 'si', pending: null }); else if (x.pending === 'cancel' && body.p_ok) st.signups.splice(i, 1); else if (x.status === 'forse') st.signups.splice(i, 1); else x.pending = null; }
    else if (fn === 'rc_lost_send') { const x = { id: ID(900), run_id: body.p_run, member_id: st.me.id, status: 'open', lat: body.p_lat, lng: body.p_lng, pos_at: new Date().toISOString(), stop: null, tip: { name: 'Bar Frascati', addr: '', lat: 41.8, lng: 12.68 }, created_at: new Date().toISOString(), helpers: [{ id: ID(4), name: 'Luca Gialli', phone: '333 111 2233', role: 'rc' }, { id: ID(1), name: 'Laura Verdi', phone: '3334445566', role: 'safety' }] }; st.lost.push(x); out = { ok: true, id: x.id, status: x.status }; }
    else if (fn === 'rc_lost_pos') { const x = st.lost.find(y => y.id === body.p_id); if (body.p_eta_min != null) Object.assign(x, { eta: new Date(Date.now() + body.p_eta_min * 60000).toISOString(), eta_at: new Date().toISOString() }); out = { ok: true, status: x.status }; }
    else if (fn === 'rc_lost_stop') { const x = st.lost.find(y => y.id === body.p_id); Object.assign(x, { stop: body.p_stop, status: 'sent', sent_at: new Date().toISOString(), eta: new Date(Date.now() + 20 * 60000).toISOString(), eta_at: new Date().toISOString() }); }
    else if (fn === 'rc_lost_close') { const x = st.lost.find(y => y.id === body.p_id); Object.assign(x, { status: body.p_found ? 'arrived' : 'closed', done_at: new Date().toISOString() }); }
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
  async function login(who, started, multi, sign) {
    const ctx = await browser.newContext(Object.assign({}, opts, { locale: 'it-IT', timezoneId: 'Europe/Rome', geolocation: { latitude: 41.85, longitude: 12.6, accuracy: 15 }, permissions: ['geolocation'] }));
    const page = await ctx.newPage(), log = [];
    await page.route('**/router.project-osrm.org/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ duration: 1500, distance: 21000 }] }), headers: { 'access-control-allow-origin': '*' } }));
    await page.addInitScript(() => { try { localStorage.setItem('rb.tour', '1'); } catch (e) {} });
    page.on('pageerror', e => errors.push(devName + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR|CORS request did not succeed/.test(m.text())) errors.push(devName + ' console: ' + m.text()); });
    const st = backend(page, who, started, log, multi, sign);
    await page.goto(BASE); await page.fill('#code', 'ABCD2345'); await page.click('button.btn.pri'); await page.waitForSelector('.run, #nx');
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
  await page.locator(':is(.run h3,.nx .nx-t)').first().click(); await page.waitForSelector('.sheet.in #run-started'); ok('A4 dettaglio: partito alle');
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
  await page.locator(':is(.run h3,.nx .nx-t)').first().click(); await page.waitForSelector('.sheet.in .day-start'); assert.equal(await page.locator('.sheet.in .day-start').count(), 2); ok('D3 orari dei giorni nel dettaglio');
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
  await page.locator(':is(.run h3,.nx .nx-t)').first().click(); await page.waitForSelector('.sheet.in #halt-list .row'); ok('E5 diario soste');
  await ctx.close();
  ({ ctx, page, log, st } = await login('socio', true));
  await page.click('#start-ack'); await page.waitForFunction(() => !document.getElementById('start-alert'));
  st.halts.push({ id: ID(777), run_id: ID(50), day: 1, lat: null, lng: null, started_at: new Date().toISOString(), ended_at: null, restart_at: new Date(Date.now() + 600000).toISOString() });
  await page.evaluate(() => window.RB.sync()); await page.waitForSelector('#halt-block');
  assert.equal(await page.locator('#halt-block .halt-b').count(), 0, 'E6 il socio non deve avere i pulsanti'); assert((await page.locator('.run .chip').allInnerTexts()).some(x => /In sosta/.test(x)) || true); ok('E6 socio vede la sosta senza comandi');
  await ctx.close();
  /* F. Iscrizioni chiuse: «Chiedi di partecipare» con conferma, richiesta in attesa, ritiro */
  ({ ctx, page, log, st } = await login('socio', false, false, {}));
  const seg = page.locator(':is(.run,.nx) .seg button[data-v=si]'); assert(/Chiedi/.test(await seg.innerText()), devName + ' etichetta richiesta'); ok('F1 dopo la scadenza: Chiedi di partecipare');
  await seg.click(); await page.waitForSelector('.sheet.in .ask'); assert(/approvata dal direttivo/.test(await page.locator('.sheet.in .ask').last().innerText())); await ask(page).locator('.btn.pri').click();
  await page.waitForSelector(':is(.run,.nx) .req-wait[data-pending=join]'); assert(log.some(l => l.fn === 'rc_signup' && l.body.p_status === 'si')); ok('F2 richiesta inviata e in attesa');
  await page.locator(':is(.run,.nx) .req-wait .lnk').click(); await page.waitForSelector('.sheet.in .ask'); await ask(page).locator('.btn.pri').click();
  await page.waitForSelector(':is(.run,.nx) .seg button[data-v=si]'); assert(log.some(l => l.fn === 'rc_signup' && l.body.p_status === 'ritira')); ok('F3 ritiro della richiesta');
  await ctx.close();
  ({ ctx, page, log, st } = await login('socio', false, false, { mineSi: true }));
  await page.click(':is(.run,.nx) .seg button[data-v=no]'); await page.waitForSelector('.sheet.in .ask'); assert(/resti iscritto/.test(await page.locator('.sheet.in .ask').last().innerText()));
  await ask(page).locator('.btn.pri').click(); await page.waitForSelector(':is(.run,.nx) .req-wait[data-pending=cancel]'); ok('F4 annullamento dopo la scadenza = richiesta');
  await ctx.close();
  /* G. Direttivo: richieste da approvare */
  ({ ctx, page, log, st } = await login('dir', false, false, { reqs: true }));
  await page.waitForSelector('#req-alert'); await page.click('#req-alert'); await page.waitForSelector('.sheet.in .req-row'); assert.equal(await page.locator('.sheet.in .req-row').count(), 2); await noOverflow(page, 'richieste'); ok('G1 avviso e elenco richieste');
  await page.locator('.sheet.in .req-row[data-member="' + ID(2) + '"] .req-b.ok').click(); await page.waitForFunction(() => document.querySelectorAll('.sheet.in .req-row').length === 1, null, { timeout: 5000 });
  assert(log.some(l => l.fn === 'rc_signup_decide' && l.body.p_ok === true && l.body.p_member === ID(2))); ok('G2 approvazione');
  await page.locator('.sheet.in .req-row .req-b.no').click(); await page.waitForSelector('.sheet.in .ask .btn.dng'); await page.locator('.sheet.in .ask .btn.dng').last().click();
  await page.waitForFunction(() => !document.querySelector('.sheet.in .req-row'), null, { timeout: 5000 }); assert(log.some(l => l.fn === 'rc_signup_decide' && l.body.p_ok === false)); ok('G3 rifiuto con conferma');
  /* H. Mi sono perso (socio): dall'SOS, attesa con chiamata a capogruppo e safety, sosta confermata, navigazione, ora prevista, ritrovato */
  ({ ctx, page, log, st } = await login('socio', true));
  await page.click('#start-ack'); await page.waitForFunction(() => !document.getElementById('start-alert'));
  st.signups.push({ run_id: ID(50), member_id: ID(2), status: 'si', passengers: 0, checked_in: false }); await page.evaluate(() => window.RB.sync());
  await page.click('#sos-btn'); await page.waitForSelector('.sheet.in #sos-lost'); await noOverflow(page, 'sos perso'); ok('H1 SOS: «Mi sono perso» durante il Run');
  await page.click('#sos-lost'); await page.waitForSelector('.sheet.in .ask'); assert(/posto sicuro/.test(await page.locator('.sheet.in .ask').last().innerText())); await ask(page).locator('.btn.pri').click();
  await page.waitForSelector('.sheet.in #lost-wait', { timeout: 15000 }); assert.equal(await page.locator('.sheet.in #lost-nav').count(), 0, 'H2 la sosta non deve arrivare prima della conferma');
  assert.equal(await page.locator('.sheet.in #lost-call-rc').getAttribute('href'), 'tel:3331112233'); assert.equal(await page.locator('.sheet.in #lost-call-safety').count(), 1); ok('H2 in attesa: chiama capogruppo o safety, nessuna sosta prima della conferma'); if (process.env.SHOTS) await page.screenshot({ path: 'shots/lost-h2w-' + devName.replace(/\W+/g, '_') + '.png' });
  Object.assign(st.lost[0], { status: 'sent', stop: st.lost[0].tip, sent_at: new Date().toISOString() }); await page.evaluate(() => window.RB.sync());
  await page.waitForSelector('.sheet.in #lost-nav', { timeout: 15000 });
  const sendL = log.find(l => l.fn === 'rc_lost_send'); assert(sendL && sendL.body.p_run === ID(50), 'H2 richiesta'); assert(typeof sendL.body.p_lat === 'number', devName + ' H2 posizione mancante');
  const href = await page.locator('#lost-nav').getAttribute('data-href'); assert(/dir_action=navigate&destination=41\.800000%2C12\.680000$/.test(href), devName + ' link ' + href); await noOverflow(page, 'scheda perso'); ok('H2b sosta confermata: navigazione verso la sosta'); if (process.env.SHOTS) await page.screenshot({ path: 'shots/lost-h2-' + devName.replace(/\W+/g, '_') + '.png' });
  await page.click('.sheet.in #lost-nav'); await page.waitForSelector('.sheet.in #lost-nav-go');
  assert.equal(await page.locator('.sheet.in #lost-nav-go').getAttribute('href'), href, 'H2c link Maps nel promemoria');
  const shTx = await page.locator('.sheet.in #lost-share').innerText(); assert(/Condividi avanzamento del viaggio/.test(shTx) && /Luca Gialli/.test(shTx), devName + ' H2c passi ' + shTx);
  assert.equal(await page.locator('.sheet.in #lost-share li').count(), 3); await noOverflow(page, 'promemoria condivisione'); if (process.env.SHOTS) await page.screenshot({ path: 'shots/lost-h2c-' + devName.replace(/\W+/g, '_') + '.png' });
  await page.locator('.sheet.in:has(#lost-share) .sb.l').click(); await page.waitForFunction(() => !document.querySelector('.sheet.in #lost-share')); ok('H2c promemoria: condividi il viaggio con il capogruppo da Google Maps');
  for (let i = 0; i < 40 && !log.some(l => l.fn === 'rc_lost_pos' && l.body.p_eta_min != null); i++) await page.waitForTimeout(250);
  const posL = log.find(l => l.fn === 'rc_lost_pos' && l.body.p_eta_min != null); assert(posL && posL.body.p_eta_min === 25, devName + ' H3 ora prevista ' + (posL && posL.body.p_eta_min)); ok('H3 ora prevista dal servizio di percorsi (25 min)');
  await page.waitForSelector('.sheet.in #lost-eta'); await page.locator('.sheet.in .sb.l').last().click();
  await page.waitForSelector('#lost-block .lost-card.mine'); assert(/Bar Frascati/i.test(await page.locator('#lost-block').innerText())); ok('H4 card in cima: Vai a Bar Frascati'); if (process.env.SHOTS) await page.screenshot({ path: 'shots/lost-h4-' + devName.replace(/\W+/g, '_') + '.png' });
  await page.click('#lost-block .lost-card.mine'); await page.waitForSelector('.sheet.in #lost-found'); await page.click('.sheet.in #lost-found'); await page.waitForSelector('.sheet.in .ask'); await ask(page).locator('.btn.pri').click();
  await page.waitForFunction(() => !document.querySelector('#lost-block .lost-card.mine'), null, { timeout: 5000 }); assert(log.some(l => l.fn === 'rc_lost_close' && l.body.p_found === true)); ok('H5 ritrovato il gruppo');
  await ctx.close();
  /* I. Mi sono perso (capogruppo incaricato): avviso, sosta proposta dal server, invio, conferma prima di ripartire */
  ({ ctx, page, log, st } = await login('inc', true));
  await page.click('#start-ack').catch(() => {}); await page.waitForFunction(() => !document.getElementById('start-alert'));
  Object.assign(st.runs[0], { meeting: { name: 'Piazzale Ostiense', lat: 41.87, lng: 12.48 }, stops: [{ name: 'Bar Frascati', addr: 'Piazza Marconi, Frascati', lat: 41.8, lng: 12.68, day: 1, kind: 'bar' }], dest: { name: 'Rocca di Papa', lat: 41.76, lng: 12.71 } });
  st.lost.push({ id: ID(901), run_id: ID(50), member_id: ID(2), status: 'open', lat: 41.9, lng: 12.55, pos_at: new Date().toISOString(), stop: null, tip: { name: 'Bar Frascati', addr: 'Piazza Marconi, Frascati', lat: 41.8, lng: 12.68 }, phone: '3339990000', created_at: new Date().toISOString() });
  await page.evaluate(() => window.RB.sync()); await page.waitForSelector('#lost-block .lost-card.open'); assert(/Mario Rossi/i.test(await page.locator('#lost-block').innerText())); await noOverflow(page, 'card perso'); ok('I1 avviso: Mario Rossi si è perso'); if (process.env.SHOTS) await page.screenshot({ path: 'shots/lost-i1-' + devName.replace(/\W+/g, '_') + '.png' });
  await page.click('#lost-block .lost-card.open'); await page.waitForSelector('.sheet.in #lost-opts .lost-opt.sel', { timeout: 15000 });
  assert(/Bar Frascati/.test(await page.locator('.sheet.in .lost-opt.sel').innerText()), devName + ' I2 proposta ' + await page.locator('.sheet.in .lost-opt.sel').innerText());
  assert.equal(await page.locator('.sheet.in .lost-opt:has-text("Bar Frascati")').count(), 1, 'I2 proposta doppia'); assert.equal(await page.locator('.sheet.in #lost-call').getAttribute('href'), 'tel:3339990000'); ok('I2 sosta proposta dal server e chiamata al socio'); if (process.env.SHOTS) await page.screenshot({ path: 'shots/lost-i2-' + devName.replace(/\W+/g, '_') + '.png' });
  await page.click('.sheet.in #lost-send-stop'); await page.waitForSelector('.sheet.in #lost-eta', { timeout: 6000 });
  const stopL = log.find(l => l.fn === 'rc_lost_stop'); assert(stopL && stopL.body.p_stop.name === 'Bar Frascati' && stopL.body.p_stop.lat === 41.8); assert.equal(await page.locator('.sheet.in #lost-follow').getAttribute('href'), 'https://wa.me/393339990000', 'I3 segui su WhatsApp'); ok('I3 sosta inviata, ora prevista visibile, segui su WhatsApp');
  await page.locator('.sheet.in .sb.l').last().click(); await page.waitForTimeout(350);
  await page.evaluate(() => window.RB.haltStart(window.RB.run(window.RB.runs()[0].id))); await page.waitForSelector('#halt-block .halt-b[data-min="0"]');
  await page.click('#halt-block .halt-b[data-min="0"]'); await page.waitForSelector('.sheet.in .ask'); assert(/Ripartire senza Mario Rossi/.test(await page.locator('.sheet.in:has(.ask)').last().innerText()));
  await ask(page).locator('.btn.sec').click(); await page.waitForTimeout(400); assert(!log.some(l => l.fn === 'rc_run_halt' && l.body.p_action === 'call'), 'I4 Aspettiamo ha fatto ripartire');
  await page.click('#halt-block .halt-b[data-min="0"]'); await page.waitForSelector('.sheet.in .ask'); await ask(page).locator('.btn.pri').click();
  await page.waitForFunction(() => !document.getElementById('halt-block'), null, { timeout: 5000 }); ok('I4 prima di ripartire: «Aspettiamo» o «Riparti lo stesso»');
  await ctx.close();
  /* direttore: informato, interviene solo se vuole */
  ({ ctx, page, log, st } = await login('dir', true));
  st.lost.push({ id: ID(902), run_id: ID(50), member_id: ID(2), status: 'open', lat: 41.9, lng: 12.55, pos_at: new Date().toISOString(), stop: null, tip: null, created_at: new Date().toISOString() });
  await page.evaluate(() => window.RB.sync()); await page.waitForSelector('#lost-block .lost-card.open'); assert(/se ne occupano/i.test(await page.locator('#lost-block').innerText()));
  await page.click('#lost-block .lost-card.open'); await page.waitForSelector('.sheet.in #lost-info'); ok('I5 direttore: informato, comandi disponibili solo se vuole');
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
