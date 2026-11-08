// Test delle novità: notifiche, avvisi, tessera/QR, check-in, statistiche, calendario, GPX, import Excel, elenchi. Uso: node extras.test.js [dispositivo|all]
const pw = require(process.env.PW || 'playwright');
const fs = require('fs'), assert = require('assert'), path = require('path');
const XLSX = require(path.join(__dirname, 'node_modules', 'xlsx'));
const BASE = process.env.BASE || 'http://127.0.0.1:8123/';
const NATIVE = process.env.ENGINE === 'native';
const ID = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const DAY = 86400000;

function mk() {
  const members = [['Marco', 'Bianchi'], ['Mario', 'Rossi'], ['Anna', 'Conti'], ['Luca', 'Gialli']].map((n, i) => ({ id: ID(i + 1), first_name: n[0], last_name: n[1], title: i === 0 ? 'presidente' : 'socio', active: true, bike: 'Road King', has_photo: false, phone: '3331112233', email: 'a@b.it', joined_on: '2022-01-01', tessera: '10' + i }));
  const mkRun = (i, off, st, km, days) => ({ id: ID(50 + i), title: 'Run ' + i, run_date: new Date(Date.now() + off * DAY).toISOString(), days: days || 1, status: st, fee: '0', rooms: [], extras: [], installments: [], stops: [], meeting_point: 'Ostia', destination: 'Frascati', km: km, difficulty: 'media', nav_tool: 'both' });
  const runs = [mkRun(1, 10, 'programmato', 100), mkRun(2, -20, 'concluso', 120), mkRun(3, -50, 'concluso', 300, 3)];
  const signups = [];
  [[1, 1, [1, 2, 3]], [2, 2, [1, 2]]].forEach(x => x[2].forEach(m => signups.push({ run_id: runs[x[0]].id, member_id: ID(m), status: 'si', passengers: 0, checked_in: true })));
  signups.push({ run_id: runs[0].id, member_id: ID(1), status: 'si', passengers: 0, checked_in: false });
  signups.push({ run_id: runs[0].id, member_id: ID(2), status: 'si', passengers: 1, checked_in: false });
  const perms = ['members_view', 'phones_view', 'personal_view', 'route_view', 'runs_edit', 'signups_manage', 'emergency_manage', 'formation_edit', 'formation_draft_view'];
  return { me: { id: ID(1), first_name: 'Marco', last_name: 'Bianchi', title: 'presidente', perms }, profiles: [], members, runs, signups, payments: [], settings: { chapter: { name: 'Roma Chapter' } }, weather: {}, reports: [] };
}

function backend(page, log) {
  const st = mk(); st.notices = [{ id: ID(700), title: 'Cena sociale', body: 'Sabato sera alle 20', pinned: true, created_at: new Date().toISOString(), expires_at: null }];
  page.route('**/rest/v1/rpc/**', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    log.push({ fn, body });
    let out = { ok: true };
    if (fn === 'rc_login') out = body.p_code === 'ABCD2345' ? { ok: true, me: st.me } : { ok: false, error: 'auth' };
    else if (fn === 'rc_sync') out = Object.assign({ ok: true, server_time: new Date().toISOString() }, st);
    else if (fn === 'rc_emergency_get') out = { ok: true, profile: null, consent: false };
    else if (fn === 'rc_sos_poll') out = { ok: true, open: 0 };
    else if (fn === 'rc_photos') out = { ok: true, photos: {} };
    else if (fn === 'rc_weather_refresh' || fn === 'rc_weather_get') out = { ok: true, weather: null };
    else if (fn === 'rc_notice_list') out = { ok: true, items: st.notices };
    else if (fn === 'rc_notice_save') { st.notices.push({ id: ID(701), title: body.p_title, body: body.p_body, pinned: body.p_pinned, created_at: new Date().toISOString(), expires_at: null }); out = { ok: true, id: ID(701) }; }
    else if (fn === 'rc_run_save') out = { ok: true, id: ID(800 + log.filter(l => l.fn === 'rc_run_save').length) };
    else if (fn === 'rc_history_import') out = { ok: true, count: body.p_items.length };
    else if (fn === 'rc_checkin') { const s = st.signups.find(x => x.run_id === body.p_run && x.member_id === body.p_member); if (s) s.checked_in = body.p_value; }
    else if (fn === 'rc_signup') st.signups.push({ run_id: body.p_run, member_id: body.p_member, status: body.p_status, passengers: 0, checked_in: false });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out), headers: { 'access-control-allow-origin': '*' } });
  });
  return st;
}

async function run(devName) {
  const base = pw.devices[devName] || {}, opts = Object.assign({}, base);
  let engine = pw.chromium;
  if (NATIVE) { const bn = base.defaultBrowserType || (/Safari/.test(devName) ? 'webkit' : /Firefox/.test(devName) ? 'firefox' : 'chromium'); engine = pw[bn]; } else delete opts.defaultBrowserType;
  const launch = NATIVE ? {} : { executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] };
  const browser = await engine.launch(launch), errors = [], log = [], res = [];
  const ok = n => res.push(n);
  const ctx = await browser.newContext(Object.assign({}, opts, { locale: 'it-IT', timezoneId: 'Europe/Rome', permissions: NATIVE ? [] : ['camera'], acceptDownloads: true }));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(devName + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) errors.push(devName + ' console: ' + m.text()); });
  await page.route('**/cdnjs.cloudflare.com/**/xlsx.full.min.js', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js')) }));
  const st = backend(page, log);
  const noOverflow = async label => { const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); assert(w.sw <= w.cw + 1, `${devName} ${label}: scroll orizzontale`); };
  const sheet = () => page.locator('.sheet.in').last();
  await page.goto(BASE); await page.fill('#code', 'ABCD2345'); await page.click('button.btn.pri'); await page.waitForSelector('.tab[data-tab=run]');

  /* avvisi sulla scheda Run */
  await page.waitForSelector('#notices .notice.pin'); assert((await page.textContent('#notices')).includes('Cena sociale')); ok('avviso visibile');

  /* Altro: strumenti */
  await page.click('.tab[data-tab=altro]'); await page.waitForSelector('#x-tools');
  await noOverflow('altro');
  /* notifiche emergenze: riga presente, stato coerente col dispositivo */
  await page.waitForSelector('#push-list .push-row'); await page.waitForFunction(() => !/Controllo/.test(document.querySelector('#push-list').innerText), null, { timeout: 5000 });
  const ptxt = await page.textContent('#push-list');
  assert(/Non attive|Attive|Bloccate|Non supportate|schermata Home/.test(ptxt), devName + ' push: ' + ptxt);
  ok('riga notifiche');

  /* tessera digitale */
  await page.click('#x-tools .row:has-text("Tessera digitale")'); await page.waitForSelector('#x-qr svg', { timeout: 8000 });
  assert.equal(await page.getAttribute('#x-qr', 'data-qr'), 'RBK1:' + ID(1)); const qb = await page.locator('#x-qr').boundingBox(); assert(qb.width >= 180 && Math.abs(qb.width - qb.height) < 3, 'QR quadrato e grande'); ok('tessera con QR');
  await page.keyboard.press('Escape'); await page.waitForTimeout(350);

  /* statistiche */
  await page.click('#x-tools .row:has-text("Le mie statistiche")'); await page.waitForSelector('#x-stats .xs');
  const nums = await page.locator('#x-stats .xstats').first().locator('b').allTextContents(); assert.equal(nums[0], '2'); ok('statistiche personali (2 Run)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  await page.click('#x-tools .row:has-text("Statistiche del Chapter")'); await page.waitForSelector('#x-stats .xbar'); assert((await page.textContent('#x-stats')).includes('Più presenti')); ok('statistiche Chapter');
  await page.keyboard.press('Escape'); await page.waitForTimeout(350);

  /* avvisi: nuovo */
  await page.click('#x-tools .row:has-text("Avvisi")'); await page.click('#nt-new'); await page.waitForSelector('#nt-t');
  await page.fill('#nt-t', 'Raduno annullato'); await page.fill('#nt-b', 'Per maltempo'); await page.locator('.sheet:has(#nt-t) .sb.r').click();
  await page.waitForFunction(() => /Raduno annullato/.test(document.body.innerText), null, { timeout: 5000 });
  const sv = log.find(l => l.fn === 'rc_notice_save').body; assert.equal(sv.p_title, 'Raduno annullato'); assert.equal(sv.p_days, 14); ok('nuovo avviso');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(350);

  /* scheda Run: calendario, elenco, scansione */
  await page.click('.tab[data-tab=run]'); await page.waitForSelector('text=Run 1'); await page.locator('#view >> text=Run 1').first().click(); await page.waitForSelector('#x-run-tools');
  const [d1] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('#x-run-tools .row:has-text("calendario")')]);
  assert(/\.ics$/.test(d1.suggestedFilename())); const ics = fs.readFileSync(await d1.path(), 'utf8'); assert(ics.startsWith('BEGIN:VCALENDAR') && ics.includes('SUMMARY:Roma Chapter · Run 1') && ics.includes('LOCATION:Ostia')); ok('file calendario');
  const [d2] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#x-run-tools .row:has-text("Excel")')]);
  const wb = XLSX.readFile(await d2.path()), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }); assert(rows.length >= 3 && rows[0][0] === 'Cognome'); ok('elenco partecipanti Excel (' + (rows.length - 1) + ' righe)');
  await page.click('#x-run-tools .row:has-text("QR")'); await page.waitForSelector('#x-video');
  await page.evaluate(id => RB.scanHandle('RBK1:' + id), ID(2)); await page.waitForSelector('#x-scan-out.ok'); assert(log.some(l => l.fn === 'rc_checkin' && l.body.p_member === ID(2) && l.body.p_value === true)); ok('scansione: presente');
  await page.evaluate(() => RB.scanHandle('http://evil')); await page.waitForSelector('#x-scan-out.ko'); await page.evaluate(() => RB.scanHandle('RBK1:00000000-0000-4000-8000-0000000000ff')); assert(/non trovato/.test(await page.textContent('#x-scan-out'))); ok('scansione: QR non valido/sconosciuto');
  await page.evaluate(id => RB.scanHandle('RBK1:' + id), ID(4)); await page.waitForSelector('#x-scan-add'); await page.click('#x-scan-add'); await page.waitForSelector('#x-scan-out.ok'); assert(log.some(l => l.fn === 'rc_signup' && l.body.p_member === ID(4))); ok('scansione: iscrizione al volo');
  const vid = await page.evaluate(() => { const v = document.getElementById('x-video'); return { has: !!v.srcObject }; }); if (!NATIVE) assert(vid.has, 'fotocamera attiva');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  assert(await page.evaluate(() => !document.getElementById('x-video') || !document.getElementById('x-video').srcObject || document.getElementById('x-video').srcObject.getTracks().every(t => t.readyState === 'ended')), 'fotocamera spenta alla chiusura'); ok('fotocamera spenta alla chiusura');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  /* import Run da Excel */
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([['Titolo', 'Data', 'Ora', 'Giorni', 'Ritrovo', 'Destinazione', 'Km', 'Difficoltà', 'Quota'], ['Giro nuovo', '15/03/2031', '09:00', 1, 'Ostia', 'Frascati', 120, 'facile', 10], ['Storico 2024', '10/05/2024', '09:00', 2, '', '', 300, 'media', ''], ['Rotto', 'xx', '', 1], ['Run 1', new Date(Date.now() + 10 * DAY).toLocaleDateString('it-IT'), '', 1]]), 'Run');
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([['Titolo Run', 'Cognome', 'Nome', 'Presente'], ['Storico 2024', 'Rossi', 'Mario', 'si'], ['Storico 2024', 'Conti', 'Anna', 'si'], ['Storico 2024', 'Sconosciuto', 'Tizio', 'si']]), 'Presenze');
  const xf = path.join(__dirname, 'import-run.xlsx'); XLSX.writeFile(wb2, xf);
  await page.click('.tab[data-tab=altro]'); await page.click('#x-tools .row:has-text("Importa Run")'); await page.waitForSelector('#x-imp-pick');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#x-imp-pick')]); await fc.setFiles(xf);
  await page.waitForSelector('#x-imp-sum', { timeout: 15000 }); const sum = await page.textContent('#x-imp-sum'); assert(/2 Run pronti/.test(sum) && /1 già presenti/.test(sum) && /1 con errori/.test(sum), 'riepilogo: ' + sum); assert(/2 da importare, 1 da controllare/.test(sum), 'presenze: ' + sum); await noOverflow('import'); ok('riepilogo import: ' + sum.replace(/\s+/g, ' ').slice(0, 90));
  await page.click('#x-imp-go'); await page.waitForSelector('#x-imp-done', { timeout: 15000 });
  const saves = log.filter(l => l.fn === 'rc_run_save'); assert.equal(saves.length, 2); assert.equal(saves.find(s => s.body.p.title === 'Storico 2024').body.p.status, 'concluso'); assert.equal(saves.find(s => s.body.p.title === 'Giro nuovo').body.p.status, 'programmato');
  const hi = log.find(l => l.fn === 'rc_history_import'); assert.equal(hi.body.p_items.length, 2); ok('import eseguito: 2 Run + 2 presenze');
  fs.unlinkSync(xf); await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  /* GPX nel pianificatore */
  await page.evaluate(() => RB.runForm(null, {})); await page.waitForSelector('#rf-title');
  const gpx = path.join(__dirname, 'giro.gpx'); fs.writeFileSync(gpx, '<?xml version="1.0"?><gpx><wpt lat="41.9" lon="12.5"><name>Bar Ostia</name></wpt><wpt lat="42.0" lon="12.7"><name>Pranzo</name></wpt></gpx>');
  const gsel = '#rf-gpx'; if (!(await page.locator(gsel).count())) { const more = page.locator('.sheet.in .row:has-text("Tappe")'); if (await more.count()) await more.first().click(); }
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click(gsel)]); await fc2.setFiles(gpx);
  await page.waitForFunction(() => /2 tappe importate/.test(document.body.innerText), null, { timeout: 5000 }); ok('GPX importato nelle tappe'); fs.unlinkSync(gpx);

  await noOverflow('fine'); await ctx.close(); await browser.close();
  return { res, errors };
}

(async () => {
  const arg = process.argv[2] || 'default';
  const list = arg === 'all' ? ['Pixel 7', 'iPhone 14', 'iPad (gen 7)', 'Desktop Chrome', 'iPhone SE'] : arg === 'default' ? ['Pixel 7', 'iPad (gen 7)', 'Desktop Chrome'] : [arg];
  let fail = 0; const rows = [];
  for (const d of list) {
    try { const { res, errors } = await run(d); if (errors.length) { fail++; rows.push(`FAIL  ${d}: errori console\n   ` + errors.slice(0, 3).join('\n   ')); } else rows.push(`OK    ${d}: ${res.length} controlli`); }
    catch (e) { fail++; rows.push(`FAIL  ${d}: ${String(e.message).split('\n').slice(0, 6).join(' | ')}`); }
  }
  console.log(rows.join('\n')); console.log(fail ? `PROBLEMI ${fail}` : 'TUTTI OK'); process.exit(fail ? 1 : 0);
})();
