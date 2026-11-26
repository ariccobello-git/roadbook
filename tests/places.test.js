// Prova a schermo con Chrome senza interfaccia e un finto database (le chiamate a Supabase sono simulate)
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs'), assert = require('assert');
const XLSX = require('./node_modules/xlsx');
const BASE = 'http://127.0.0.1:8123/', SHOTS = __dirname + '/shots/';
fs.mkdirSync(SHOTS, { recursive: true });

const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
function nextSunday(h) { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); d.setHours(h, 0, 0, 0); return d.toISOString(); }
function plusDays(n, h) { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); }
let id = 0; const uid = () => '00000000-0000-4000-8000-' + String(++id).padStart(12, '0');

const ALL = ['members_view', 'phones_view', 'personal_view', 'route_view', 'formation_draft_view', 'runs_edit', 'formation_edit', 'signups_manage', 'photos_moderate', 'members_edit', 'payments_view', 'payments_edit', 'settings_edit', 'profiles_manage'];
const NOADM = ALL.filter(p => p !== 'profiles_manage');
const PROFILES = () => [
  { key: 'admin', name: 'Amministratore', perms: ALL, builtin: true, in_direttivo: false, rank: 0 }, { key: 'presidente', name: 'Presidente', perms: ALL, builtin: true, in_direttivo: true, rank: 1 },
  { key: 'direttore', name: 'Direttore', perms: ALL, builtin: true, in_direttivo: true, rank: 2 }, { key: 'vice_direttore', name: 'Vice direttore', perms: NOADM, builtin: true, in_direttivo: true, rank: 3 },
  { key: 'head_road_captain', name: 'Head Road Captain', perms: NOADM, builtin: true, in_direttivo: true, rank: 4 },
  { key: 'road_captain', name: 'Road Captain', perms: ['members_view', 'phones_view', 'route_view', 'formation_draft_view', 'runs_edit', 'formation_edit', 'signups_manage', 'photos_moderate'], builtin: true, in_direttivo: true, rank: 5 },
  { key: 'officer', name: 'Officer', perms: NOADM, builtin: true, in_direttivo: true, rank: 6 }, { key: 'socio', name: 'Socio', perms: ['members_view'], builtin: true, in_direttivo: false, rank: 7 },
  { key: 'c_seg_ab12', name: 'Segreteria', perms: ['members_view', 'phones_view', 'personal_view', 'payments_view'], builtin: false, in_direttivo: true, rank: 100 },
  { key: 'c_osp_0000', name: 'Ospite', perms: [], builtin: false, in_direttivo: false, rank: 100 }];
const KINDS = { 3: 'presidente', 1: 'socio', ospite: 'c_osp_0000', seg: 'c_seg_ab12', rc: 'road_captain' };

function makeState(level) {
  const M = (fn, ln, title, extra) => Object.assign({ id: uid(), first_name: fn, last_name: ln, title, active: true, bike: null, has_photo: false, phone: '3331112233', email: 'a@b.it', birth_date: null, tessera: null, joined_on: '2018-05-01', notes: null, access_code: 'ABCD2345' }, extra);
  const members = [M('Marco', 'Bianchi', 'presidente', { has_photo: true, bike: 'Road King' }), M('Laura', 'Verdi', 'direttore'), M('Paolo', 'Neri', 'vice_direttore'), M('Giulia', 'Rossi', 'head_road_captain', { has_photo: true }),
    M('Luca', 'Gialli', 'road_captain'), M('Sara', 'Blu', 'officer'), M('Mario', 'Rossi', 'socio', { bike: 'Street Glide', joined_on: '2023-01-10' }), M('Anna', 'Conti', 'socio', { joined_on: '2021-03-01' }),
    M('Franco', 'Riva', 'socio'), M('Elena', 'Fontana', 'socio'), M('Dario', 'Moretti', 'socio'), M('Chiara', 'Gatti', 'socio')];
  const me = members[0];
  const runs = [
    { id: uid(), title: 'Giro dei Castelli Romani', run_date: nextSunday(9), meeting_point: 'Piazzale Ostiense, Roma', destination: 'Frascati', description: 'Giro tranquillo con sosta caffè.\nPortare documenti.', km: 120, difficulty: 'media', route_url: 'https://maps.example.com/r1', nav_tool: 'google', stops: [{ time: '10:30', name: 'Caffè a Grottaferrata', addr: 'Via Roma 1, Grottaferrata' }, { time: '13:00', name: 'Pranzo a Frascati', addr: 'Piazza Marconi, Frascati' }], status: 'programmato', max_participants: 30, formation_published: false, formation: [], updated_at: new Date().toISOString() },
    { id: uid(), title: 'Weekend sul Lago di Bolsena', run_date: plusDays(21, 8), meeting_point: 'Casello Roma Nord', destination: 'Bolsena', description: '', km: 260, difficulty: 'impegnativa', route_url: null, stops: [], status: 'annullato', max_participants: null, formation_published: false, formation: [], updated_at: new Date().toISOString() },
    { id: uid(), title: 'Pranzo di fine stagione', run_date: plusDays(-20, 10), meeting_point: 'Ostia', destination: 'Fregene', description: '', km: 60, difficulty: 'facile', route_url: null, stops: [], status: 'concluso', max_participants: null, formation_published: true, formation: [], updated_at: new Date().toISOString() }];
  const sg = (r, m, st, p, c) => ({ run_id: r.id, member_id: m.id, status: st, passengers: p || 0, checked_in: !!c });
  const signups = [sg(runs[0], members[3], 'si', 0), sg(runs[0], members[4], 'si', 1), sg(runs[0], members[5], 'si'), sg(runs[0], members[6], 'si'), sg(runs[0], members[7], 'forse'), sg(runs[0], members[8], 'no'), sg(runs[0], members[9], 'si', 1), sg(runs[0], members[10], 'si')];
  const st = { me: { id: me.id, first_name: me.first_name, last_name: me.last_name, title: KINDS[level], perms: PROFILES().find(p => p.key === KINDS[level]).perms }, profiles: PROFILES(), members, runs, signups,
    payments: [{ id: uid(), member_id: members[6].id, year: new Date().getFullYear(), amount: 50, method: 'bonifico', paid_on: '2026-02-01', note: null }],
    settings: { chapter: { name: 'Roma Chapter' }, payment_info: { annual_fee: '50', methods: ['contanti', 'bonifico'], iban: 'IT60 X054 2811 1010 0000 0123 456', holder: 'Roma Chapter ASD', causale: 'Quota {anno} - Cognome Nome', cash_contact: 'Sara Blu', cash_note: 'Alla partenza dei Run', deadline: '2026-03-31' } } };
  st.runs.forEach(r => { r.nav_tool = r.nav_tool || 'both'; });
  const pm = st.me.perms; const mid = st.me.id;
  st.members.forEach(m => { if (m.id === mid) m.title = st.me.title; if (!pm.includes('members_edit')) delete m.access_code; if (!pm.includes('personal_view')) { delete m.email; delete m.birth_date; delete m.tessera; delete m.joined_on; delete m.notes; } if (!pm.includes('phones_view') && m.id !== mid) delete m.phone; });
  if (!pm.includes('members_view')) st.members = st.members.filter(m => m.id === mid);
  if (!pm.includes('route_view')) st.runs.forEach(r => { r.stops = []; r.route_url = null; });
  return st;
}

function backend(page, level, log) {
  const st = makeState(level);
  page.route('**/rest/v1/rpc/**', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    log.push({ fn, body });
    let out = { ok: true };
    if (fn === 'rc_login') out = body.p_code === 'ABCD2345' ? { ok: true, me: st.me } : { ok: false, error: 'auth' };
    else if (fn === 'rc_sync') out = Object.assign({ ok: true, server_time: new Date().toISOString() }, st);
    else if (fn === 'rc_photos') out = { ok: true, photos: Object.fromEntries(st.members.filter(m => m.has_photo).map(m => [m.id, GIF])) };
    else if (fn === 'rc_run_photos') out = { ok: true, photos: [{ id: uid(), member_id: st.members[0].id, caption: null, data: GIF, created_at: new Date().toISOString() }] };
    else if (fn === 'rc_signup') { const i = st.signups.findIndex(s => s.run_id === body.p_run && s.member_id === (body.p_member || st.me.id)); const row = { run_id: body.p_run, member_id: body.p_member || st.me.id, status: body.p_status, passengers: body.p_passengers, checked_in: false }; if (body.p_status === 'rimuovi') { if (i >= 0) st.signups.splice(i, 1); } else if (i >= 0) st.signups[i] = row; else st.signups.push(row); }
    else if (fn === 'rc_formation_save') { const r = st.runs.find(x => x.id === body.p_run); r.formation = body.p_formation; r.formation_published = body.p_publish; }
    else if (fn === 'rc_run_save') { const p = body.p; if (p.id) Object.assign(st.runs.find(r => r.id === p.id), { title: p.title, status: p.status, nav_tool: p.nav_tool, stops: p.stops }); else st.runs.push(Object.assign({ id: uid(), formation: [], formation_published: false, updated_at: new Date().toISOString() }, p, { km: p.km ? +p.km : null, max_participants: p.max_participants ? +p.max_participants : null })); out = { ok: true, id: p.id || 'x' }; }
    else if (fn === 'rc_member_save') { const p = body.p; const nm = Object.assign({ id: uid(), active: true, has_photo: false, access_code: 'WXYZ6789' }, p); st.members.push(nm); out = { ok: true, id: nm.id }; }
    else if (fn === 'rc_profile_save') { const p = body.p; if (p.key) Object.assign(st.profiles.find(x => x.key === p.key), { name: p.name, perms: p.perms, in_direttivo: p.in_direttivo }); else st.profiles.push({ key: 'c_new_' + st.profiles.length, name: p.name, perms: p.perms, builtin: false, in_direttivo: p.in_direttivo, rank: 100 }); out = { ok: true, key: p.key || 'c_new' }; }
    else if (fn === 'rc_profile_delete') { st.profiles = st.profiles.filter(x => x.key !== body.p_key); }
    else if (fn === 'rc_payment_save') { st.payments.push(Object.assign({ id: uid() }, body.p, { amount: +body.p.amount })); }
    else if (fn === 'rc_members_import') out = { ok: true, inserted: body.p_rows.length, updated: 0, skipped: 0, errors: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out), headers: { 'access-control-allow-origin': '*' } });
  });
  return st;
}

async function newPage(browser, vp, level, log, errors) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, locale: 'it-IT', timezoneId: 'Europe/Rome', permissions: [] });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('rb.tour', '1'); } catch (e) {} });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/cdnjs.cloudflare.com/**/xlsx.full.min.js', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync('./node_modules/xlsx/dist/xlsx.full.min.js') }));
  const st = backend(page, level, log);
  return { ctx, page, st };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const errors = [], log = [], net = [];
  let { ctx, page, st } = await newPage(browser, { width: 390, height: 844 }, 3, log, errors);
  const step = (n) => console.log('ok -', n);
  const TOP = () => page.locator('.sheet.in').last();
  const wait = (ms) => page.waitForTimeout(ms);
  const rowByTitle = (t) => TOP().locator('.row', { has: page.locator('b', { hasText: new RegExp('^' + t + '$') }) }).first();
  /* servizi esterni simulati */
  await page.route('**/unpkg.com/leaflet@1.9.4/dist/**', r => { const f = r.request().url().split('/dist/')[1]; r.fulfill({ contentType: f.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync('./node_modules/leaflet/dist/' + f) }); });
  await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/gif', body: Buffer.from(GIF.split(',')[1], 'base64') }));
  await page.route('**/nominatim.openstreetmap.org/**', r => {
    const u = new URL(r.request().url()); net.push(u.pathname + u.search);
    let body;
    if (u.pathname === '/reverse') body = { name: '', display_name: 'Via Test 1, Roma', address: { road: 'Via Test', house_number: '1', city: 'Roma' } };
    else { const q = (u.searchParams.get('q') || '').toLowerCase(); body = q.includes('milano') ? [{ lat: '45.4642', lon: '9.19', name: 'Milano', display_name: 'Milano, Lombardia', address: { city: 'Milano' } }] : q.includes('vuoto') ? [] : [{ lat: '41.85', lon: '12.51', name: '', display_name: 'Via Appia Nuova, Roma', address: { road: 'Via Appia Nuova', city: 'Roma' } }, { lat: '41.80', lon: '12.55', name: 'Bar Appia', display_name: 'Bar Appia, Roma', address: { road: 'Via Appia', house_number: '9', city: 'Roma' } }]; }
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('**/overpass-api.de/**', r => {
    const q = decodeURIComponent(new URL(r.request().url()).searchParams.get('data')); net.push(q);
    const m = q.match(/around:\d+,([\d.]+),([\d.]+)/), la = +m[1], lo = +m[2];
    const els = q.includes('"place"') ? [{ lat: la, lon: lo, tags: { name: 'Quartiere Uno' } }] : [{ type: 'node', lat: la + 0.05, lon: lo, tags: { name: 'Albergo Lontano', 'addr:street': 'Via Lunga', 'addr:housenumber': '5', 'addr:city': 'Roma' } }, { type: 'node', lat: la + 0.01, lon: lo, tags: { name: 'Area Vicina', highway: 'services', operator: 'Autogrill' } }];
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: els }), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('**/router.project-osrm.org/**', r => { net.push('osrm'); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ distance: 400000, legs: r.request().url().split('/driving/')[1].split('?')[0].split(';').slice(1).map(() => ({ duration: 7200 })) }] }), headers: { 'access-control-allow-origin': '*' } }); });

  await page.goto(BASE); await page.waitForSelector('#code'); await page.fill('#code', 'abcd-2345'); await page.click('text=Entra'); await page.waitForSelector('.run');

  /* il socio non vede percorso né tappe */
  { const c2 = await newPage(browser, { width: 390, height: 844 }, 1, log, errors);
    await c2.page.goto(BASE); await c2.page.waitForSelector('#code'); await c2.page.fill('#code', 'abcd-2345'); await c2.page.click('text=Entra'); await c2.page.waitForSelector('.run');
    await c2.page.click('.run h3'); await c2.page.waitForSelector('.sheet.in .list'); await c2.page.waitForTimeout(500);
    const mt = await c2.page.textContent('.sheet.in'); assert.ok(mt.includes('Piazzale Ostiense') && mt.includes('Frascati'), 'ritrovo e destinazione visibili');
    assert.ok(!mt.includes('Grottaferrata') && !mt.includes('Tappe') && !mt.includes('Navigatore') && !/Apri in/.test(mt), 'niente tappe/navigatore per il socio');
    assert.strictEqual(await c2.page.locator('.sheet.in a[href*="maps"]').evaluateAll(a => a.filter(x => /dir|saddr/.test(x.href)).length), 0); step('socio: solo ritrovo e destinazione, nessun percorso, tappa o navigatore');
    await c2.page.screenshot({ path: SHOTS + '20-socio-run.png' }); await c2.ctx.close(); }

  /* nuovo Run */
  await page.click('button[aria-label="Nuovo Run"]'); await page.waitForSelector('.sheet.in .row.act'); await page.click('.sheet.in .row.act:has-text("da zero")'); await page.waitForSelector('#rf-title'); await wait(500);
  await page.fill('#rf-title', 'Raduno Lago');
  await rowByTitle('Ritrovo').click(); await page.waitForSelector('.pp'); await wait(500);
  assert.strictEqual(await TOP().locator('.pp-def .btn').count(), 2); assert.ok((await TOP().locator('.pp-def').textContent()).includes("Fungo dell'EUR") && (await TOP().locator('.pp-def').textContent()).includes('H-D Store Roma') && !(await TOP().locator('.pp-def').textContent()).includes('Area di servizio'));
  await page.screenshot({ path: SHOTS + '21-picker.png' });
  await TOP().locator('.pp-def .btn', { hasText: 'H-D Store Roma' }).click(); await wait(700);
  assert.ok((await TOP().textContent()).includes('H-D Store Roma') && (await TOP().textContent()).includes('Via Pontina 583')); step('ritrovo predefinito: H-D Store Roma in un tocco');
  await rowByTitle('Ritrovo').click(); await page.waitForSelector('.pp'); await wait(500);
  await TOP().locator('.pp-def .btn', { hasText: "Fungo dell'EUR" }).click(); await wait(700);
  assert.ok((await TOP().textContent()).includes("Fungo dell'EUR")); step('ritrovo predefinito: Fungo dell\'EUR in un tocco');

  /* destinazione: albergo, elenco città > zona > tabella */
  await rowByTitle('Destinazione').click(); await page.waitForSelector('.pp'); await wait(500);
  await TOP().locator('.kchip', { hasText: 'Albergo' }).click(); await wait(200);
  await TOP().locator('.kchip', { hasText: 'Roma' }).click(); await wait(200);
  await TOP().locator('.row', { hasText: 'EUR' }).first().click(); await wait(900);
  assert.ok(net.some(q => q.includes('"tourism"~"^(hotel|motel|hostel|guest_house)$"') && q.includes('around:15000,41.83360,12.47080')), 'query alberghi attorno a EUR');
  let tt = await TOP().textContent(); assert.ok(tt.includes('Albergo Lontano') && tt.includes('km'), 'tabella con distanze'); step('elenco a scalare: città → zona → tabella alberghi con distanza');
  await page.screenshot({ path: SHOTS + '22-tabella.png' });
  await TOP().locator('.pp-r', { hasText: 'Albergo Lontano' }).click();
  assert.strictEqual(await TOP().locator('#pp-name').inputValue(), 'Albergo Lontano'); assert.ok((await TOP().locator('#pp-addr').inputValue()).includes('Via Lunga 5'));
  await TOP().locator('.sb.r').click(); await wait(700);
  assert.ok((await TOP().textContent()).includes('Fine giornata 1'), 'a fine tappa propone il giorno dopo'); await page.screenshot({ path: SHOTS + '27-fine-giornata.png' });
  await TOP().locator('button', { hasText: 'No, va bene così' }).click(); await wait(600);
  assert.ok((await TOP().textContent()).includes('Albergo Lontano')); step('destinazione scelta dalla tabella; a fine tappa chiede del giorno dopo (risposta No)');

  /* tappa 1: indirizzo (bar) */
  await TOP().locator('button', { hasText: 'Aggiungi' }).first().click(); await wait(200);
  await rowByTitle('Tappa 1').click(); await page.waitForSelector('.pp'); await wait(500);
  await TOP().locator('.kchip', { hasText: 'Bar' }).click(); await TOP().locator('.seg button', { hasText: 'Indirizzo' }).click(); await wait(200);
  await TOP().locator('#pp-q').fill('via appia'); await TOP().locator('.pp-sf button').click(); await wait(600);
  await TOP().locator('.pp-r', { hasText: 'Bar Appia' }).click();
  await TOP().locator('.sb.r').click(); await wait(700);
  assert.ok((await TOP().textContent()).includes('Bar Appia')); step('tappa da ricerca per indirizzo');
  /* ricerca senza risultati: si può usare il testo */
  await rowByTitle('Tappa 1').click(); await page.waitForSelector('.pp'); await wait(400);
  await TOP().locator('.seg button', { hasText: 'Indirizzo' }).click(); await TOP().locator('#pp-q').fill('vuoto'); await TOP().locator('.pp-sf button').click(); await wait(600);
  assert.ok((await TOP().textContent()).includes('Nessun risultato') && (await TOP().textContent()).includes('Usa come indirizzo scritto'));
  await TOP().locator('.row', { hasText: 'Usa come indirizzo scritto' }).click(); assert.ok((await TOP().locator('#pp-co').textContent()).includes('Senza coordinate'));
  await TOP().locator('.sb.l').click(); await wait(600); step('nessun risultato: alternativa testo libero');

  /* tappa 2: mappa */
  await TOP().locator('button', { hasText: 'Aggiungi' }).first().click(); await wait(200);
  await rowByTitle('Tappa 2').click(); await page.waitForSelector('.pp'); await wait(500);
  await TOP().locator('.seg button', { hasText: 'Mappa' }).click(); await page.waitForFunction(() => window.rbMap, null, { timeout: 8000 }); await wait(600);
  assert.ok(await page.evaluate(() => !!window.rbMap && window.rbMap.getZoom() > 5)); await page.screenshot({ path: SHOTS + '23-mappa.png' });
  const before = await page.evaluate(() => window.rbMap.getCenter().lat);
  const box = await page.locator('.pp-map').boundingBox(); await page.mouse.move(box.x + 150, box.y + 150); await page.mouse.down(); await page.mouse.move(box.x + 150, box.y + 230, { steps: 8 }); await page.mouse.up(); await wait(400);
  assert.ok(await page.evaluate(b => window.rbMap.getCenter().lat > b, before), 'la mappa si sposta col trascinamento');
  await TOP().locator('#pp-here').click(); await wait(700);
  assert.strictEqual(await TOP().locator('#pp-addr').inputValue(), 'Via Test 1, Roma'); assert.ok(/\d+\.\d+, \d+\.\d+/.test(await TOP().locator('#pp-co').textContent()));
  await TOP().locator('#pp-name').fill('Punto panoramico'); await TOP().locator('.sb.r').click(); await wait(700);
  assert.ok((await TOP().textContent()).includes('Punto panoramico')); step('tappa scelta sulla mappa (trascinamento + punto + indirizzo)');

  /* km stimati e su strada */
  const km1 = +(await page.inputValue('#rf-km')); assert.ok(km1 > 0 && km1 < 100, 'km stimati ' + km1);
  await page.click('#rf-calc'); await wait(800); assert.strictEqual(+(await page.inputValue('#rf-km')), 400); assert.ok(net.includes('osrm')); step('km stimati e poi calcolati su strada (400)');
  assert.ok((await TOP().textContent()).includes('Oltre') || (await TOP().textContent()).includes('500') === false);

  /* destinazione lontana (>500 km): avviso e proposta del giorno dopo */
  await rowByTitle('Destinazione').click(); await page.waitForSelector('.pp'); await wait(400);
  await TOP().locator('.seg button', { hasText: 'Indirizzo' }).click(); await TOP().locator('#pp-q').fill('milano'); await TOP().locator('.pp-sf button').click(); await wait(600);
  await TOP().locator('.pp-r', { hasText: 'Milano' }).click(); await TOP().locator('.sb.r').click(); await wait(900);
  tt = await TOP().textContent(); assert.ok(/Dopo 500 km/.test(tt), 'avviso 500 km: ' + tt.slice(0, 200)); await page.screenshot({ path: SHOTS + '24-500km.png' });
  await TOP().locator('button', { hasText: 'Sì, aggiungi un giorno' }).click(); await wait(800);
  assert.strictEqual(await page.textContent('#rf-days'), '2'); assert.ok((await page.locator('.kchip[data-day="2"].on').count()) === 1); step('oltre 500 km: avviso e giorno 2 aggiunto');
  /* giorno 1: arrivo pernottamento = vecchia destinazione */
  await page.locator('.kchip[data-day="1"]').click(); await wait(300);
  tt = await TOP().textContent(); assert.ok(tt.includes('Arrivo giorno 1') && tt.includes('Milano')); step('la vecchia destinazione diventa arrivo del giorno 1');
  await page.locator('.kchip[data-day="2"]').click(); await wait(300);
  tt = await TOP().textContent(); assert.ok(tt.includes('Partenza') && tt.includes('Scegli…')); await page.screenshot({ path: SHOTS + '25-giorno2.png' });
  await rowByTitle('Destinazione').click(); await page.waitForSelector('.pp'); await wait(400);
  await TOP().locator('.seg button', { hasText: 'Indirizzo' }).click(); await TOP().locator('#pp-q').fill('via appia'); await TOP().locator('.pp-sf button').click(); await wait(600);
  await TOP().locator('.pp-r', { hasText: 'Bar Appia' }).click(); await TOP().locator('.sb.r').click(); await wait(900);
  if (await page.locator('.sheet.in .ask').count()) { await TOP().locator('button', { hasText: 'No, va bene così' }).click(); await wait(500); }

  /* salvataggio */
  await TOP().locator('.sb.r').click(); await wait(800);
  const sv = log.filter(l => l.fn === 'rc_run_save').pop().body.p;
  assert.strictEqual(sv.days, 2); assert.strictEqual(sv.meeting.name, "Fungo dell'EUR"); assert.strictEqual(sv.meeting.lat, 41.824428); assert.strictEqual(sv.route_public, false);
  assert.strictEqual(sv.dest.name, 'Bar Appia'); assert.ok(sv.stops.some(s => s.end && s.day === 1 && s.addr.includes('Milano'))); assert.ok(sv.stops.some(s => s.day === 1 && !s.end && s.name === 'Punto panoramico' && s.lat));
  assert.ok(sv.stops.every(s => s.day >= 1 && s.day <= 2)); assert.strictEqual(sv.meeting.tm, 0); assert.ok(sv.stops.filter(s => s.day === 1 && !s.end && s.lat)[0].tm === 120 && sv.dest.tm > 0 && sv.stops.filter(s => s.end)[0].tm > 120, 'tempi navigatore salvati'); step('salvataggio: giorni, ritrovo con coordinate, tappe per giorno, arrivo e destinazione');

  /* dettaglio organizzatore: giorni e navigazione per giorno */
  await wait(600); await page.click('.run h3:has-text("Raduno Lago")'); await page.waitForSelector('.sheet.in .tl'); await wait(500);
  tt = await TOP().textContent(); assert.ok(tt.includes('Giorno 1') && tt.includes('Giorno 2')); 
  const hrefs = await TOP().locator('a[href]').evaluateAll(a => a.map(x => x.href));
  assert.ok(hrefs.some(h => h.includes('google.com/maps/dir') && h.includes('origin=41.824428%2C12.462984'))); assert.ok(hrefs.filter(h => h.includes('google.com/maps/dir')).length === 2 && !hrefs.some(h => h.includes('maps.apple.com'))); step('dettaglio: percorso per giorno con Google Maps');
  await page.screenshot({ path: SHOTS + '26-dettaglio-giorni.png' });
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  await browser.close(); console.log('PLACES OK');
})().catch(e => { console.error(e); process.exit(1); });
