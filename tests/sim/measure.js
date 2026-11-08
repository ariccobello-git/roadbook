// Misura sull'app VERA (Chrome emulato, telefono) quanti tocchi, caratteri e schermate servono per ogni compito, e controlla leggibilità/area di tocco di ogni schermata.
const pw = require(process.env.PW || 'playwright'); const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8123/', DAY = 86400000, ID = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
function mk(level) {
  const members = [['Marco', 'Bianchi'], ['Mario', 'Rossi'], ['Anna', 'Conti'], ['Luca', 'Gialli'], ['Sara', 'Blu'], ['Paolo', 'Neri']].map((n, i) => ({ id: ID(i + 1), first_name: n[0], last_name: n[1], title: i === 0 ? 'presidente' : 'socio', active: true, bike: 'Road King', has_photo: false, phone: '3331112233', email: 'a@b.it', joined_on: '2022-01-01', tessera: '10' + i }));
  const run = { id: ID(50), title: 'Giro dei Castelli', run_date: new Date(Date.now() + 10 * DAY).toISOString(), days: 1, status: 'programmato', fee: '0', rooms: [], extras: [], installments: [], stops: [{ name: 'Bar', lat: 41.9, lng: 12.5, day: 1 }], meeting_point: 'Ostia', destination: 'Frascati', km: 100, difficulty: 'media', nav_tool: 'both', route_public: true };
  const signups = [2, 3, 4, 5].map(i => ({ run_id: run.id, member_id: ID(i), status: 'si', passengers: 0, checked_in: false }));
  const all = ['members_view', 'phones_view', 'personal_view', 'route_view', 'runs_edit', 'signups_manage', 'emergency_manage', 'formation_edit', 'formation_draft_view'];
  const me = level === 'staff' ? { id: ID(1), first_name: 'Marco', last_name: 'Bianchi', title: 'presidente', perms: all } : { id: ID(6), first_name: 'Paolo', last_name: 'Neri', title: 'socio', perms: ['members_view'] };
  return { me, profiles: [], members, runs: [run], signups, payments: [], settings: { chapter: { name: 'Roma Chapter' } }, weather: {}, reports: [], notices: [{ id: ID(700), title: 'Cena sociale', body: 'Sabato sera', pinned: true, created_at: new Date().toISOString(), expires_at: null }] };
}
function backend(page, st) {
  page.route('**/rest/v1/rpc/**', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}'); let out = { ok: true };
    if (fn === 'rc_login') out = body.p_code === 'ABCD2345' ? { ok: true, me: st.me } : { ok: false, error: 'auth' };
    else if (fn === 'rc_sync') out = Object.assign({ ok: true, server_time: new Date().toISOString() }, st);
    else if (fn === 'rc_emergency_get') out = { ok: true, profile: st.emg || null, consent: !!st.emg };
    else if (fn === 'rc_emergency_save') st.emg = body.p_data;
    else if (fn === 'rc_sos_poll') out = { ok: true, open: 0 };
    else if (fn === 'rc_photos') out = { ok: true, photos: {} };
    else if (fn === 'rc_weather_get' || fn === 'rc_weather_refresh') out = { ok: true, weather: null };
    else if (fn === 'rc_notice_list') out = { ok: true, items: st.notices };
    else if (fn === 'rc_signup') { const m = body.p_member || st.me.id; const s = st.signups.find(x => x.run_id === body.p_run && x.member_id === m); if (s) { s.status = body.p_status; s.passengers = body.p_passengers; } else st.signups.push({ run_id: body.p_run, member_id: m, status: body.p_status, passengers: body.p_passengers || 0, checked_in: false }); }
    else if (fn === 'rc_checkin') { const s = st.signups.find(x => x.run_id === body.p_run && x.member_id === body.p_member); if (s) s.checked_in = body.p_value; }
    else if (fn === 'rc_sos_send') out = { ok: true, id: ID(900), verified: true, identified: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out), headers: { 'access-control-allow-origin': '*' } });
  });
}
const AUDIT = (rootSel) => {
  const sh = document.querySelectorAll('.sheet.in'); const root = rootSel ? document.querySelector(rootSel) : (sh.length ? sh[sh.length - 1] : document.getElementById('view') || document.body);
  const out = { cls: {}, small: 0, texts: 0, tiny: 0, tapSmall: 0, taps: 0, minTap: 999, ex: [] };
  const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight + 2000; };
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { if (!n.nodeValue.trim()) continue; const e = n.parentElement; if (!e || !vis(e) || /SCRIPT|STYLE/.test(e.tagName)) continue; out.texts++; const fs0 = parseFloat(getComputedStyle(e).fontSize); if (fs0 < 14) out.small++; if (fs0 < 12) { out.tiny++; if (out.ex.length < 4) out.ex.push(n.nodeValue.trim().slice(0, 24) + ' ' + fs0 + 'px'); } }
  root.querySelectorAll('button,a[href],input,select,textarea,[role=button]').forEach(e => { if (!vis(e) || e.type === 'hidden' || (e.offsetParent === null && getComputedStyle(e).position !== 'fixed')) return; const r = e.getBoundingClientRect(); if (r.width * r.height === 0) return; out.taps++; const m = Math.min(r.width, r.height); if (m < out.minTap) out.minTap = m; if (m < 44) { out.tapSmall++; const k = e.tagName.toLowerCase() + '.' + (String(e.className).split(' ')[0] || '-') + (e.getAttribute('aria-label') ? '[' + e.getAttribute('aria-label').slice(0, 14) + ']' : ''); out.cls[k] = (out.cls[k] || 0) + 1; } });
  return out;
};
(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const result = { tasks: {}, screens: {} };
  async function session(level, fn) {
    const ctx = await browser.newContext(Object.assign({}, pw.devices['Pixel 7'], { locale: 'it-IT', permissions: ['geolocation', 'camera'], geolocation: { latitude: 41.9, longitude: 12.5 }, acceptDownloads: true })); const page = await ctx.newPage(); const st = mk(level);
    backend(page, st); await page.addInitScript(() => { window.__sc = 0; new MutationObserver(() => {}).observe(document, { childList: true }); });
    const cur = { name: null, taps: 0, chars: 0, screens: 0 }; const rec = n => { result.tasks[n] = result.tasks[n] || { level }; return result.tasks[n]; };
    const T = {
      begin(n) { cur.name = n; cur.taps = 0; cur.chars = 0; cur.screens = 0; },
      async tap(sel, o) { cur.taps++; await page.locator(sel).first().click(o); },
      async type(sel, v) { cur.chars += String(v).length; cur.taps++; await page.locator(sel).first().fill(v); },
      screen() { cur.screens++; },
      end() { Object.assign(rec(cur.name), { taps: cur.taps, chars: cur.chars, screens: cur.screens }); },
      async audit(name, root) { await page.waitForTimeout(350); result.screens[name] = await page.evaluate(AUDIT, root || null); }
    };
    await fn(page, T, st); await ctx.close();
  }
  await session('socio', async (page, T) => {
    await page.goto(BASE); await page.waitForSelector('#code'); await T.audit('login');
    T.begin('primo accesso (codice 8 caratteri)'); await T.type('#code', 'ABCD2345'); await T.tap('button.btn.pri'); T.screen(); await page.waitForSelector('.tab[data-tab=run]'); T.end();
    await T.audit('elenco Run'); await T.audit('barra delle schede', '.tabs');
    T.begin('rispondere "Ci sono" a un Run'); await T.tap('#view >> text=Giro dei Castelli'); T.screen(); await page.waitForSelector('.sheet.in .seg'); await T.tap('.sheet.in .seg button:has-text("Ci sono")'); T.end(); await T.audit('scheda Run');
    T.begin('aggiungere un passeggero'); await T.tap('.sheet.in .pass .tg, .sheet.in .pass button'); T.end(); await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    T.begin('vedere il meteo'); await T.tap('.tab[data-tab=meteo]'); T.screen(); T.end(); await T.audit('Meteo');
    T.begin('mostrare la tessera QR'); await T.tap('.tab[data-tab=altro]'); T.screen(); await T.tap('#x-tools .row:has-text("Tessera digitale")'); T.screen(); await page.waitForSelector('#x-qr svg'); T.end(); await T.audit('tessera'); await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    await T.audit('Altro');
    T.begin('compilare i dati di emergenza (prima volta)'); await T.tap('#emg-list .row'); T.screen(); await page.waitForSelector('#ef-cname, .sheet.in input'); 
    const inputs = page.locator('.sheet.in input[type=text], .sheet.in input:not([type])'); const cnt = await inputs.count();
    await T.type('.sheet.in input >> nth=0', 'x').catch(() => {}); T.end(); const rec0 = result.tasks['compilare i dati di emergenza (prima volta)']; rec0.fields = cnt; await T.audit('dati emergenza'); await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    await page.click('.tab[data-tab=run]');
    T.begin('inviare una segnalazione SOS (con accesso)'); await T.tap('#sos-btn'); T.screen(); await T.tap('.sos-kind[data-k="moto"]'); T.screen(); await page.waitForSelector('#sos-send'); await T.audit('SOS'); await T.tap('#sos-send'); await page.waitForSelector('#sos-done'); T.end();
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    T.begin('leggere gli avvisi'); await page.waitForSelector('#notices'); T.end();
    await page.click('.tab[data-tab=altro]'); await page.waitForSelector('#x-tools'); T.begin('vedere le proprie statistiche'); await T.tap('#x-tools .row:has-text("statistiche")'); T.screen(); T.end(); await T.audit('statistiche');
  });
  await session('staff', async (page, T) => {
    await page.goto(BASE); await page.fill('#code', 'ABCD2345'); await page.click('button.btn.pri'); await page.waitForSelector('.tab[data-tab=run]'); await T.audit('elenco Run (staff)');
    await page.locator('#view >> text=Giro dei Castelli').first().click(); await page.waitForSelector('#x-run-tools'); await T.audit('scheda Run (staff)');
    T.begin('check-in manuale di 4 partecipanti'); const tg = page.locator('.sheet.in .tg, .sheet.in [role=switch]'); const n = await tg.count(); for (let i = 0; i < Math.min(4, n); i++) await T.tap(`.sheet.in .list .row >> nth=${i + 0} >> [role=switch], .sheet.in .tg >> nth=${i}`).catch(() => { cur_dummy(); }); T.end();
    function cur_dummy() {}
    T.begin('check-in con QR (4 partecipanti)'); await T.tap('#x-run-tools .row:has-text("QR")'); T.screen(); await page.waitForSelector('#x-video'); for (let i = 2; i <= 5; i++) await page.evaluate(id => RB.scanHandle('RBK1:' + id), ID(i)); T.end(); await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    T.begin('esportare l\'elenco in Excel'); await T.tap('#x-run-tools .row:has-text("Excel")'); T.end();
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    T.begin('pubblicare un avviso'); await T.tap('.tab[data-tab=altro]'); T.screen(); await T.tap('#x-tools .row:has-text("Avvisi")'); T.screen(); await T.tap('#nt-new'); T.screen(); await T.type('#nt-t', 'Avviso di prova'); await T.tap('.sheet:has(#nt-t) .sb.r'); T.end(); await T.audit('avvisi'); await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    T.begin('importare Run da Excel (fino alla scelta file)'); await T.tap('#x-tools .row:has-text("Importa Run")'); T.screen(); await T.tap('#x-imp-pick', { trial: true }); T.end(); await T.audit('import Run'); await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    T.begin('aprire il modulo "nuovo Run"'); await page.click('.tab[data-tab=run]'); await page.evaluate(() => RB.runForm(null, {})); T.screen(); await page.waitForSelector('#rf-title'); const fields = await page.locator('.sheet.in input:visible, .sheet.in textarea:visible, .sheet.in select:visible').count(); const rows = await page.locator('.sheet.in .row:visible').count(); T.end(); Object.assign(result.tasks['aprire il modulo "nuovo Run"'], { fields, rows }); await T.audit('nuovo Run');
  });
  await browser.close(); fs.writeFileSync(path.join(__dirname, 'metrics.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result.tasks, null, 0).slice(0, 1800)); const agg = {}; Object.values(result.screens).forEach(v => Object.entries(v.cls).forEach(([k, n]) => { agg[k] = (agg[k] || 0) + n; })); result.smallTapAgg = agg; fs.writeFileSync(path.join(__dirname, 'metrics.json'), JSON.stringify(result, null, 1)); console.log('PICCOLI', JSON.stringify(Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 10)));
  console.log(Object.entries(result.screens).map(([k, v]) => `${k}: testi<14px ${v.small}/${v.texts}, <12px ${v.tiny}, tocchi<44px ${v.tapSmall}/${v.taps}, min ${Math.round(v.minTap)}`).join('\n'));
})().catch(e => { console.error('ERR', e.message.split('\n').slice(0, 5).join(' | ')); process.exit(1); });
