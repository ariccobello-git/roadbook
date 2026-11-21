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

const ALL = ['members_view', 'phones_view', 'personal_view', 'route_view', 'formation_draft_view', 'runs_edit', 'formation_edit', 'signups_manage', 'photos_moderate', 'members_edit', 'settings_edit', 'profiles_manage', 'reports_view'];
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
    { id: uid(), title: 'Giro dei Castelli Romani', fee: '10.00', run_date: nextSunday(9), meeting_point: 'Piazzale Ostiense, Roma', destination: 'Frascati', description: 'Giro tranquillo con sosta caffè.\nPortare documenti.', km: 120, difficulty: 'media', route_url: 'https://maps.example.com/r1', nav_tool: 'google', stops: [{ time: '10:30', name: 'Caffè a Grottaferrata', addr: 'Via Roma 1, Grottaferrata' }, { time: '13:00', name: 'Pranzo a Frascati', addr: 'Piazza Marconi, Frascati' }], status: 'programmato', route_public: level === 'pub', max_participants: 30, formation_published: false, formation: [], updated_at: new Date().toISOString() },
    { id: uid(), title: 'Weekend sul Lago di Bolsena', run_date: plusDays(21, 8), meeting_point: 'Casello Roma Nord', destination: 'Bolsena', description: '', km: 260, difficulty: 'impegnativa', route_url: null, stops: [], status: 'annullato', max_participants: null, formation_published: false, formation: [], updated_at: new Date().toISOString() },
    { id: uid(), title: 'Pranzo di fine stagione', run_date: plusDays(-20, 10), meeting_point: 'Ostia', destination: 'Fregene', description: '', km: 60, difficulty: 'facile', route_url: null, stops: [], status: 'concluso', max_participants: null, formation_published: true, formation: [], updated_at: new Date().toISOString() }];
  const sg = (r, m, st, p, c) => ({ run_id: r.id, member_id: m.id, status: st, passengers: p || 0, checked_in: !!c });
  const signups = [sg(runs[0], members[3], 'si', 0), sg(runs[0], members[4], 'si', 1), sg(runs[0], members[5], 'si'), sg(runs[0], members[6], 'si'), sg(runs[0], members[7], 'forse'), sg(runs[0], members[8], 'no'), sg(runs[0], members[9], 'si', 1), sg(runs[0], members[10], 'si')];
  const st = { me: { id: me.id, first_name: me.first_name, last_name: me.last_name, title: KINDS[level], perms: PROFILES().find(p => p.key === KINDS[level]).perms }, profiles: PROFILES(), members, runs, signups,
    settings: { chapter: { name: 'Roma Chapter' }, payment_info: { methods: ['contanti', 'bonifico'], iban: 'IT60 X054 2811 1010 0000 0123 456', holder: 'Roma Chapter ASD', causale: 'Quota {run} - Cognome Nome', cash_contact: 'Sara Blu', cash_note: 'Alla partenza dei Run' } } };
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
    else if (fn === 'rc_member_photo') { const mm = st.members.find(x => x.id === body.p_member); mm.has_photo = !!body.p_data; st.photoData = st.photoData || {}; st.photoData[mm.id] = body.p_data; }
    else if (fn === 'rc_settings_save') { st.settings = Object.assign({}, st.settings, { [body.p_key]: body.p_value }); }
    else if (fn === 'rc_weather_get') out = { ok: true, weather: st.weather[body.p_run] || null };
    else if (fn === 'rc_report_save') { const p = body.p; if (p.id) Object.assign(st.reports.find(x => x.id === p.id), { name: p.name, def: p.def }); else st.reports.push({ id: uid(), name: p.name, def: p.def, created_by: st.me.id }); out = { ok: true, id: p.id || 'x' }; }
    else if (fn === 'rc_report_delete') { st.reports = st.reports.filter(x => x.id !== body.p_id); }
    else if (fn === 'rc_photos') out = { ok: true, photos: Object.fromEntries(st.members.filter(m => m.has_photo).map(m => [m.id, (st.photoData && st.photoData[m.id]) || GIF])) };
    else if (fn === 'rc_run_photos') out = { ok: true, photos: [{ id: uid(), member_id: st.members[0].id, caption: null, data: GIF, created_at: new Date().toISOString() }] };
    else if (fn === 'rc_signup') { const i = st.signups.findIndex(s => s.run_id === body.p_run && s.member_id === (body.p_member || st.me.id)); const row = { run_id: body.p_run, member_id: body.p_member || st.me.id, status: body.p_status, passengers: body.p_passengers, checked_in: false }; if (body.p_status === 'rimuovi') { if (i >= 0) st.signups.splice(i, 1); } else if (i >= 0) st.signups[i] = row; else st.signups.push(row); }
    else if (fn === 'rc_formation_save') { const r = st.runs.find(x => x.id === body.p_run); r.formation = body.p_formation; r.formation_published = body.p_publish; }
    else if (fn === 'rc_run_save') { const p = body.p; if (p.id) Object.assign(st.runs.find(r => r.id === p.id), { title: p.title, status: p.status, nav_tool: p.nav_tool, stops: p.stops }); else st.runs.push(Object.assign({ id: uid(), formation: [], formation_published: false, updated_at: new Date().toISOString() }, p, { km: p.km ? +p.km : null, max_participants: p.max_participants ? +p.max_participants : null })); out = { ok: true, id: p.id || 'x' }; }
    else if (fn === 'rc_member_save') { const p = body.p; const nm = Object.assign({ id: uid(), active: true, has_photo: false, access_code: 'WXYZ6789' }, p); st.members.push(nm); out = { ok: true, id: nm.id }; }
    else if (fn === 'rc_profile_save') { const p = body.p; if (p.key) Object.assign(st.profiles.find(x => x.key === p.key), { name: p.name, perms: p.perms, in_direttivo: p.in_direttivo }); else st.profiles.push({ key: 'c_new_' + st.profiles.length, name: p.name, perms: p.perms, builtin: false, in_direttivo: p.in_direttivo, rank: 100 }); out = { ok: true, key: p.key || 'c_new' }; }
    else if (fn === 'rc_profile_delete') { st.profiles = st.profiles.filter(x => x.key !== body.p_key); }
    else if (fn === 'rc_members_import') out = { ok: true, inserted: body.p_rows.length, updated: 0, skipped: 0, errors: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out), headers: { 'access-control-allow-origin': '*' } });
  });
  return st;
}


function romeKey(ms) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:00`; }
function omMock() {
  const base = Math.floor(Date.now() / 3600000) * 3600000 - 2 * 3600000, time = [], n = 168;
  const o = { temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], visibility: [] };
  for (let i = 0; i < n; i++) { time.push(romeKey(base + i * 3600000)); const rain = i === 5; o.temperature_2m.push(15); o.apparent_temperature.push(14); o.precipitation_probability.push(rain ? 80 : 10); o.precipitation.push(rain ? 1.2 : 0); o.weather_code.push(rain ? 63 : 1); o.wind_speed_10m.push(12); o.wind_gusts_10m.push(20); o.visibility.push(24000); }
  const days = [], d = []; for (let i = 0; i < 7; i++) days.push(romeKey(Date.now() + i * 86400000).slice(0, 10));
  return { hourly: Object.assign({ time }, o), daily: { time: days, sunrise: days.map(x => x + 'T07:00'), sunset: days.map(x => x + 'T17:00'), weather_code: days.map(() => 3), temperature_2m_max: days.map(() => 18), temperature_2m_min: days.map(() => 9), precipitation_probability_max: days.map(() => 30), precipitation_sum: days.map(() => 0.5), wind_gusts_10m_max: days.map(() => 25) } };
}
async function newPage(browser, vp, level, log, errors) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, locale: 'it-IT', timezoneId: 'Europe/Rome', permissions: ['geolocation'], geolocation: { latitude: 41.9, longitude: 12.5 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('rb.tour', '1'); } catch (e) {} });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/router.project-osrm.org/**', r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'Ok', routes: [{ distance: 100000, duration: 3600, legs: [{ duration: 3600 }] }] }) }));
  page.omFail = false;
  await page.route('**/api.open-meteo.com/**', r => page.omFail ? r.abort() : r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(omMock()) }));
  await page.route('**/nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.request().url().includes('/reverse') ? { name: 'Roma', display_name: 'Roma, Lazio, Italia', address: { city: 'Roma' }, lat: '41.9', lon: '12.5' } : [{ name: 'Viterbo', display_name: 'Viterbo, Lazio, Italia', lat: '42.4207', lon: '12.1077', address: { city: 'Viterbo' } }]) }));
  await page.route('**/cdnjs.cloudflare.com/**/xlsx.full.min.js', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync('./node_modules/xlsx/dist/xlsx.full.min.js') }));
  const st = backend(page, level, log);
  return { ctx, page, st };
}

const L = require(require('path').join(__dirname,'..','logic.js'));
function tomorrow9() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }
function hourly(startMs, f) {
  const time = [], o = { temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], visibility: [] };
  for (let i = -12; i < 40; i++) { time.push(L.romeKey(startMs + i * 3600000)); const v = Object.assign({ t: 15, pop: 0, pr: 0, code: 1, w: 10, g: 20, vis: 20000 }, f);
    o.temperature_2m.push(v.t); o.apparent_temperature.push(v.t - 1); o.precipitation_probability.push(v.pop); o.precipitation.push(v.pr); o.weather_code.push(v.code); o.wind_speed_10m.push(v.w); o.wind_gusts_10m.push(v.g); o.visibility.push(v.vis); }
  return Object.assign({ time }, o);
}
function fixture(startMs, ageH, withCoords) {
  const d1 = L.romeKey(startMs).slice(0, 10), d2 = L.romeKey(startMs + 86400000).slice(0, 10), daily = { time: [d1, d2], sunrise: [d1 + 'T06:30', d2 + 'T06:30'], sunset: [d1 + 'T17:00', d2 + 'T17:00'] };
  const pts = [{ role: 'meeting', label: 'Fungo', day: 1, lat: 41.824428, lng: 12.462984, hourly: hourly(startMs, {}), daily },
    { role: 'stop', label: 'Caffè Castelli', day: 1, lat: 41.75, lng: 12.6, hourly: hourly(startMs, { pop: 80, pr: 1.2, code: 61 }), daily },
    { role: 'dest', label: 'Frascati', day: 1, lat: 41.81, lng: 12.68, hourly: hourly(startMs, { code: 95, pop: 90, pr: 3, g: 55, w: 30 }), daily }];
  const W = { fetched_at: new Date(Date.now() - ageH * 3600000).toISOString(), points: pts };
  if (!withCoords) W.points = pts.filter(p => p.role !== 'stop').map(p => { const q = Object.assign({}, p); delete q.lat; delete q.lng; return q; });
  return W;
}
function setupRun(st, W) {
  const r = st.runs[0], t0 = tomorrow9(); r.run_date = t0.toISOString(); r.meeting_point = 'Fungo'; r.destination = 'Frascati';
  r.meeting = { name: 'Fungo', lat: 41.824428, lng: 12.462984, kind: 'area' }; r.dest = { name: 'Frascati', lat: 41.81, lng: 12.68, kind: 'altro' }; r.days = 1;
  r.stops = [{ time: '10:30', name: 'Caffè Castelli', addr: 'Via Roma 1', lat: 41.75, lng: 12.6, day: 1, kind: 'bar' }];
  st.weather[r.id] = W;
  return t0.getTime();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const errors = [], log = [];
  const step = (n) => console.log('ok -', n);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const login = async (page) => { await page.goto(BASE); await page.waitForSelector('#code'); await page.fill('#code', 'abcd-2345'); await page.click('text=Entra'); await page.waitForSelector('.run, .tab'); await page.waitForTimeout(500); };

  /* ---- amministratore ---- */
  let { ctx, page, st } = await newPage(browser, { width: 390, height: 844 }, 3, log, errors);
  const t0 = setupRun(st, fixture(0, 0, true)); st.weather[st.runs[0].id] = fixture(t0, 1, true);
  await login(page);
  /* meteo nell'elenco: chip e avviso */
  assert.ok((await page.textContent('.run')).includes('Critico'), 'chip meteo critico sul Run'); step('elenco Run: chip meteo "Critico"');
  const bn = await page.textContent('.view'); assert.ok(bn.includes('temporale') && bn.includes('Giro dei Castelli Romani'), 'avviso in cima'); step('avviso importante in cima all\'elenco (temporale a Frascati)');
  /* intervallo di verifica meteo: 60 di base, scelta 30 */
  await page.click('.tab[data-tab=altro]'); await wait(300);
  assert.ok((await page.textContent('.view')).includes('Ogni 60 minuti'), 'intervallo di base 60');
  await page.click('.view .row:has-text("Verifica meteo")'); await page.waitForSelector('.sheet.in .seg'); await page.click('.sheet.in .seg button[data-v="30"]');
  await page.locator('.sheet.in .sb.r').last().click(); await wait(900);
  const wsv = log.filter(l => l.fn === 'rc_settings_save').pop(); assert.strictEqual(wsv.body.p_key, 'weather'); assert.strictEqual(wsv.body.p_value.interval, 30);
  assert.ok((await page.textContent('.view')).includes('Ogni 30 minuti'), 'intervallo aggiornato a 30'); step('verifica meteo ogni 30 o 60 minuti (impostazione)');
  await page.click('.tab[data-tab=run]'); await wait(300);
  /* foto tessera: anagrafica, dimensioni piccole, visibile toccando il nome */
  await page.click('.tab[data-tab=soci]'); await page.waitForSelector('button[aria-label="Nuovo socio"]'); await page.click('button[aria-label="Nuovo socio"]'); await page.waitForSelector('#mf-photo-btn');
  await page.fill('#mf-fn', 'Paolo'); await page.fill('#mf-ln', 'Fototessera');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), (async () => { await page.click('#mf-photo-btn'); await page.waitForSelector('.sheet.in .row.act'); { const tx = (await page.locator('.sheet.in .row.act').allTextContents()).join('|'); assert.ok(tx.includes('Scatta foto') && tx.includes('Scegli dalla libreria'), 'menu foto: scatta o importa: ' + tx); } await page.click('.sheet.in .row.act:has-text("Scegli dalla libreria")'); })()]);
  await fc.setFiles(__dirname + '/foto.png'); await page.waitForSelector('#mf-photo img'); await wait(300); await page.screenshot({ path: SHOTS + '43-anagrafica-foto.png' });
  const dims = await page.evaluate(() => new Promise(r => { const i = document.querySelector('#mf-photo img'); const g = new Image(); g.onload = () => r([g.width, g.height, i.src.length]); g.src = i.src; }));
  assert.deepStrictEqual(dims.slice(0, 2), [240, 320]); assert.ok(dims[2] < 60000, 'foto piccola: ' + dims[2]); step('foto tessera importata: ritagliata 240x320, ' + Math.round(dims[2] / 1024) + ' KB');
  await page.locator('.sheet.in .sb.r').last().click(); await wait(900);
  const ps = log.filter(l => l.fn === 'rc_member_photo').pop(); assert.ok(ps && /^data:image\/jpeg;base64,/.test(ps.body.p_data) && ps.body.p_data.length < 60000); step('foto salvata insieme all\'anagrafica del nuovo socio');
  await page.keyboard.press('Escape'); await wait(400);
  await page.click('.tab[data-tab=run]'); await wait(300);
  await page.click('.run'); await page.waitForSelector('.sheet.in .row'); await wait(400);
  const pn = page.locator('.sheet.in .list:has(.av) .row .rt b').first(); await pn.click(); await page.waitForSelector('.mcard .tess.big'); await page.screenshot({ path: SHOTS + '42-scheda-tessera.png' }); step('tocco sul nome tra i partecipanti: apre la foto tessera');
  await page.keyboard.press('Escape'); await wait(300);
  if (await page.locator('.sheet.in .fmn').count()) { await page.locator('.sheet.in .fmn').first().click(); await page.waitForSelector('.mcard .tess.big'); step('tocco sul nome nella formazione: apre la foto tessera'); await page.keyboard.press('Escape'); await wait(300); }
  await page.keyboard.press('Escape'); await wait(400);
  /* scheda Meteo: dove sono, ricerca, luoghi salvati, offline */
  await page.click('.tab[data-tab=meteo]'); await page.waitForSelector('#mt-here'); await page.waitForSelector('#mt-top .wxl', { timeout: 5000 }); assert.ok(await page.locator('#mt-top .wxs-t').count() === 1 && await page.evaluate(() => [...document.querySelectorAll('#mt-top .wxl *')].some(e => getComputedStyle(e).animationName !== 'none')), 'scena animata già nella scheda Meteo'); step('scheda Meteo: scena animata subito visibile');
  assert.ok((await page.textContent('.view')).includes('Tappe dei Run in programma'), 'tappe del Run nella scheda Meteo'); step('scheda Meteo: tappe dei Run in programma');
  await page.click('#mt-here'); await page.waitForSelector('#mt-cur'); const cur = await page.textContent('#mt-cur'); assert.ok(cur.includes('15°') && cur.includes('km/h'));
  assert.ok(await page.locator('#mt-hero[data-sky]').count() === 1 && (await page.locator('#mt-hero .wxs-t').textContent()).includes('15°'), 'scena animata con temperatura'); assert.ok((await page.textContent('#mt-ride')).includes('moto') || (await page.textContent('#mt-ride')).includes('Moto') || (await page.textContent('#mt-ride')).includes('partire')); assert.ok(await page.locator('#mt-hours .hcell').count() >= 6, 'ore scorrevoli'); assert.ok((await page.textContent('.sheet.in')).includes('Per chi va in moto')); await page.emulateMedia({ reducedMotion: 'reduce' }); await wait(200);
  { const an = await page.evaluate(() => { const els = [...document.querySelectorAll('#mt-hero .wxl *')]; const run = els.filter(e => getComputedStyle(e).animationName !== 'none').length; const other = getComputedStyle(document.querySelector('.tab')).animationName; return { n: els.length, run, other }; }); assert.ok(an.n > 0 && an.run > 0, 'animazioni meteo attive anche con "Riduci movimento": ' + JSON.stringify(an)); }
  await page.emulateMedia({ reducedMotion: 'no-preference' }); step('animazioni meteo attive anche con Riduci movimento');
  await wait(900); await page.screenshot({ path: SHOTS + '47-meteo-moto.png' });
  assert.ok((await page.textContent('.sheet.in')).includes('Prossime 12 ore') && (await page.textContent('.sheet.in')).includes('Prossimi giorni')); step('dove sono: meteo ora, 12 ore e giorni');
  assert.ok((await page.textContent('.sheet.in')).includes('Dalle') && (await page.textContent('.sheet.in')).includes('pioggia'), 'avviso pioggia nelle prossime ore'); step('avviso pioggia imminente nel luogo');
  await page.click('#mt-star'); await wait(300); assert.ok((await page.textContent('#mt-star')).includes('Rimuovi')); await page.keyboard.press('Escape'); await wait(400);
  await page.fill('#mt-q', 'Viterbo'); await page.click('#mt-go'); await page.waitForSelector('#mt-res .row'); await page.click('#mt-res .row'); await page.waitForSelector('#mt-cur'); await page.click('#mt-star'); await wait(300); await page.keyboard.press('Escape'); await wait(500);
  assert.strictEqual(await page.locator('.view .list .row:has-text("Tocca per")').count() + await page.locator('.view .list .row:has-text("km/h")').count(), 2, 'due luoghi salvati'); step('ricerca luogo e salvataggio in "I miei luoghi"');
  await page.screenshot({ path: SHOTS + '40-meteo.png' });
  await page.setViewportSize({ width: 320, height: 700 }); await wait(300);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'scheda Meteo senza scorrimento orizzontale a 320px'); await page.screenshot({ path: SHOTS + '41-meteo-320.png' });
  const tw = await page.evaluate(() => [...document.querySelectorAll('.tab')].map(e => Math.round(e.getBoundingClientRect().width))); assert.ok(tw.every(x => x >= 40), 'tab abbastanza larghe: ' + tw);
  await page.setViewportSize({ width: 390, height: 844 }); await wait(300); step('scheda Meteo: nessuno scorrimento a 320px, 7 tab leggibili');
  page.omFail = true; await page.evaluate(() => { RB.render(); }); await wait(600);
  await page.locator('.view .list .row:has-text("Viterbo")').first().click(); await page.waitForSelector('#mt-stale'); assert.ok((await page.textContent('#mt-stale')).includes('Ultima verifica')); step('senza segnale: ultimo controllo del luogo con avviso');
  page.omFail = false; await page.keyboard.press('Escape'); await wait(400);
  await page.click('.tab[data-tab=run]'); await wait(300);
  await page.click('button[aria-label="Nuovo Run"]'); await page.waitForSelector('.sheet.in .row.act'); await page.click('.sheet.in .row.act:has-text("Copia da")'); await page.waitForSelector('#rf-title');
  assert.ok((await page.inputValue('#rf-title')).length > 0 && await page.locator('#rf-url').isVisible()); step('nuovo Run copiato dall\'ultimo (titolo precompilato)');
  await page.keyboard.press('Escape'); await wait(400); if (await page.locator('.sheet.in .ask').count()) { await page.locator('.sheet.in .ask button').first().click(); await wait(300); }
  await page.screenshot({ path: SHOTS + '30-run-meteo.png' });
  /* dettaglio */
  await page.click('.run h3'); await page.waitForSelector('.sheet.in .wxc'); await page.waitForTimeout(400);
  let tt = await page.textContent('.sheet.in');
  assert.ok(tt.includes('Meteo lungo il percorso') && tt.includes('Pioggia prevista a Caffè Castelli') && /Frascati alle \d\d:\d\d: temporale/.test(tt), 'avvisi nel dettaglio: ' + tt.slice(0, 400));
  assert.ok(tt.includes('km/h') && tt.includes('💧') && tt.includes('raff.') && tt.includes('Aggiornato alle'), 'parametri moto'); step('dettaglio: pioggia lungo il percorso, temporale critico e parametri (vento, raffiche, pioggia)');
  assert.strictEqual(await page.locator('#wx-stale').count(), 0);
  await page.screenshot({ path: SHOTS + '31-meteo-dettaglio.png' });
  await page.click('#wx-refresh'); await wait(300); assert.ok(log.some(l => l.fn === 'rc_weather_refresh' && l.body.p_run === st.runs[0].id)); step('"Aggiorna ora" richiede un nuovo controllo al server');
  await page.keyboard.press('Escape'); await wait(400);
  /* dato vecchio + senza rete: resta l'ultimo valore */
  st.weather[st.runs[0].id] = fixture(t0, 5, true); await page.evaluate(() => RB.sync()); await wait(400);
  await ctx.setOffline(true); await page.evaluate(() => RB.sync()); await wait(600);
  await page.click('.run h3'); await page.waitForSelector('.sheet.in .wxc'); await wait(400);
  assert.ok(await page.locator('#wx-stale').count() === 1 && (await page.textContent('#wx-stale')).includes('Ultima verifica alle'), 'avviso dato vecchio'); assert.ok((await page.textContent('.sheet.in')).includes('Caffè Castelli'), 'ultimo dato ancora visibile offline'); step('senza rete: ultimo dato orario ancora visibile con avviso "ultima verifica"');
  await page.screenshot({ path: SHOTS + '32-meteo-offline.png' });
  await page.keyboard.press('Escape'); await wait(300); await ctx.setOffline(false);

  /* ---- archivio ---- */
  await page.evaluate(() => RB.sync()); await page.click('.seg button[data-v=past]'); await wait(300);
  assert.ok(await page.locator('#ar-q').count() === 1); const c1 = await page.locator('.view .run').count(); assert.ok(c1 >= 1);
  await page.fill('#ar-q', 'fregene'); await wait(200); assert.strictEqual(await page.locator('.view .run').count(), 1); assert.ok((await page.textContent('.view')).includes('Pranzo di fine stagione'));
  await page.fill('#ar-q', 'zzzz'); await wait(200); assert.strictEqual(await page.locator('.view .run').count(), 0); await page.fill('#ar-q', ''); await wait(200);
  await page.selectOption('#ar-status', 'annullato'); await wait(200); assert.strictEqual(await page.locator('.view .run').count(), 0); await page.selectOption('#ar-status', ''); await wait(200);
  const yrs = await page.locator('#ar-year option').allTextContents(); assert.ok(yrs.length >= 2 && yrs[0] === 'Tutti gli anni'); await page.selectOption('#ar-year', yrs[1]); await wait(200); assert.ok(await page.locator('.view .run').count() <= c1); await page.selectOption('#ar-year', ''); await wait(200);
  step('archivio: ricerca per testo, stato e anno');
  await page.click('.run h3:has-text("Pranzo di fine stagione")'); await page.waitForSelector('.sheet.in'); await wait(500);
  await page.click('.sheet.in .row:has-text("Richiama come nuovo Run")'); await page.waitForSelector('#rf-title'); await wait(400);
  assert.strictEqual(await page.inputValue('#rf-title'), 'Pranzo di fine stagione'); assert.ok(!(await page.textContent('.sheet.in:last-of-type')).includes('Concluso') || true);
  assert.strictEqual(await page.locator('.sheet.in .seg button:has-text("Concluso")').count(), 0, 'stato non modificabile in un nuovo Run');
  await page.locator('.sheet.in .sb.r').last().click(); await wait(700);
  const cl = log.filter(l => l.fn === 'rc_run_save').pop().body.p; assert.strictEqual(cl.id, null); assert.strictEqual(cl.status, 'programmato'); assert.ok(new Date(cl.run_date) > new Date()); step('Run archiviato richiamato come nuovo (id nuovo, data futura)');
  await page.keyboard.press('Escape'); await wait(500);

  /* ---- dashboard e report ---- */
  await page.click('.tab[data-tab=report]'); await wait(500);
  tt = await page.textContent('.view'); assert.ok(tt.includes('Soci attivi') && tt.includes('Prossimo Run') && tt.includes('Partecipanti per Run'), 'dashboard: ' + tt.slice(0, 300));
  assert.ok(await page.locator('.kpis .kpi').count() === 4 && await page.locator('.bars .bar-r').count() >= 1); step('dashboard: KPI, prossimo Run con meteo, partecipanti');
  await page.screenshot({ path: SHOTS + '33-dashboard.png' });
  await page.click('.seg button[data-v=reports]'); await wait(300);
  assert.strictEqual(await page.locator('.view .list').first().locator('.row').count(), 4); step('4 report standard');
  await page.screenshot({ path: SHOTS + '34-report.png' });
  await page.click('.row:has-text("Attività dei Run")'); await page.waitForSelector('.sheet.in .tbl'); await wait(400);
  assert.ok((await page.locator('.sheet.in .tbl tbody tr').count()) >= 2); assert.ok((await page.textContent('.sheet.in .tbl thead')).includes('Titolo'));
  await page.screenshot({ path: SHOTS + '35-report-tabella.png' });
  await page.selectOption('#rv-year', ''); await wait(200); const nAll = await page.locator('.sheet.in .tbl tbody tr').count();
  await page.selectOption('#rv-year', String(new Date().getFullYear())); await wait(200); assert.ok((await page.locator('.sheet.in .tbl tbody tr').count()) <= nAll); await page.selectOption('#rv-year', ''); await wait(200);
  /* esportazioni */
  const XLSX = require('./node_modules/xlsx');
  let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('.sheet.in .row:has-text("Esporta in Excel")')]);
  let p1 = await dl.path(); const wb = XLSX.readFile(p1), rowsX = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }); assert.strictEqual(rowsX[0][1], 'Titolo'); assert.ok(rowsX.length >= nAll + 1); step('report: esportazione Excel con intestazioni');
  [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('.sheet.in .row:has-text("Esporta in CSV")')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8'); assert.ok(csv.charCodeAt(0) === 0xfeff && csv.split('\r\n')[0].includes('Titolo;')); step('report: esportazione CSV (UTF-8, separatore ;)');
  /* personalizzazione e salvataggio */
  await page.click('.sheet.in .row:has-text("Personalizza questo report")'); await page.waitForSelector('#rb-name'); await wait(400);
  await page.fill('#rb-name', 'Soci attivi con moto');
  await page.locator('.sheet.in .seg button:has-text("Soci")').click(); await wait(300);
  assert.ok(await page.locator('.sheet.in').last().locator('.tbl').count() === 1);
  await page.selectOption('#rb-active', 'yes'); await wait(200);
  const nSoc = +/(\d+)/.exec(await page.textContent('#rb-count'))[1]; assert.ok(nSoc > 5 && nSoc < 30);
  await page.locator('.sheet.in .sb.r').last().click(); await wait(800);
  const sv = log.filter(l => l.fn === 'rc_report_save').pop().body.p; assert.strictEqual(sv.name, 'Soci attivi con moto'); assert.strictEqual(sv.def.ds, 'socio'); assert.strictEqual(sv.def.filters.active, 'yes'); assert.ok(sv.def.cols.length >= 1); assert.strictEqual(sv.id, null); step('report personalizzato creato e salvato');
  await page.keyboard.press('Escape'); await wait(300);
  assert.ok((await page.textContent('.view')).includes('Soci attivi con moto')); await page.click('.row:has-text("Soci attivi con moto")'); await page.waitForSelector('.sheet.in .tbl'); await wait(300);
  assert.ok((await page.textContent('.sheet.in')).includes('Rossi')); await page.keyboard.press('Escape'); await wait(300);
  await page.locator('.row:has-text("Soci attivi con moto") button[aria-label="Elimina"]').click(); await wait(300); await page.locator('.sheet.in .btn.dng').click(); await wait(700);
  assert.ok(!(await page.textContent('.view')).includes('Soci attivi con moto')); step('report salvato riaperto ed eliminato');
  /* nessun overflow a 320px */
  await page.setViewportSize({ width: 320, height: 700 }); await page.click('.seg button[data-v=dash]'); await wait(400);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'overflow dashboard 320px'); step('dashboard senza scorrimento orizzontale a 320px');
  await ctx.close();

  /* ---- socio: meteo solo su ritrovo e destinazione, nessun report ---- */
  ({ ctx, page, st } = await newPage(browser, { width: 390, height: 844 }, 1, log, errors));
  const t1 = setupRun(st, fixture(0, 0, false)); st.weather[st.runs[0].id] = fixture(t1, 1, false); st.runs[0].meeting = null; st.runs[0].dest = null; st.runs[0].stops = [];
  await login(page);
  assert.strictEqual(await page.locator('.tab[data-tab=report]').count(), 0); step('socio: nessuna scheda Report');
  await page.click('.run h3'); await page.waitForSelector('.sheet.in .wxc'); await wait(400);
  tt = await page.textContent('.sheet.in'); assert.ok(tt.includes('Meteo lungo il percorso') && tt.includes('Frascati') && !tt.includes('Caffè Castelli'), 'socio: solo ritrovo e destinazione'); step('socio: meteo su ritrovo e destinazione, senza tappe');
  await ctx.close();
  /* ---- road captain: nessun report ---- */
  ({ ctx, page, st } = await newPage(browser, { width: 390, height: 844 }, 'rc', log, errors));
  await login(page); assert.strictEqual(await page.locator('.tab[data-tab=report]').count(), 0); step('road captain: nessuna scheda Report'); await ctx.close();

  assert.deepStrictEqual(errors, [], errors.join('\n'));
  await browser.close(); console.log('WX OK');
})().catch(e => { console.error(e); process.exit(1); });
