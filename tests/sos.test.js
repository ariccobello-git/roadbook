// Test SOS su matrice di dispositivi. Uso: node sos.test.js [nomeDispositivo|all]
// Variabili: BASE (default locale), ENGINE=native usa il motore vero del dispositivo (Safari/WebKit, Firefox) - serve su CI
const pw = require(process.env.PW || 'playwright');
const fs = require('fs'), assert = require('assert');
const BASE = process.env.BASE || 'http://127.0.0.1:8123/';
const NATIVE = process.env.ENGINE === 'native';
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const ID = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const DEVICES = {
  'Pixel 7': 'Android telefono', 'Galaxy S9+': 'Android telefono grande', 'Galaxy Tab S4': 'Android tablet',
  'iPhone 14': 'iPhone', 'iPhone SE': 'iPhone piccolo (320 px)', 'iPad (gen 7)': 'iPad', 'iPad Pro 11': 'iPad Pro',
  'Desktop Chrome': 'PC / Mac Chrome', 'Desktop Safari': 'Mac Safari', 'Desktop Firefox': 'PC Firefox', 'Desktop Edge': 'PC Edge'
};

function mk(level) {
  const members = [['Marco', 'Bianchi'], ['Mario', 'Rossi'], ['Anna', 'Conti'], ['Luca', 'Gialli']].map((n, i) => ({ id: ID(i + 1), first_name: n[0], last_name: n[1], title: i === 0 ? 'presidente' : 'socio', active: true, bike: 'Road King', has_photo: false, phone: '3331112233', email: 'a@b.it', joined_on: '2022-01-01' }));
  const d = new Date(); d.setHours(9, 0, 0, 0);
  const run = { id: ID(50), title: 'Giro dei Castelli', run_date: d.toISOString(), days: 1, status: 'programmato', fee: '0', rooms: [], extras: [], installments: [], stops: [], meeting_point: 'Ostia', destination: 'Frascati', nav_tool: 'both' };
  const signups = [1, 2, 3].map(i => ({ run_id: run.id, member_id: ID(i + 1), status: 'si', passengers: 0, checked_in: false }));
  const perms = level === 'mgr' ? ['members_view', 'phones_view', 'personal_view', 'emergency_manage'] : ['members_view'];
  return { me: { id: ID(level === 'mgr' ? 1 : 2), first_name: level === 'mgr' ? 'Marco' : 'Mario', last_name: level === 'mgr' ? 'Bianchi' : 'Rossi', title: level === 'mgr' ? 'presidente' : 'socio', perms },
    profiles: [], members, runs: [run], signups, payments: [], settings: { chapter: { name: 'Roma Chapter' } }, weather: {}, reports: [] };
}

function backend(page, level, log, flags) {
  const st = mk(level); st.sos = { id: ID(900), status: 'open', notes: [] };
  page.route('**/rest/v1/rpc/**', async route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    log.push({ fn, body });
    let out = { ok: true };
    if (fn === 'rc_login') out = body.p_code === 'ABCD2345' ? { ok: true, me: st.me } : { ok: false, error: 'auth' };
    else if (fn === 'rc_sync') out = Object.assign({ ok: true, server_time: new Date().toISOString() }, st);
    else if (fn === 'rc_emergency_get') out = { ok: true, profile: null, consent: false };
    else if (fn === 'rc_photos') out = { ok: true, photos: {} };
    else if (fn === 'rc_weather_refresh' || fn === 'rc_weather_get') out = { ok: true, weather: null };
    else if (fn === 'rc_sos_suggest') out = { ok: true, items: /ros/i.test(body.p_q) ? [{ id: ID(2), name: 'Mario Rossi' }] : [] };
    else if (fn === 'rc_sos_send') {
      if (flags.offline) { await route.abort('failed'); return; }
      out = { ok: true, id: ID(901), verified: !!body.p_code, identified: !!body.p_member || !!body.p_code };
    }
    else if (fn === 'rc_sos_poll') out = { ok: true, open: st.sos.status === 'closed' ? 0 : 1, last_id: st.sos.id, last_at: new Date().toISOString() };
    else if (fn === 'rc_sos_list') out = { ok: true, items: [{ id: st.sos.id, created_at: new Date().toISOString(), kind: 'moto', status: st.sos.status, verified: true, has_voice: true, name: 'Mario Rossi', run: 'Giro dei Castelli', lat: 41.9, lng: 12.5, handled_by: null, closed_at: null }] };
    else if (fn === 'rc_sos_get') out = { ok: true, id: st.sos.id, kind: 'moto', status: st.sos.status, verified: true, created_at: new Date().toISOString(), voice: 'AAAA', voice_mime: 'audio/mp4', voice_ms: 5000,
      data: { reporter: { member: { name: 'Mario Rossi', phone: '3331112233', bike: 'Street Glide', tessera: '123' }, emergency: { blood: 'A+', allergies: 'Penicillina', meds: '', conditions: '', contact_name: 'Giulia', contact_phone: '3330001111', contact_rel: 'moglie', roadside: 'aci', plate: 'AB123CD' }, run: { title: 'Giro dei Castelli', date: new Date().toISOString(), meeting: 'Ostia', destination: 'Frascati' }, signup: { status: 'si', passengers: 1, checked_in: true } }, lat: 41.9, lng: 12.5, acc: 20, note: 'Guasto', notes: st.sos.notes } };
    else if (fn === 'rc_sos_set') { st.sos.status = body.p_status; if (body.p_note) st.sos.notes.push({ at: new Date().toISOString(), by: 'Marco Bianchi', status: body.p_status, text: body.p_note }); }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out), headers: { 'access-control-allow-origin': '*' } });
  });
  return st;
}

const STUB = `
(function(){
  window.__calls=[];
  function MR(stream,opt){this.state='inactive';this.mimeType=(opt&&opt.mimeType)||'audio/mp4';this.stream=stream;}
  MR.prototype.start=function(){this.state='recording';};
  MR.prototype.stop=function(){var s=this;this.state='inactive';setTimeout(function(){if(s.ondataavailable)s.ondataavailable({data:new Blob([new Uint8Array(2000)],{type:s.mimeType})});if(s.onstop)s.onstop();},10);};
  MR.isTypeSupported=function(){return true;};
  window.MediaRecorder=MR;
  if(!navigator.mediaDevices)Object.defineProperty(navigator,'mediaDevices',{value:{}});
  navigator.mediaDevices.getUserMedia=function(){return Promise.resolve({getTracks:function(){return [{stop:function(){}}];}});};
})();`;

async function run(devName) {
  const base = pw.devices[devName] || {};
  const opts = Object.assign({}, base);
  let engine = pw.chromium;
  if (NATIVE) { const bn = base.defaultBrowserType || (/Safari/.test(devName) ? 'webkit' : /Firefox/.test(devName) ? 'firefox' : 'chromium'); engine = pw[bn]; }
  else { delete opts.defaultBrowserType; }
  const launch = NATIVE ? {} : { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] };
  const browser = await engine.launch(launch);
  const errors = [], res = [];
  const ok = n => res.push(n);
  async function ctxFor(level, flags) {
    const ctx = await browser.newContext(Object.assign({}, opts, { locale: 'it-IT', timezoneId: 'Europe/Rome', geolocation: { latitude: 41.9, longitude: 12.5, accuracy: 25 }, permissions: ['geolocation'].concat(NATIVE && engine === pw.chromium ? ['microphone'] : []) }));
    const page = await ctx.newPage(); const log = [];
    page.on('pageerror', e => errors.push(devName + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) errors.push(devName + ' console: ' + m.text()); });
    await page.addInitScript(STUB);
    await page.route('**/cdnjs.cloudflare.com/**/xlsx.full.min.js', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync('./node_modules/xlsx/dist/xlsx.full.min.js') }));
    const st = backend(page, level, log, flags);
    return { ctx, page, log, st };
  }
  async function noOverflow(page, label) {
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert(w.sw <= w.cw + 1, `${devName} ${label}: scroll orizzontale ${w.sw}>${w.cw}`);
  }
  async function tapSize(page, sel, label) {
    const b = await page.locator(sel).first().boundingBox();
    assert(b && b.height >= 40 && b.width >= 40, `${devName} ${label}: area tocco piccola ${JSON.stringify(b)}`);
  }

  /* A. segnalazione pubblica (senza accesso) con suggerimento e posizione */
  let { ctx, page, log, st } = await ctxFor('socio', {});
  await page.goto(BASE); await page.waitForSelector('#sos-public');
  await tapSize(page, '#sos-public', 'pulsante SOS login'); await noOverflow(page, 'login');
  await page.click('#sos-public'); await page.waitForSelector('#sos-nm');
  await page.fill('#sos-nm', 'Mario Rosi'); await page.waitForSelector('#sos-sug .row');
  assert((await page.locator('#sos-sug .row').first().innerText()).includes('Mario Rossi'));
  await page.locator('#sos-sug .row').first().click(); assert.equal(await page.inputValue('#sos-nm'), 'Mario Rossi'); ok('A1 suggerimento nome');
  await page.click('#sos-next'); await page.waitForSelector('.sos-kind');
  assert.equal(await page.locator('.sos-kind').count(), 3);
  await page.click('.sos-kind[data-k="moto"]'); await page.waitForSelector('#sos-send');
  const hrefs = await page.locator('#sos-calls a').evaluateAll(a => a.map(x => x.getAttribute('href')));
  assert.deepEqual(hrefs, ['tel:112', 'tel:803116', 'tel:+39800427539'], devName + ' numeri: ' + hrefs);
  const url0 = page.url(); await page.waitForTimeout(500); assert.equal(page.url(), url0, 'nessuna chiamata automatica'); ok('A2 numeri solo con tocco');
  await page.waitForFunction(() => /Rilevata/.test(document.body.innerText), null, { timeout: 8000 }); ok('A3 posizione automatica');
  await noOverflow(page, 'sos main'); await tapSize(page, '#sos-send', 'invia');
  await page.click('#sos-send'); await page.waitForSelector('#sos-done');
  const sent = log.find(l => l.fn === 'rc_sos_send').body;
  assert.equal(sent.p_code, null); assert.equal(sent.p_member, ID(2)); assert.equal(sent.p_kind, 'moto'); assert(Math.abs(sent.p_lat - 41.9) < 0.01); ok('A4 invio pubblico con dati');
  await ctx.close();

  /* B. senza rete: coda e invio al ritorno */
  const flags = { offline: true };
  ({ ctx, page, log, st } = await ctxFor('socio', flags));
  await page.goto(BASE); await page.waitForSelector('#sos-public'); await page.click('#sos-public'); await page.fill('#sos-nm', 'Giovanni Verdi'); await page.click('#sos-next');
  await page.click('.sos-kind[data-k="salute_mia"]'); await page.click('#sos-send'); await page.waitForSelector('#sos-done.q');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('rb.sosq'))).length, 1);
  assert(await page.locator('#sos-calls a').count() >= 1); ok('B1 coda offline + numeri sempre visibili');
  flags.offline = false; await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rb.sosq') || '[]').length === 0, null, { timeout: 8000 }); ok('B2 invio dalla coda');
  await ctx.close();

  /* C. socio con accesso: partecipante + vocale */
  ({ ctx, page, log, st } = await ctxFor('socio', {}));
  await page.goto(BASE); await page.fill('#code', 'ABCD2345'); await page.click('button.btn.pri'); await page.waitForSelector('#sos-btn');
  await tapSize(page, '#sos-btn', 'SOS in app'); await noOverflow(page, 'home');
  await page.click('#sos-btn'); await page.waitForSelector('.sos-kind'); await page.click('.sos-kind[data-k="salute_altro"]');
  await page.waitForSelector('#sos-parts .row'); assert((await page.locator('#sos-parts .row').count()) >= 1);
  await page.locator('#sos-parts .row').first().click(); await page.waitForSelector('#sos-rec');
  await page.click('#sos-rec'); await page.waitForTimeout(150); await page.click('#sos-rec'); await page.waitForFunction(() => /Vocale pronto/.test(document.body.innerText), null, { timeout: 5000 });
  await page.click('#sos-send'); await page.waitForSelector('#sos-done');
  const s2 = log.find(l => l.fn === 'rc_sos_send').body;
  assert.equal(s2.p_code, 'ABCD2345'); assert.equal(s2.p_kind, 'salute_altro'); assert(s2.p_subject); assert(s2.p_voice && s2.p_voice.length > 100 && s2.p_ms <= 31000); ok('C1 salute altro + vocale + dati autenticati');
  await ctx.close();

  /* D. gestione: banner, lista, scheda, stato, export */
  ({ ctx, page, log, st } = await ctxFor('mgr', {}));
  await page.goto(BASE); await page.fill('#code', 'ABCD2345'); await page.click('button.btn.pri'); await page.waitForSelector('#sos-alert', { timeout: 8000 }); ok('D1 banner emergenza aperta');
  await page.click('#sos-alert'); await page.waitForSelector('.sheet.in .row'); await page.locator('.sheet.in .row').first().click(); await page.waitForSelector('#sos-brief');
  const tel = await page.locator('.sheet.in a[href^="tel:"]').evaluateAll(a => a.map(x => x.getAttribute('href'))); assert(tel.includes('tel:3331112233') && tel.includes('tel:3330001111')); ok('D2 scheda con chiamate a tocco');
  await noOverflow(page, 'scheda');
  await page.locator('#sos-actions .row', { hasText: 'Prendo in carico' }).click(); await page.waitForFunction(() => /In gestione/.test(document.body.innerText), null, { timeout: 5000 }); ok('D3 presa in carico');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('#sos-actions .row', { hasText: 'Word' }).click()]);
  assert(/\.doc$/.test(dl.suggestedFilename())); ok('D4 export Word');
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('#sos-actions .row', { hasText: 'PDF' }).click()]);
  const pth = await dl2.path(); assert(fs.readFileSync(pth).slice(0, 4).toString() === '%PDF'); ok('D5 export PDF valido');
  await page.locator('#sos-actions .row', { hasText: 'Chiudi emergenza' }).click(); await page.fill('#sos-cn', 'Risolto'); await page.locator('.sheet:has(#sos-cn) .sb.r').click();
  await page.waitForFunction(() => /Chiusa/.test(document.body.innerText), null, { timeout: 5000 }); ok('D6 chiusura con nota');
  await ctx.close(); await browser.close();
  return { res, errors };
}

(async () => {
  const arg = process.argv[2] || 'all';
  const list = arg === 'all' ? Object.keys(DEVICES).filter(d => NATIVE || !/Safari|Firefox|Edge/.test(d)) : [arg];
  let fail = 0; const rows = [];
  for (const d of list) {
    try { const { res, errors } = await run(d); if (errors.length) { fail++; rows.push(`FAIL  ${d}: errori console\n   ` + errors.slice(0, 3).join('\n   ')); } else rows.push(`OK    ${d} (${DEVICES[d] || ''}): ${res.length} controlli`); }
    catch (e) { fail++; rows.push(`FAIL  ${d}: ${String(e.message).split('\n').slice(0,6).join(' | ')}`); }
  }
  console.log(rows.join('\n')); console.log(fail ? `PROBLEMI ${fail}` : 'TUTTI OK'); process.exit(fail ? 1 : 0);
})();
