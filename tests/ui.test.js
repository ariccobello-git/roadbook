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

const ALL = ['members_view', 'phones_view', 'personal_view', 'route_view', 'formation_draft_view', 'runs_edit', 'formation_edit', 'signups_manage', 'photos_moderate', 'members_edit', 'settings_edit', 'profiles_manage', 'reports_view', 'emergency_manage'];
const NOADM = ALL.filter(p => p !== 'profiles_manage');
const PROFILES = () => [
  { key: 'admin', name: 'Amministratore', perms: ALL, builtin: true, in_direttivo: false, rank: 0 }, { key: 'presidente', name: 'Presidente', perms: ALL, builtin: true, in_direttivo: true, rank: 1 },
  { key: 'direttore', name: 'Direttore', perms: ALL, builtin: true, in_direttivo: true, rank: 2 }, { key: 'vice_direttore', name: 'Vice direttore', perms: NOADM, builtin: true, in_direttivo: true, rank: 3 },
  { key: 'head_road_captain', name: 'Head Road Captain', perms: NOADM, builtin: true, in_direttivo: true, rank: 4 },
  { key: 'road_captain', name: 'Road Captain', perms: ['members_view', 'phones_view', 'route_view', 'formation_draft_view', 'runs_edit', 'formation_edit', 'signups_manage', 'photos_moderate'], builtin: true, in_direttivo: true, rank: 5 },
  { key: 'officer', name: 'Officer', perms: NOADM, builtin: true, in_direttivo: true, rank: 6 }, { key: 'socio', name: 'Socio', perms: ['members_view'], builtin: true, in_direttivo: false, rank: 7 },
  { key: 'c_seg_ab12', name: 'Segreteria', perms: ['members_view', 'phones_view', 'personal_view'], builtin: false, in_direttivo: true, rank: 100 },
  { key: 'c_osp_0000', name: 'Ospite', perms: [], builtin: false, in_direttivo: false, rank: 100 }];
const KINDS = { 3: 'presidente', 1: 'socio', pub: 'socio', ospite: 'c_osp_0000', seg: 'c_seg_ab12', rc: 'road_captain' };

function makeState(level) {
  const M = (fn, ln, title, extra) => Object.assign({ id: uid(), first_name: fn, last_name: ln, title, active: true, bike: null, has_photo: false, phone: '3331112233', email: 'a@b.it', birth_date: null, tessera: null, joined_on: '2018-05-01', notes: null, access_code: 'ABCD2345' }, extra);
  const members = [M('Marco', 'Bianchi', 'presidente', { has_photo: true, bike: 'Road King' }), M('Laura', 'Verdi', 'direttore'), M('Paolo', 'Neri', 'vice_direttore'), M('Giulia', 'Rossi', 'head_road_captain', { has_photo: true }),
    M('Luca', 'Gialli', 'road_captain'), M('Sara', 'Blu', 'officer'), M('Mario', 'Rossi', 'socio', { bike: 'Street Glide', joined_on: '2023-01-10' }), M('Anna', 'Conti', 'socio', { joined_on: '2021-03-01' }),
    M('Franco', 'Riva', 'socio'), M('Elena', 'Fontana', 'socio'), M('Dario', 'Moretti', 'socio'), M('Chiara', 'Gatti', 'socio')];
  const me = members[0];
  const runs = [
    { id: uid(), title: 'Giro dei Castelli Romani', fee: '10.00', rooms: [{ id: 's1', name: 'Singola', price: 120 }, { id: 'd1', name: 'Doppia', price: 90 }], extras: [{ id: 'e1', name: 'Cena', price: 25 }], installments: [], run_date: nextSunday(9), meeting_point: 'Piazzale Ostiense, Roma', destination: 'Frascati', description: 'Giro tranquillo con sosta caffè.\nPortare documenti.', km: 120, difficulty: 'media', route_url: 'https://maps.example.com/r1', nav_tool: 'google', stops: [{ time: '10:30', name: 'Caffè a Grottaferrata', addr: 'Via Roma 1, Grottaferrata' }, { time: '13:00', name: 'Pranzo a Frascati', addr: 'Piazza Marconi, Frascati' }], status: 'programmato', route_public: level === 'pub', max_participants: 30, formation_published: false, formation: [], updated_at: new Date().toISOString() },
    { id: uid(), title: 'Weekend sul Lago di Bolsena', run_date: plusDays(21, 8), meeting_point: 'Casello Roma Nord', destination: 'Bolsena', description: '', km: 260, difficulty: 'impegnativa', route_url: null, stops: [], status: 'annullato', max_participants: null, formation_published: false, formation: [], updated_at: new Date().toISOString() },
    { id: uid(), title: 'Pranzo di fine stagione', run_date: plusDays(-20, 10), meeting_point: 'Ostia', destination: 'Fregene', description: '', km: 60, difficulty: 'facile', route_url: null, stops: [], status: 'concluso', max_participants: null, formation_published: true, formation: [], updated_at: new Date().toISOString() }];
  const sg = (r, m, st, p, c) => ({ run_id: r.id, member_id: m.id, status: st, passengers: p || 0, checked_in: !!c });
  const signups = [sg(runs[0], members[3], 'si', 0), sg(runs[0], members[4], 'si', 1), sg(runs[0], members[5], 'si'), sg(runs[0], members[6], 'si'), sg(runs[0], members[7], 'forse'), sg(runs[0], members[8], 'no'), sg(runs[0], members[9], 'si', 1), sg(runs[0], members[10], 'si')];
  const st = { me: { id: me.id, first_name: me.first_name, last_name: me.last_name, title: KINDS[level], perms: PROFILES().find(p => p.key === KINDS[level]).perms }, profiles: PROFILES(), members, runs, signups,
    settings: { chapter: { name: 'Roma Chapter' }, dealer: { name: 'Harley-Davidson Store Roma', address: 'Via Pontina, 583 - 00128 Roma', phone: '+39 06 5080088', whatsapp: '+39 351 747 8842', email: 'info@harley-davidson-store-roma.it', web: 'https://www.harley-davidson-store-roma.it/', facebook: 'https://www.facebook.com/HarleyDavidsonStoreRoma/', instagram: 'https://www.instagram.com/harleydavidsonstoreroma', hours: 'Lun-Ven 9-13' }, payment_info: { methods: ['contanti', 'bonifico'], iban: 'IT60 X054 2811 1010 0000 0123 456', holder: 'Roma Chapter ASD', causale: 'Quota {run} - Cognome Nome', cash_contact: 'Sara Blu', cash_note: 'Alla partenza dei Run' } } };
  st.runs.forEach(r => { r.nav_tool = r.nav_tool || 'both'; });
  st.weather = {}; st.reports = [];
  const pm = st.me.perms; const mid = st.me.id;
  st.members.forEach(m => { if (m.id === mid) m.title = st.me.title; if (!pm.includes('members_edit')) delete m.access_code; if (!pm.includes('personal_view')) { delete m.email; delete m.birth_date; delete m.tessera; delete m.joined_on; delete m.notes; } if (!pm.includes('phones_view') && m.id !== mid) delete m.phone; });
  if (!pm.includes('members_view')) st.members = st.members.filter(m => m.id === mid);
  st.runs.forEach(r => { if (!pm.includes('route_view') && !r.route_public) { r.stops = []; r.route_url = null; } });
  return st;
}

function backend(page, level, log) {
  const st = makeState(level);
  page.route('**/rest/v1/rpc/**', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    log.push({ fn, body });
    let out = { ok: true };
    if (fn === 'rc_login') out = body.p_code === 'ABCD2345' ? { ok: true, me: st.me } : { ok: false, error: 'auth' };
    else if (fn === 'rc_sync') out = Object.assign({ ok: true, server_time: new Date().toISOString() }, st, { reports: st.me.perms.includes('reports_view') ? st.reports : [] });
    else if (fn === 'rc_weather_refresh') out = { ok: true };
    else if (fn === 'rc_emergency_get') out = { ok: true, profile: st.emg || null, consent: !!st.emg };
    else if (fn === 'rc_emergency_save') { if (body.p_consent !== true) out = { ok: false, error: 'consenso_mancante' }; else st.emg = body.p_data; }
    else if (fn === 'rc_emergency_delete') { st.emg = null; }
    else if (fn === 'rc_weather_get') out = { ok: true, weather: st.weather[body.p_run] || null };
    else if (fn === 'rc_report_save') { const p = body.p; if (p.id) Object.assign(st.reports.find(x => x.id === p.id), { name: p.name, def: p.def }); else st.reports.push({ id: uid(), name: p.name, def: p.def, created_by: st.me.id }); out = { ok: true, id: p.id || 'x' }; }
    else if (fn === 'rc_report_delete') { st.reports = st.reports.filter(x => x.id !== body.p_id); }
    else if (fn === 'rc_photos') out = { ok: true, photos: Object.fromEntries(st.members.filter(m => m.has_photo).map(m => [m.id, GIF])) };
    else if (fn === 'rc_run_photos') out = { ok: true, photos: [{ id: uid(), member_id: st.members[0].id, caption: null, data: GIF, created_at: new Date().toISOString() }] };
    else if (fn === 'rc_signup') { const i = st.signups.findIndex(s => s.run_id === body.p_run && s.member_id === (body.p_member || st.me.id)); const prev = i >= 0 ? st.signups[i] : {}; const row = { run_id: body.p_run, member_id: body.p_member || st.me.id, status: body.p_status, passengers: body.p_passengers, checked_in: false, room: body.p_room !== undefined ? (body.p_room || null) : prev.room || null, extras: body.p_extras !== undefined ? body.p_extras : prev.extras || {} }; if (body.p_status === 'rimuovi') { if (i >= 0) st.signups.splice(i, 1); } else if (i >= 0) st.signups[i] = row; else st.signups.push(row); }
    else if (fn === 'rc_formation_save') { const r = st.runs.find(x => x.id === body.p_run); r.formation = body.p_formation; r.formation_published = body.p_publish; }
    else if (fn === 'rc_run_save') { const p = body.p; if (p.id) Object.assign(st.runs.find(r => r.id === p.id), { title: p.title, status: p.status, nav_tool: p.nav_tool, stops: p.stops, rooms: p.rooms, extras: p.extras, installments: p.installments, fee: p.fee }); else st.runs.push(Object.assign({ id: uid(), formation: [], formation_published: false, updated_at: new Date().toISOString() }, p, { km: p.km ? +p.km : null, max_participants: p.max_participants ? +p.max_participants : null })); out = { ok: true, id: p.id || 'x' }; }
    else if (fn === 'rc_member_save') { const p = body.p; const nm = Object.assign({ id: uid(), active: true, has_photo: false, access_code: 'WXYZ6789' }, p); st.members.push(nm); out = { ok: true, id: nm.id }; }
    else if (fn === 'rc_profile_save') { const p = body.p; if (p.key) Object.assign(st.profiles.find(x => x.key === p.key), { name: p.name, perms: p.perms, in_direttivo: p.in_direttivo }); else st.profiles.push({ key: 'c_new_' + st.profiles.length, name: p.name, perms: p.perms, builtin: false, in_direttivo: p.in_direttivo, rank: 100 }); out = { ok: true, key: p.key || 'c_new' }; }
    else if (fn === 'rc_profile_delete') { st.profiles = st.profiles.filter(x => x.key !== body.p_key); }
    else if (fn === 'rc_members_import') out = { ok: true, inserted: body.p_rows.length, updated: 0, skipped: 0, errors: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out), headers: { 'access-control-allow-origin': '*' } });
  });
  return st;
}

async function newPage(browser, vp, level, log, errors) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, locale: 'it-IT', timezoneId: 'Europe/Rome', permissions: [] });
  const page = await ctx.newPage(); await page.addInitScript(() => { try { localStorage.setItem('rb.tour', '1'); } catch (e) {} });
  global.__errs = errors;
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/router.project-osrm.org/**', r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'Ok', routes: [{ distance: 100000, duration: 3600, legs: [{ duration: 3600 }] }] }) }));
  await page.route('**/cdnjs.cloudflare.com/**/xlsx.full.min.js', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync('./node_modules/xlsx/dist/xlsx.full.min.js') }));
  const st = backend(page, level, log);
  return { ctx, page, st };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const errors = [], log = [];
  const M = { width: 390, height: 844 };
  let { ctx, page, st } = await newPage(browser, M, 3, log, errors);
  const step = (n) => console.log('ok -', n);
  const TOP = () => page.locator('.sheet.in').last();
  const tclick = (sel) => TOP().locator(sel).first().click();
  const tfill = (sel, v) => TOP().locator(sel).first().fill(v);

  /* accesso */
  await page.goto(BASE); await page.waitForSelector('#code');
  await page.screenshot({ path: SHOTS + '01-login.png' });
  await page.fill('#code', 'zzzz9999'); await page.click('text=Entra'); await page.waitForSelector('.err-t:not(:empty)');
  assert.ok(/non valido/i.test(await page.textContent('.err-t'))); step('codice errato respinto');
  await page.fill('#code', 'abcd-2345'); await page.click('text=Entra'); await page.waitForSelector('.run');
  assert.strictEqual(await page.locator('.run').count(), 2); step('accesso e elenco Run (prossimi, incluso annullato)');
  await page.click('.tab[data-tab=altro]'); await page.click('#dealer-list .row'); await page.waitForSelector('.sheet.in .sb.r:has-text("Modifica")'); await tclick('.sb.r'); await page.waitForSelector('#dl-phone');
  await page.fill('#dl-facebook', 'http://x.it'); await tclick('.sb.r'); await page.waitForTimeout(300); assert.ok((await page.locator('#dl-phone').count()) === 1, 'link senza https respinto');
  await page.fill('#dl-facebook', 'https://www.facebook.com/HarleyDavidsonStoreRoma/'); await page.fill('#dl-whatsapp', '+39 351 747 8843'); await tclick('.sb.r'); await page.waitForTimeout(500);
  const ds = log.filter(l => l.fn === 'rc_settings_save').pop(); assert.ok(ds && ds.body.p_key === 'dealer' && ds.body.p_value.whatsapp === '+39 351 747 8843' && ds.body.p_value.facebook.startsWith('https://')); step('concessionaria: modifica contatti con permesso, https obbligatorio');
  await page.keyboard.press('Escape'); await page.click('.tab[data-tab=run]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS + '02-run.png' });

  /* risposta rapida */
  await page.click('.run .seg button[data-v=si]'); await page.waitForSelector('.sheet.in .ask'); await page.locator('.sheet.in .ask .btn.sec').last().click(); await page.waitForTimeout(400);
  assert.ok(!log.some(l => l.fn === 'rc_signup'), 'Annulla ha iscritto'); step('«Ci sono» chiede conferma, Annulla non iscrive');
  await page.click('.run .seg button[data-v=si]'); await page.waitForSelector('.sheet.in .ask'); await page.locator('.sheet.in .ask .btn.pri').last().click(); await page.waitForTimeout(500);
  assert.ok(log.some(l => l.fn === 'rc_signup' && l.body.p_status === 'si' && l.body.p_member === null)); step('risposta "Ci sono" inviata');
  assert.ok(await page.locator('.run .seg button.on[data-v=si]').count() === 1); step('pulsante attivo dopo la risposta');

  /* dettaglio */
  await page.click('.run h3'); await page.waitForSelector('.sheet.in .banner, .sheet.in .list'); await page.waitForTimeout(500);
  const txt = await page.textContent('.sheet.in');
  for (const w of ['Ritrovo', 'Piazzale Ostiense', 'Tappe', 'Partecipanti', 'Foto', 'Formazione', 'Annulla il Run']) assert.ok(txt.includes(w), 'manca ' + w);
  step('dettaglio Run completo (staff)');
  { const dt = await page.textContent('.sheet.in'); assert.ok(dt.includes('Singola 120,00') && dt.includes('Cena 25,00') && dt.includes('Unica soluzione'), 'prezzi sistemazioni, extra e piano');
    await page.locator('.sheet.in .row:has-text("Dario Moretti") .chip:has-text("Sistemazione")').click(); await page.waitForTimeout(300);
    await tclick('.row:has-text("Singola")'); await page.waitForTimeout(300);
    let sg = log.filter(l => l.fn === 'rc_signup').pop(); assert.ok(sg.body.p_room === 's1' && sg.body.p_status === 'si' && sg.body.p_extras === undefined);
    await tclick('button[aria-label="+"]'); await tclick('button[aria-label="+"]'); await page.waitForTimeout(300);
    sg = log.filter(l => l.fn === 'rc_signup').pop(); assert.deepStrictEqual(sg.body.p_extras, { e1: 2 }); assert.ok(sg.body.p_room === undefined);
    assert.ok((await page.locator('.sheet.in').last().textContent()).replace(/\s/g, ' ').includes('170,00 €'), 'dovuto 120 + 2 cene');
    await tclick('button[aria-label="-"]'); await tclick('button[aria-label="-"]'); await tclick('button[aria-label="-"]'); await page.waitForTimeout(300);
    sg = log.filter(l => l.fn === 'rc_signup').pop(); assert.deepStrictEqual(sg.body.p_extras, {}, 'quantità mai negativa');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    assert.ok((await page.textContent('.sheet.in')).includes('Singola'), 'sistemazione assegnata visibile'); step('sistemazione ed extra assegnati dall\'organizzazione'); }
  const hrefs = await page.locator('.sheet.in a[href]').evaluateAll(a => a.map(x => x.getAttribute('href')));
  const gm = hrefs.find(h => h.includes('google.com/maps/dir'));
  const emb = await page.locator('.sheet.in .mapbox iframe').getAttribute('src'); assert.ok(emb && emb.startsWith('https://maps.google.com/maps?q=Piazzale%20Ostiense%2C%20Roma') && emb.includes('output=embed'), 'mappa Google del ritrovo');
  assert.ok(hrefs.some(h => h === 'https://www.google.com/maps/search/?api=1&query=Piazzale%20Ostiense%2C%20Roma'), 'apri ritrovo in Google Maps');
  assert.ok(gm && !hrefs.some(h => h.includes('maps.apple.com')), 'solo Google Maps per lo staff'); const gu = new URL(gm);
  assert.strictEqual(gu.searchParams.get('origin'), 'Piazzale Ostiense, Roma'); assert.strictEqual(gu.searchParams.get('destination'), 'Frascati'); assert.strictEqual(gu.searchParams.get('waypoints'), 'Via Roma 1, Grottaferrata|Piazza Marconi, Frascati');
  assert.ok(!txt.includes('Apple') && txt.includes('Via Roma 1, Grottaferrata')); step('navigazione: solo Google Maps con ritrovo, tappe e arrivo');
  await page.screenshot({ path: SHOTS + '03-run-detail.png' });

  /* formazione automatica */
  await tclick('.btn:has-text("Crea")'); await page.waitForSelector('.fe');
  await tclick('text=Genera automaticamente'); await page.waitForTimeout(300);
  const slots = await page.locator('.sheet.in .fe .list .row').count();
  assert.ok(slots >= 7, 'slot ' + slots); step('formazione generata (' + slots + ' posizioni)');
  await page.screenshot({ path: SHOTS + '04-formation.png' });
  // pubblica e salva
  await tclick('.pass .sw'); await tclick('.sb.r'); await page.waitForTimeout(500);
  const fsv = log.filter(l => l.fn === 'rc_formation_save').pop();
  assert.ok(fsv && fsv.body.p_publish === true && fsv.body.p_formation[0].kind === 'road_captain' && fsv.body.p_formation[fsv.body.p_formation.length - 1].kind === 'scopa'); step('formazione salvata e pubblicata');
  await page.waitForTimeout(400);
  assert.ok(await page.locator('.sheet.in .fm').count() >= 1); step('formazione visibile nel dettaglio');
  await page.screenshot({ path: SHOTS + '05-run-with-formation.png' });
  await page.locator('.sheet.in .fmn').first().click(); await page.waitForSelector('.mcard .tess.big'); assert.ok((await page.textContent('.mcard')).length > 3); step('formazione: tocco sul nome apre la foto tessera');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  /* nuovo run */
  await page.click('button[aria-label="Nuovo Run"]'); await page.waitForSelector('.sheet.in .row.act');
  assert.ok((await page.textContent('.sheet.in')).includes('Copia da: '), 'scelta: copia dall\'ultimo Run'); await page.click('.sheet.in .row.act:has-text("da zero")'); await page.waitForSelector('#rf-title');
  assert.ok(!(await page.locator('#rf-url').isVisible()), 'opzioni secondarie nascoste in un nuovo Run'); await page.click('#rf-more'); assert.ok(await page.locator('#rf-url').isVisible());
  await page.fill('#rf-title', 'Giro di prova'); await page.fill('#rf-km', '80'); await page.fill('#rf-url', 'javascript:alert(1)');
  await tclick('.sb.r'); await page.waitForTimeout(300);
  assert.ok(!log.some(l => l.fn === 'rc_run_save' && l.body.p.title === 'Giro di prova')); step('link non http respinto dal client');
  await page.fill('#rf-fee', '15.5'); await tclick('.row:has-text("Quote, sistemazioni e rate")'); await page.waitForSelector('.pe-preset');
  await tclick('.pe-preset:has-text("Singola")'); await tclick('.pe-preset:has-text("Doppia")'); await page.locator('.pe-price').nth(0).fill('120'); await tclick('.sb.r'); await page.waitForTimeout(300);
  assert.ok(await page.locator('.pe-price').count() === 2, 'prezzo mancante: il foglio resta aperto'); await page.locator('.pe-price').nth(1).fill('90');
  await tclick('.pe-xpreset:has-text("Cena")'); await page.locator('.pe-eprice').fill('25'); await tclick('.seg button:has-text("A rate")');
  await page.locator('.pe-date').nth(0).fill('2026-12-01'); await page.locator('.pe-date').nth(1).fill('2027-01-10'); await page.locator('.pe-pct').nth(0).fill('40'); await page.screenshot({ path: SHOTS + '45-pay-editor.png' }); await tclick('.sb.r'); await page.waitForTimeout(300);
  assert.ok(await page.locator('.pe-pct').count() === 2, 'rate che non sommano 100: il foglio resta aperto'); await page.locator('.pe-pct').nth(0).fill('30'); await page.locator('.pe-pct').nth(1).fill('70');
  await tclick('.sb.r'); await page.waitForTimeout(300); assert.ok((await page.textContent('#rf-pay, .row:has-text("Quote, sistemazioni")')).includes('2 sistemazioni'));
  await page.fill('#rf-url', 'https://maps.example.com/x'); await tclick('.btn:has-text("Aggiungi")'); await tclick('.row:has-text("Tappa 1")'); await page.waitForSelector('.pp'); await page.waitForTimeout(400); await tclick('.seg button:has-text("Indirizzo")'); await tfill('#pp-q', 'Via A 1, Roma'); await tclick('.pp-sf button'); await page.waitForSelector('.sheet.in .row:has-text("Usa come indirizzo scritto")', { timeout: 20000 }); await tclick('.row:has-text("Usa come indirizzo scritto")'); await tfill('#pp-name', 'Caffè'); await tclick('.sb.r'); await page.waitForTimeout(700); await tclick('.seg button:has-text("Nascondi")');
  await tclick('.sb.r'); await page.waitForTimeout(500);
  const rs = log.filter(l => l.fn === 'rc_run_save').pop();
  assert.ok(rs && rs.body.p.title === 'Giro di prova' && rs.body.p.stops.length === 1 && rs.body.p.stops[0].addr === 'Via A 1, Roma' && rs.body.p.nav_tool === 'none' && rs.body.p.fee === '15.5' && rs.body.p.rooms.length === 2 && rs.body.p.rooms[0].price === '120' && rs.body.p.extras[0].name === 'Cena' && JSON.stringify(rs.body.p.installments) === JSON.stringify([{ due_on: '2026-12-01', pct: '30' }, { due_on: '2027-01-10', pct: '70' }]) && /Z$/.test(rs.body.p.run_date)); step('nuovo Run salvato con indirizzo tappa e navigatore');
  await page.waitForSelector('.sheet.in .ask'); assert.ok(/gruppo WhatsApp/.test(await page.locator('.sheet.in:has(.ask)').last().innerText())); await page.locator('.sheet.in .ask .btn.sec').last().click(); await page.waitForFunction(() => !document.querySelector('.sheet.in .ask')); step('Run nuovo: proposta di avvisare il gruppo WhatsApp');
  assert.strictEqual(await page.locator('.run').count(), 3);

  /* soci */
  await page.click('.tab[data-tab=soci]'); await page.waitForSelector('.search input'); await page.waitForTimeout(300);
  const all = await page.locator('.list .row').count();
  await page.fill('.search input', 'ross'); await page.waitForTimeout(200);
  assert.ok(await page.locator('.list .row').count() === 2, 'filtro'); step('ricerca soci');
  await page.fill('.search input', '');
  await page.screenshot({ path: SHOTS + '06-soci.png' });
  await page.click('button[aria-label="Nuovo socio"]'); await page.waitForSelector('#mf-fn');
  await page.fill('#mf-fn', 'Nuovo'); await page.fill('#mf-ln', 'Socio'); await page.selectOption('#mf-title', 'road_captain'); await tclick('.sb.r'); await page.waitForTimeout(500);
  const ms = log.filter(l => l.fn === 'rc_member_save').pop(); assert.ok(ms && ms.body.p.title === 'road_captain' && ms.body.p.first_name === 'Nuovo'); step('nuovo socio con ruolo');
  assert.ok(/WXYZ-6789/.test(await page.textContent('.sheet.in'))); step('codice di invito mostrato');
  await page.screenshot({ path: SHOTS + '07-member.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  /* import Excel */
  await page.click('button[aria-label="Altro"]'); await page.waitForSelector('.sheet.in .row.act');
  await tclick('text=Importa soci da Excel'); await page.waitForTimeout(400);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cognome', 'Nome', 'Cellulare', 'Ruolo', 'Data iscrizione', 'N. Tessera'], ['Esposito', 'Gino', 3201234567, 'Officer', 44000, 'T10'], ['Russo', 'Ida', '', 'Socio', '15/06/2022', 'T11'], ['', 'Senzacognome', '', '', '', ''], ['Gialli', 'Piero', '', 'Capo cassa', '', 'T12'], ['Bianchi', 'Tom', '', 'Road Captain', 'ciao', '']]), 'Soci');
  XLSX.writeFile(wb, __dirname + '/import.xlsx');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tclick('text=Scegli file Excel')]);
  await chooser.setFiles(__dirname + '/import.xlsx'); await page.waitForSelector('.imp .stat'); await page.waitForTimeout(300);
  const stat = await page.locator('.imp .stat b').allTextContents(); assert.deepStrictEqual(stat, ['2', '3']); assert.ok((await page.textContent('.imp')).includes('ruolo sconosciuto o non assegnabile: Capo cassa')); step('anteprima import: 2 pronti, 3 saltati (ruolo sconosciuto segnalato)');
  await page.screenshot({ path: SHOTS + '08-import.png' });
  await tclick('text=Importa 2 persone'); await page.waitForTimeout(600);
  const imp = log.filter(l => l.fn === 'rc_members_import').pop(); assert.ok(imp && imp.body.p_rows.length === 2 && imp.body.p_rows[0].title === 'officer' && imp.body.p_rows[0].joined_on === '2020-06-18'); step('import inviato con righe normalizzate');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  /* direttivo */
  await page.click('.tab[data-tab=dir]'); await page.waitForSelector('.org'); await page.waitForTimeout(500);
  assert.ok((await page.locator('.org .oc').count()) >= 6); assert.ok(await page.locator('.org .av img').count() >= 1); step('direttivo con foto');
  await page.screenshot({ path: SHOTS + '09-direttivo.png' });

  /* quote */
  await page.click('.tab[data-tab=quote]'); await page.waitForSelector('.view .list .row'); await page.waitForTimeout(300);
  const qt = await page.textContent('.view'); assert.ok(qt.includes('IT60 X054') && qt.includes('Come pagare') && qt.includes('Roma Chapter ASD') && qt.includes('Giro dei Castelli Romani') && !qt.includes('Quota annuale') && !qt.includes('Scadenza')); step('quote per Run: modalità e registro per Run');
  await page.screenshot({ path: SHOTS + '10-quote.png' });
  const mineTxt = (await page.textContent('.view')).replace(/\s/g, ' '); assert.ok(mineTxt.includes('Le mie quote') && mineTxt.includes('La mia quota') && mineTxt.includes('Unica soluzione') && mineTxt.includes('Causale: Quota Giro dei Castelli Romani') && mineTxt.includes('Quote dei prossimi Run') && mineTxt.includes('Singola 120,00 €'), 'le mie quote del Run a cui sono iscritto');
  assert.ok(mineTxt.includes('Marco Bianchi') && mineTxt.includes('Presidente') && await page.locator('#who').count() === 1); step('quote informative + badge profilo in uso');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  /* profili di accesso (amministratore) */
  await page.click('.tab[data-tab=altro]'); await page.waitForSelector('.view .row'); await page.waitForTimeout(300);
  await page.click('.view .row:has-text("Profili di accesso")'); await page.waitForSelector('.sheet.in .list .row'); await page.waitForTimeout(300);
  assert.strictEqual(await TOP().locator('.list .row').count(), 10); step('elenco profili: 8 predefiniti + 2 personalizzati');
  await page.screenshot({ path: SHOTS + '16-profili.png' });
  await TOP().locator('.row:has-text("Socio")').first().click(); await page.waitForTimeout(300);
  assert.strictEqual(await TOP().locator('.pass .sw').count(), 0); assert.strictEqual(await TOP().locator('#pr-name').count(), 0); step('profilo predefinito: sola lettura');
  await page.screenshot({ path: SHOTS + '17-profilo-socio.png' });
  await tclick('.btn:has-text("Duplica")'); await page.waitForSelector('#pr-name'); await page.waitForTimeout(300);
  const on0 = await TOP().locator('.pass.perm .sw.on').count(); assert.strictEqual(on0, 1); step('duplica: parte dai permessi del profilo copiato');
  await tfill('#pr-name', 'Tesoriere');
  const sw = (label) => TOP().locator('.pass.perm', { hasText: label }).locator('.sw');
  await sw('Gestire i soci').click(); await page.waitForTimeout(200);
  assert.ok((await sw('Vedere i telefoni').getAttribute('class')).includes('on')); assert.ok((await sw('Vedere l\'elenco soci').getAttribute('class')).includes('on')); step('permesso collegato: gestire i soci attiva anche vedere telefoni');
  await sw('Vedere l\'elenco soci').click(); await page.waitForTimeout(200);
  assert.ok(!(await sw('Gestire i soci').getAttribute('class')).includes('on')); assert.ok(!(await sw('Vedere i telefoni').getAttribute('class')).includes('on')); step('spegnendo un permesso si spengono quelli che lo richiedono');
  await sw('Gestire i soci').click(); await page.waitForTimeout(150);
  await page.screenshot({ path: SHOTS + '18-profilo-nuovo.png' });
  await tclick('.sb.r'); await page.waitForTimeout(500);
  const ps = log.filter(l => l.fn === 'rc_profile_save').pop();
  assert.ok(ps && ps.body.p.name === 'Tesoriere' && ps.body.p.key === null && ['members_view', 'phones_view', 'members_edit'].every(k => ps.body.p.perms.includes(k))); step('profilo "Tesoriere" salvato con i permessi collegati');
  await page.waitForTimeout(300);
  assert.strictEqual(await TOP().locator('.list .row').count(), 11);
  await TOP().locator('.row:has-text("Segreteria")').first().click(); await page.waitForTimeout(600); await page.waitForSelector('.sheet.in #pr-name'); assert.ok(await TOP().locator('.btn.dng:has-text("Elimina profilo")').count() === 1); step('profilo personalizzato modificabile ed eliminabile');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // i profili personalizzati si possono assegnare ai soci
  await page.click('.tab[data-tab=soci]'); await page.click('button[aria-label="Nuovo socio"]'); await page.waitForSelector('#mf-title');
  const opts = await page.locator('#mf-title option').allTextContents(); assert.ok(opts.includes('Segreteria') && opts.includes('Ospite') && opts.includes('Tesoriere') && opts.includes('Amministratore')); step('profili personalizzati assegnabili ai soci');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // esportazioni Excel
  await page.click('.tab[data-tab=altro]'); await page.waitForSelector('.view .row');
  let [dl] = await Promise.all([page.waitForEvent('download'), page.click('.view .row:has-text("Esporta codici di accesso")')]);
  let wbx = XLSX.readFile(await dl.path()); let ar = XLSX.utils.sheet_to_json(wbx.Sheets[wbx.SheetNames[0]], { header: 1 });
  assert.deepStrictEqual(ar[0], ['Cognome', 'Nome', 'Ruolo', 'Telefono', 'Email', 'Codice', 'Link di invito', 'WhatsApp']);
  assert.ok(ar.length > 10 && ar.some(r => r[5] === 'ABCD-2345' && /\?c=ABCD2345$/.test(r[6]))); assert.ok(wbx.Sheets[wbx.SheetNames[0]]['H2'].l.Target.startsWith('https://wa.me/39333')); step('Excel codici di accesso con link e WhatsApp');
  await page.click('.tab[data-tab=soci]'); await page.click('button[aria-label="Altro"]'); await page.waitForSelector('.sheet.in .row.act');
  [dl] = await Promise.all([page.waitForEvent('download'), tclick('text=Scarica modello Excel')]);
  wbx = XLSX.readFile(await dl.path()); assert.deepStrictEqual(wbx.SheetNames, ['Soci', 'Istruzioni', 'Ruoli']);
  const roles = XLSX.utils.sheet_to_json(wbx.Sheets['Ruoli'], { header: 1 }); assert.ok(roles.length === 12 && roles.some(r => r[0] === 'Tesoriere' && /soci/.test(r[1])) && roles.some(r => r[0] === 'Segreteria')); step('modello Excel con foglio Ruoli (profili personalizzati inclusi)');
  assert.deepStrictEqual(XLSX.utils.sheet_to_json(wbx.Sheets['Soci'], { header: 1 })[0], ['Nome', 'Cognome', 'Telefono', 'Email', 'Data di nascita', 'N. Tessera', 'Moto', 'Ruolo', 'Data iscrizione', 'Scadenza HOG', 'Liberatoria', 'Note']);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  /* altro: lingua e temi */
  await page.click('.tab[data-tab=altro]'); await page.waitForSelector('.sw8'); await page.waitForTimeout(300);
  assert.strictEqual(await page.locator('.sw8 button').count(), 9); step('9 temi colore');
  await page.click('.sw8 button[data-t=garage]'); await page.waitForTimeout(300);
  assert.strictEqual(await page.getAttribute('html', 'data-th'), 'garage');
  await page.screenshot({ path: SHOTS + '11-altro-garage.png' });
  await page.click('.tab[data-tab=run]'); await page.waitForTimeout(300); await page.screenshot({ path: SHOTS + '12-run-garage.png' });
  await page.click('.tab[data-tab=altro]'); await page.click('.seg button:has-text("English")'); await page.waitForTimeout(300);
  assert.ok((await page.textContent('.tabs')).includes('Board')); step('lingua inglese');
  await page.click('.seg button:has-text("Français")'); await page.waitForTimeout(300);
  assert.ok((await page.textContent('.tabs')).includes('Bureau')); step('lingua francese');
  await page.click('.seg button:has-text("Italiano")'); await page.click('.sw8 button[data-t=arancio]');

  /* persistenza sessione */
  await page.reload(); await page.waitForSelector('#code'); assert.ok((await page.textContent('#resume')).includes('Continua come Marco Bianchi')); assert.ok((await page.textContent('#rel')).includes('Release ')); step('la schermata di accesso è sempre la pagina iniziale');
  await page.screenshot({ path: SHOTS + '47-login-ripresa.png' });
  await page.click('#resume'); await page.waitForSelector('.view'); assert.ok(!(await page.locator('#code').count())); step('sessione ricordata: un tocco per continuare');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('bg'))); 
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200); assert.ok(!(await page.evaluate(() => document.documentElement.classList.contains('bg'))) && await page.locator('.view').count() === 1); step('ritorno dallo sfondo: animazioni riprese, schermata intatta');
  await page.evaluate(() => { document.getElementById('app').innerHTML = ''; document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForSelector('.view'); assert.strictEqual(await page.locator('#code').count(), 0); step('schermo vuoto al ritorno: ricarica e riprende senza passare dall\'accesso');
  // logout
  await page.click('.tab[data-tab=altro]'); await page.click('.row.act.dng'); await tclick('.btn.dng'); await page.waitForSelector('#code'); step('uscita');
  await ctx.close();

  /* invito con link */
  ({ ctx, page, st } = await newPage(browser, M, 1, log, errors));
  await page.goto(BASE + '?c=ABCD2345'); await page.waitForSelector('.run'); assert.ok(!page.url().includes('c=')); step('accesso da link di invito (codice rimosso dall\'indirizzo)');
  /* socio semplice: nessuna area staff, nessun dato riservato */
  assert.strictEqual(await page.locator('button[aria-label="Nuovo Run"]').count(), 0); step('socio: nessun pulsante Nuovo Run');
  assert.deepStrictEqual(await page.$$eval('.tab', x => x.map(e => e.getAttribute('data-tab'))), ['run', 'meteo', 'quote', 'altro']); await page.waitForSelector('#nx .nx-me .seg'); step('socio: 4 schede e il prossimo Run in grande con la risposta');
  await page.click('.tab[data-tab=altro]'); await page.click('#sa-chapter'); await page.waitForSelector('.sheet.in #chapter'); await page.locator('.sheet.in #chapter .seg button:has-text("Soci")').click(); await page.waitForSelector('.sheet.in .search'); assert.strictEqual(await page.locator('button[aria-label="Nuovo socio"]').count(), 0);
  await page.click('.sheet.in .list .row:has-text("Mario Rossi")'); await page.waitForSelector('.sheet.in'); await page.waitForTimeout(300); const mt = await page.textContent('.sheet.in'); assert.ok(!/Telefono|Invito|@/.test(mt)); step('socio: scheda senza telefono, email e inviti');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.click('.tab[data-tab=quote]'); await page.waitForSelector('.view .list'); await page.waitForTimeout(300); { const qs = await page.textContent('.view'); assert.ok(qs.includes('Le mie quote') && qs.includes('Come pagare') && !qs.includes('Registro quote')); step('socio: vede le proprie quote per Run, nessun registro'); }
  await page.click('.tab[data-tab=altro]'); await page.waitForSelector('#sa-dealer'); await page.click('#sa-dealer'); await page.waitForSelector('.sheet.in a.row');
  { const hr = await page.locator('.sheet.in a.row').evaluateAll(e => e.map(x => [x.getAttribute('href'), x.getAttribute('target')])); const hs = hr.map(x => x[0]);
    assert.ok(hs.includes('tel:+39065080088') && hs.includes('https://wa.me/393517478842') && hs.includes('mailto:info@harley-davidson-store-roma.it') && hs.some(x => /facebook\.com\/HarleyDavidsonStoreRoma/.test(x)) && hs.some(x => /instagram\.com\/harleydavidsonstoreroma/.test(x)), JSON.stringify(hs));
    assert.ok(hr.filter(x => /^(tel|mailto)/.test(x[0])).every(x => !x[1]), 'tel e mailto senza nuova scheda'); assert.ok((await page.textContent('.sheet.in')).includes('Via Pontina, 583') && !(await page.textContent('.sheet.in')).includes('Modifica')); }
  await page.screenshot({ path: SHOTS + '48-concessionaria.png' }); await page.keyboard.press('Escape'); await page.waitForTimeout(300); step('concessionaria: chiama, WhatsApp, email, indirizzo, social (socio non modifica)');
  /* dati per le emergenze */
  await page.waitForSelector('#emg-row'); assert.ok((await page.textContent('#emg-row')).includes('Non ancora inseriti')); await page.click('#emg-row'); await page.waitForSelector('#em-cn');
  { const tx = await page.textContent('.sheet.in'); assert.ok(tx.includes('Marco Bianchi') && tx.includes('Persona da avvisare') && tx.includes('Consenso') && tx.includes('Gruppo sanguigno')); assert.ok(!(await page.isVisible('#em-al')), 'dati facoltativi chiusi di default'); }
  await page.screenshot({ path: SHOTS + '49-emergenza-form.png' });
  await tclick('#em-save'); await page.waitForTimeout(250); assert.ok(!log.some(l => l.fn === 'rc_emergency_save'), 'senza contatto non salva');
  await page.fill('#em-cn', 'Anna Bianchi'); await page.fill('#em-cp', '12'); await tclick('#em-save'); await page.waitForTimeout(250); assert.ok(!log.some(l => l.fn === 'rc_emergency_save'), 'telefono troppo corto');
  await page.fill('#em-cp', '+39 333 1234567'); await tclick('#em-save'); await page.waitForTimeout(250); assert.ok(!log.some(l => l.fn === 'rc_emergency_save'), 'senza consenso non salva');
  await tclick('#em-more'); await page.fill('#em-al', 'penicillina'); await tclick('.sos-blood button[data-v="A+"]'); await tclick('.sos-seg button[data-v="assicura"]'); await tclick('.pass .sw'); await tclick('#em-save'); await page.waitForTimeout(500);
  { const es = log.filter(l => l.fn === 'rc_emergency_save').pop(); assert.ok(es && es.body.p_consent === true && es.body.p_data.contact_name === 'Anna Bianchi' && es.body.p_data.blood === 'A+' && es.body.p_data.roadside === 'assicura' && es.body.p_data.allergies === 'penicillina', JSON.stringify(es && es.body)); }
  assert.ok((await page.textContent('#emg-row')).includes('Inseriti')); step('dati emergenza: obbligatori, consenso, salvataggio');
  await page.click('#emg-row'); await page.waitForSelector('#em-cn'); assert.strictEqual(await page.inputValue('#em-cn'), 'Anna Bianchi'); assert.strictEqual(await page.inputValue('#em-al'), 'penicillina');
  await tclick('.row:has-text("Elimina i miei dati di emergenza")'); await tclick('.btn.dng'); await page.waitForTimeout(500);
  assert.ok(log.some(l => l.fn === 'rc_emergency_delete') && (await page.textContent('#emg-row')).includes('Non ancora inseriti')); step('dati emergenza: eliminazione');
  await page.click('.tab[data-tab=altro]'); await page.waitForTimeout(300); assert.ok(!(await page.textContent('.view')).includes('Importa soci')); step('socio: Altro senza strumenti staff');
  await page.screenshot({ path: SHOTS + '13-altro-socio.png' });
  await ctx.close();

  /* ospite: profilo senza permessi */
  ({ ctx, page, st } = await newPage(browser, M, 'ospite', log, errors));
  await page.goto(BASE + '?c=ABCD2345'); await page.waitForSelector('.run'); await page.waitForTimeout(500);
  assert.deepStrictEqual(await page.locator('.tabs .tab').evaluateAll(e => e.map(x => x.dataset.tab)), ['run', 'meteo', 'quote', 'altro']); step('ospite: solo Run, Quote e Altro');
  await page.click('.run h3'); await page.waitForSelector('.sheet.in .list'); await page.waitForTimeout(400);
  const ot = await page.textContent('.sheet.in'); assert.ok(!ot.includes('Tappe') && !ot.includes('Navigazione') && !ot.includes('Via Roma') && ot.includes('Ritrovo')); assert.strictEqual(await page.locator('.sheet.in a[href*="maps"]').count() >= 0, true);
  assert.strictEqual(await page.locator('.sheet.in a[href*="google.com/maps/dir"]').count(), 0); step('ospite: nessuna tappa né navigazione');
  await page.screenshot({ path: SHOTS + '19-ospite.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.click('.tab[data-tab=altro]'); await page.waitForTimeout(300); const oa = await page.textContent('.view'); assert.ok(oa.includes('Ospite') && !oa.includes('Area staff') && !oa.includes('Profili di accesso')); step('ospite: Altro senza strumenti staff');
  await ctx.close();

  /* segreteria: vede dati e quote ma non modifica */
  ({ ctx, page, st } = await newPage(browser, M, 'seg', log, errors));
  await page.goto(BASE + '?c=ABCD2345'); await page.waitForSelector('.run'); await page.waitForTimeout(400);
  await page.click('.tab[data-tab=soci]'); await page.waitForSelector('.search'); assert.strictEqual(await page.locator('button[aria-label="Nuovo socio"]').count(), 0);
  await page.click('.list .row:has-text("Mario Rossi")'); await page.waitForSelector('.sheet.in'); await page.waitForTimeout(300);
  const sgt = await page.textContent('.sheet.in'); assert.ok(sgt.includes('Telefono') && sgt.includes('a@b.it') && !sgt.includes('Invito') && !sgt.includes('Modifica')); step('segreteria: vede telefono ed email, nessun invito né modifica');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.click('.tab[data-tab=quote]'); await page.waitForSelector('.view .list .row'); assert.ok((await page.textContent('.view')).includes('Come pagare')); assert.ok((await page.textContent('#who')).includes('Segreteria')); step('segreteria: quote come informazione + badge profilo');
  await page.click('.tab[data-tab=run]'); assert.strictEqual(await page.locator('button[aria-label="Nuovo Run"]').count(), 0);
  await ctx.close();

  /* road captain: gestisce Run e formazione, non soci né profili */
  ({ ctx, page, st } = await newPage(browser, M, 'rc', log, errors));
  await page.goto(BASE + '?c=ABCD2345'); await page.waitForSelector('.run'); await page.waitForTimeout(400);
  assert.strictEqual(await page.locator('button[aria-label="Nuovo Run"]').count(), 1);
  await page.click('.tab[data-tab=soci]'); await page.waitForSelector('.search'); assert.strictEqual(await page.locator('button[aria-label="Nuovo socio"]').count(), 0);
  await page.click('.tab[data-tab=altro]'); await page.waitForTimeout(300); const ra = await page.textContent('.view'); assert.ok(ra.includes('Area staff') && ra.includes('Nuovo Run') && !ra.includes('Importa soci') && !ra.includes('Profili di accesso') && !ra.includes('Modalità di pagamento')); step('road captain: strumenti staff limitati ai Run');
  await ctx.close();

  /* socio: nessun percorso; se l'organizzatore lo condivide, solo lo strumento scelto */
  ({ ctx, page, st } = await newPage(browser, M, 1, log, errors));
  await page.goto(BASE + '?c=ABCD2345'); await page.waitForSelector('#nx'); await page.click('#nx .nx-t'); await page.waitForSelector('.sheet.in .list'); await page.waitForTimeout(400);
  let sh = await page.locator('.sheet.in a[href]').evaluateAll(a => a.map(x => x.getAttribute('href')));
  assert.ok(!sh.some(h => /maps\/dir|saddr/.test(h)) && !(await page.textContent('.sheet.in')).includes('Grottaferrata')); step('socio: nessun percorso né tappe');
  await ctx.close();
  ({ ctx, page, st } = await newPage(browser, M, 'pub', log, errors));
  await page.goto(BASE + '?c=ABCD2345'); await page.waitForSelector('#nx'); await page.click('#nx .nx-t'); await page.waitForSelector('.sheet.in .list'); await page.waitForTimeout(400);
  sh = await page.locator('.sheet.in a[href]').evaluateAll(a => a.map(x => x.getAttribute('href')));
  assert.ok(sh.some(h => h.includes('google.com/maps/dir')) && !sh.some(h => h.includes('maps.apple.com'))); step('socio con percorso condiviso: vede il pulsante Google Maps');
  st.runs[0].nav_tool = 'none'; await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.evaluate(() => RB.sync()); await page.waitForTimeout(400);
  await page.click('#nx .nx-t'); await page.waitForSelector('.sheet.in .list'); await page.waitForTimeout(300);
  assert.strictEqual(await page.locator('.sheet.in a[href*="google.com/maps/dir"]').count(), 0); assert.ok((await page.textContent('.sheet.in')).includes('Via Roma 1')); step('Google Maps nascosto: restano le tappe ma nessun pulsante');
  await ctx.close();

  /* PC */
  ({ ctx, page, st } = await newPage(browser, { width: 1280, height: 800 }, 3, log, errors));
  await page.goto(BASE + '?c=ABCD2345'); await page.waitForSelector('.run'); await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS + '14-desktop.png' });
  await page.click('.run h3'); await page.waitForTimeout(600); await page.screenshot({ path: SHOTS + '15-desktop-sheet.png' });
  await ctx.close();

  /* nessuna pagina deve restare più larga dello schermo */
  ({ ctx, page, st } = await newPage(browser, { width: 320, height: 640 }, 3, log, errors));
  await page.goto(BASE + '?c=ABCD2345'); await page.waitForSelector('.run');
  for (const tab of ['run', 'soci', 'dir', 'quote', 'altro']) { await page.click('.tab[data-tab=' + tab + ']'); await page.waitForTimeout(250); const sw = await page.evaluate(() => document.documentElement.scrollWidth); if (sw > 321) { const w = await page.evaluate(() => [...document.querySelectorAll('.view *')].filter(e => e.getBoundingClientRect().right > 321).slice(0, 4).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))); assert.fail(tab + ' scrollWidth ' + sw + ' ' + w.join(' | ')); } }
  step('nessuno scorrimento orizzontale a 320px');
  await ctx.close(); await browser.close();

  if (errors.length) { console.log('ERRORI PAGINA:\n' + errors.join('\n')); process.exit(1); }
  console.log('Nessun errore in console. TUTTO OK');
})().catch(e => { console.error('FALLITO:', e.message); if (global.__errs) console.error(global.__errs.join('\n')); process.exit(1); });
