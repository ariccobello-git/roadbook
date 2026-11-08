// Test pagamenti: tesoriere (stato, ritardi, registrazione, rimborsi, spese, giornale) e socio (stato, distinta PDF). Uso: node pay.test.js [dispositivo|all]
const pw = require(process.env.PW || 'playwright');
const assert = require('assert'), fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8123/';
const NATIVE = process.env.ENGINE === 'native';
const ID = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const DAY = 86400000, iso = off => new Date(Date.now() + off * DAY).toISOString(), ymd = off => iso(off).slice(0, 10);
const DEVICES = ['Pixel 7', 'iPhone 14', 'iPad (gen 7)', 'Desktop Chrome'];
const PDF = Buffer.from('%PDF-1.4\n' + 'x'.repeat(300) + '\n%%EOF');

function mk(who) {
  const names = [['Simona', 'Vitale'], ['Mario', 'Rossi'], ['Anna', 'Conti'], ['Luca', 'Gialli'], ['Rita', 'Neri']];
  const members = names.map((n, i) => ({ id: ID(i + 1), first_name: n[0], last_name: n[1], title: i === 0 ? 'tesoriere' : 'socio', active: true, bike: 'Road King', phone: '333111220' + i, email: 'a@b.it', joined_on: '2022-01-01' }));
  const run = { id: ID(50), title: 'Grand Tour', run_date: iso(10), days: 5, status: 'programmato', fee: '0', rooms: [{ id: 'd', name: 'Doppia', price: '1000' }], extras: [], installments: [{ due_on: ymd(-30), pct: 50 }, { due_on: ymd(-10), pct: 50 }], stops: [], meeting_point: 'Roma', destination: 'Lisbona', km: 100, difficulty: 'media', nav_tool: 'both' };
  const signups = [[2, 'si', 0], [3, 'si', 1], [4, 'si', 0], [5, 'no', 0]].map(x => ({ run_id: run.id, member_id: ID(x[0]), status: x[1], passengers: x[2], room: 'd', checked_in: false }));
  const perms = who === 'tes' ? ['members_view', 'phones_view', 'personal_view', 'reports_view', 'payments_manage'] : ['members_view'];
  const me = who === 'tes' ? members[0] : members[2];
  return { me: Object.assign({}, me, { perms }), profiles: [], members, runs: [run], signups, payments: [], settings: { chapter: { name: 'Roma Chapter' }, payment_info: { methods: ['contanti', 'bonifico'], iban: 'IT00X0000000000000000000000' } }, weather: {}, reports: [] };
}

function backend(page, who, log) {
  const st = mk(who), pays = [{ id: 'p1', run_id: ID(50), member_id: ID(2), amount: 1000, paid_on: ymd(-29), method: 'bonifico', note: null }, { id: 'p2', run_id: ID(50), member_id: ID(5), amount: 500, paid_on: ymd(-29), method: 'contanti', note: null }];
  const rcs = [{ run_id: ID(50), member_id: ID(4), name: 'distinta.pdf', size: 400, uploaded_at: iso(-2) }], exps = [];
  page.route('**/rest/v1/rpc/**', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    log.push({ fn, body });
    let out = { ok: true };
    if (fn === 'rc_login') out = { ok: true, me: st.me };
    else if (fn === 'rc_sync') out = Object.assign({ ok: true, server_time: new Date().toISOString() }, st);
    else if (fn === 'rc_pay_list') out = { ok: true, payments: who === 'tes' ? pays : pays.filter(p => p.member_id === st.me.id), receipts: who === 'tes' ? rcs : rcs.filter(r => r.member_id === st.me.id), expenses: who === 'tes' ? exps : [] };
    else if (fn === 'rc_pay_save') pays.push({ id: 'n' + pays.length, run_id: body.p_run, member_id: body.p_member, amount: body.p_amount, paid_on: body.p_paid_on, method: body.p_method, note: body.p_note || null });
    else if (fn === 'rc_exp_save') exps.push({ id: 'e' + exps.length, run_id: body.p_run, label: body.p_label, amount: body.p_amount, paid_on: body.p_paid_on, note: null });
    else if (fn === 'rc_receipt_save') rcs.push({ run_id: body.p_run, member_id: st.me.id, name: body.p_name, size: body.p_data.length, uploaded_at: iso(0) });
    else if (fn === 'rc_sos_poll') out = { ok: true, open: 0 };
    else if (fn === 'rc_photos') out = { ok: true, photos: {} };
    else if (fn === 'rc_emergency_get') out = { ok: true, profile: null, consent: false };
    else if (fn === 'rc_weather_refresh' || fn === 'rc_weather_get') out = { ok: true, weather: null };
    else if (fn === 'rc_notice_list') out = { ok: true, items: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out), headers: { 'access-control-allow-origin': '*' } });
  });
  return st;
}

async function run(devName) {
  const base = pw.devices[devName] || {}, opts = Object.assign({}, base);
  let engine = pw.chromium;
  if (NATIVE) { const bn = base.defaultBrowserType || 'chromium'; engine = pw[bn]; } else delete opts.defaultBrowserType;
  const browser = await engine.launch(NATIVE ? {} : { executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [], res = [], ok = n => res.push(n);
  async function open(who) {
    const log = [], ctx = await browser.newContext(Object.assign({}, opts, { locale: 'it-IT', timezoneId: 'Europe/Rome', acceptDownloads: true }));
    const page = await ctx.newPage(); await page.addInitScript(() => { try { localStorage.setItem('rb.tour', '1'); } catch (e) {} });
    page.on('pageerror', e => errors.push(devName + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) errors.push(devName + ' console: ' + m.text()); });
    await page.route('**/cdnjs.cloudflare.com/**/xlsx.full.min.js', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js')) }));
    backend(page, who, log);
    await page.goto(BASE); await page.fill('#code', 'ABCD2345'); await page.click('button.btn.pri'); await page.waitForSelector('.tab[data-tab=run]');
    return { ctx, page, log };
  }

  /* ---- tesoriere ---- */
  let { ctx, page, log } = await open('tes');
  await page.click('.tab[data-tab=quote]'); await page.waitForSelector('#pay-kpis');
  const kp = await page.textContent('#pay-kpis'); assert(/1\.000,00|1000,00/.test(kp.replace(/\s/g, '')) && /3\.000|3000/.test(kp.replace(/\s/g, '')), 'incassato 1000, da incassare 3000: ' + kp);
  assert((await page.textContent('.banner.er')).includes('Grand Tour'), 'alert ritardo');
  await page.waitForSelector('#pay-aging'); ok('tesoriere: riepilogo, alert, fasce');
  assert((await page.textContent('#pay-refunds')).includes('Neri'), 'rimborso Rita (ha versato ma non partecipa)'); ok('rimborso da fare');
  await page.click('#pay-runs .row'); await page.waitForSelector('#pay-run');
  const rows = await page.textContent('#pay-run'); assert(rows.includes('Conti') && rows.includes('Gialli') && rows.includes('Rossi'), 'elenco soci'); assert(rows.includes('Pagato'), 'Rossi pagato');
  await page.click('#pay-run .pay-filter button[data-v=late]').catch(async () => { await page.click('#pay-run button:has-text("In ritardo")'); });
  assert(!(await page.textContent('#pay-run .list')).includes('Rossi'), 'filtro ritardi'); ok('elenco Run e filtro');
  await page.click('#pay-run button:has-text("Tutti")');
  await page.click('#pay-run .row:has-text("Conti")'); await page.waitForSelector('#pay-member');
  assert((await page.textContent('#pay-member')).includes('2.000') || (await page.textContent('#pay-member')).replace(/\s|\./g, '').includes('2000'), 'dovuto Conti 2000 (camera x2)');
  assert(await page.isVisible('#pay-remind'), 'sollecito WhatsApp');
  await page.fill('#pay-amt', '0'); await page.click('#pay-save'); await page.waitForTimeout(250); assert(!log.some(l => l.fn === 'rc_pay_save'), 'importo 0 non salva');
  await page.fill('#pay-amt', '700'); await page.click('#pay-save'); await page.waitForTimeout(500);
  const sv = log.find(l => l.fn === 'rc_pay_save'); assert(sv && sv.body.p_amount === 700 && sv.body.p_member === ID(3) && sv.body.p_method === 'bonifico', JSON.stringify(sv && sv.body)); ok('registra versamento');
  await ctx.close();

  /* ---- tesoriere: spese e giornale ---- */
  ({ ctx, page, log } = await open('tes'));
  await page.click('.tab[data-tab=quote]'); await page.waitForSelector('#pay-runs .row'); await page.click('#pay-runs .row'); await page.waitForSelector('#pay-exp-open');
  await page.click('#pay-exp-open'); await page.waitForSelector('#pay-exps');
  await page.fill('#ex-label', 'Acconto hotel'); await page.fill('#ex-amt', '1200'); await page.click('#ex-save'); await page.waitForTimeout(500);
  const ex = log.find(l => l.fn === 'rc_exp_save'); assert(ex && ex.body.p_amount === 1200 && ex.body.p_label === 'Acconto hotel', JSON.stringify(ex && ex.body));
  assert((await page.textContent('#pay-exps')).includes('Acconto hotel'), 'spesa in elenco'); ok('spese e margine');
  await ctx.close();
  ({ ctx, page, log } = await open('tes'));
  await page.click('.tab[data-tab=quote]'); await page.waitForSelector('#pay-ledger-open'); await page.click('#pay-ledger-open'); await page.waitForSelector('#pay-ledger');
  const lg = await page.textContent('#pay-ledger'); assert(lg.includes('Rossi') && lg.includes('Neri'), 'giornale'); 
  const dl = page.waitForEvent('download', { timeout: 8000 }); await page.click('#pay-ledger-xls'); await dl; ok('giornale di cassa + Excel');
  /* dashboard (Report) con riquadro Economia */
  await ctx.close();
  ({ ctx, page, log } = await open('tes'));
  await page.click('.tab[data-tab=report]'); await page.waitForSelector('#dash-pay'); ok('riquadro Economia nella dashboard');
  await ctx.close();

  /* ---- socio: stato e distinta ---- */
  ({ ctx, page, log } = await open('soc'));
  await page.click('.tab[data-tab=quote]'); await page.waitForSelector('.pay-status');
  assert(!(await page.locator('#pay-kpis').count()), 'il socio non vede gli incassi');
  const stx = await page.textContent('.pay-status'); assert(stx.includes('In ritardo') && stx.includes('2.000'.replace('.', '')) || /2\.?000/.test(stx), 'stato in ritardo: ' + stx); ok('socio: stato');
  await page.waitForSelector('[id^=pay-add-]'); await page.setInputFiles('input[type=file][id^=pay-file-]', { name: 'distinta.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.waitForTimeout(600); const rs = log.find(l => l.fn === 'rc_receipt_save'); assert(rs && /^JVBER/.test(rs.body.p_data) && rs.body.p_name === 'distinta.pdf', JSON.stringify(rs && rs.body).slice(0, 200));
  await page.waitForSelector('text=Distinta allegata'); ok('socio: allega distinta PDF');
  await ctx.close();
  await browser.close();
  return { res, errors };
}

(async () => {
  const arg = process.argv[2] || 'all', list = arg === 'all' ? DEVICES : [arg]; let bad = 0;
  for (const d of list) {
    try { const r = await run(d); if (r.errors.length) { bad++; console.log('FAIL ', d, r.errors.join(' | ')); } else console.log('OK   ', d + ':', r.res.length, 'controlli'); }
    catch (e) { bad++; console.log('FAIL ', d + ':', String(e.message || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)); }
  }
  console.log(bad ? 'PROBLEMI ' + bad : 'TUTTI OK'); process.exit(bad ? 1 : 0);
})();
