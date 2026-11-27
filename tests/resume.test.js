// Ritorno dallo sfondo e apertura con rete debole (schermo bianco su iPhone). Uso: node resume.test.js [nomeDispositivo|all]
// Variabili: ENGINE=native usa il motore vero del dispositivo (Safari/WebKit su iPhone) - serve su CI
const pw = require(process.env.PW || 'playwright');
const assert = require('assert');
const http = require('http'), fs = require('fs'), path = require('path');
const NATIVE = process.env.ENGINE === 'native';
const ROOT = path.join(__dirname, '..');
const DEVICES = { 'iPhone 14': 'iPhone', 'Pixel 7': 'Android telefono', 'Desktop Chrome': 'PC / Mac Chrome' };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const ID = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

/* server dell'app con "rete debole" (risposte in ritardo) e "rete assente" (connessione chiusa) */
const net = { slow: 0, down: false };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, out) => {
      if (net.down) { req.socket.destroy(); return; }
      const u = decodeURIComponent(req.url.split('?')[0]), f = path.join(ROOT, u === '/' ? 'index.html' : u);
      setTimeout(() => fs.readFile(f, (e, b) => {
        if (e || !f.startsWith(ROOT)) { out.writeHead(404); out.end(); return; }
        out.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); out.end(b);
      }), net.slow);
    });
    srv.listen(0, 'localhost', () => res(srv));
  });
}

function backend(ctx) {
  const me = { id: ID(1), first_name: 'Mario', last_name: 'Rossi', title: 'socio', active: true, perms: ['members_view'] };
  const run = { id: ID(50), title: 'Giro dei Castelli', run_date: new Date(Date.now() + 3 * 86400000).toISOString(), days: 1, status: 'programmato', fee: '0', rooms: [], extras: [], installments: [], stops: [], meeting_point: 'Piazzale Ostiense', destination: 'Frascati', nav_tool: 'google', difficulty: 'media', day_starts: {}, formation: [], formation_published: false };
  const st = { me, profiles: [], members: [Object.assign({ has_photo: false, phone: '3331112233' }, me)], runs: [run], signups: [], payments: [], settings: { chapter: { name: 'Roma Chapter' } }, weather: {}, reports: [], acks: [], halts: [], lost: [] };
  return ctx.route('**/rest/v1/rpc/**', route => {
    const fn = route.request().url().split('/rpc/')[1], body = JSON.parse(route.request().postData() || '{}');
    let out = { ok: true };
    if (fn === 'rc_login') out = body.p_code === 'ABCD2345' ? { ok: true, me } : { ok: false, error: 'auth' };
    else if (fn === 'rc_sync') out = Object.assign({ ok: true, server_time: new Date().toISOString() }, JSON.parse(JSON.stringify(st)));
    else if (fn === 'rc_photos') out = { ok: true, photos: {} };
    else if (fn === 'rc_sos_poll') out = { ok: true, open: 0 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out), headers: { 'access-control-allow-origin': '*' } });
  });
}

/* simula l'uscita e il ritorno dell'app; "min" sono i minuti passati in secondo piano */
const away = (page, min) => page.evaluate(m => {
  const set = v => Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });
  set(true); document.dispatchEvent(new Event('visibilitychange'));
  const now = Date.now.bind(Date), skip = m * 60000; Date.now = () => now() + skip;
  set(false); document.dispatchEvent(new Event('visibilitychange'));
}, min);

async function run(devName, base) {
  const dev = pw.devices[devName] || {}, opts = Object.assign({}, dev);
  let engine = pw.chromium;
  if (NATIVE) engine = pw[dev.defaultBrowserType || 'chromium']; else delete opts.defaultBrowserType;
  const browser = await engine.launch(NATIVE ? {} : { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  /* parte 1 senza service worker: in WebKit le richieste passate dal service worker sfuggono al finto server dei dati */
  const ctx = await browser.newContext(Object.assign({}, opts, { locale: 'it-IT', timezoneId: 'Europe/Rome', serviceWorkers: 'block' }));
  await backend(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('rb.tour', '1'); localStorage.setItem('rb.hint', '1'); } catch (e) {} });
  let page = await ctx.newPage(); const errors = [], res = [], ok = n => res.push(n);
  page.on('pageerror', e => errors.push(devName + ' pageerror: ' + e.message));
  const mark = () => page.evaluate(() => { window.__same = 1; window.__v = document.getElementById('view'); });
  const rebuilt = () => page.evaluate(() => window.__v !== document.getElementById('view'));
  const same = () => page.evaluate(() => window.__same === 1);
  try {
    await page.goto(base); await page.fill('#code', 'ABCD2345'); await page.click('button.btn.pri'); await page.waitForSelector('.run, #nx');
    assert(await page.evaluate(() => /5\.3\.1/.test(document.body.innerText) || window.RB.RELEASE === '5.3.1'), 'release 5.3.1'); ok('R0 release 5.3.1');

    /* A. pausa breve: niente ricostruzione, niente ricarica */
    await mark(); await away(page, 1); await page.waitForTimeout(3000);
    assert(await same(), 'A pausa breve: pagina ricaricata');
    assert(!(await rebuilt()), 'A pausa breve: schermata ricostruita'); ok('A pausa breve: resta com\'è');

    /* B. pausa lunga (5 min): la schermata si ricostruisce, senza ricaricare, e il contenuto c'è */
    await mark(); await away(page, 5); await page.waitForTimeout(3000);
    assert(await same(), 'B pausa lunga: pagina ricaricata');
    assert(await rebuilt(), 'B pausa lunga: schermata non ricostruita');
    assert(await page.locator('.run, #nx').count() > 0, 'B pausa lunga: contenuto sparito'); ok('B pausa lunga: schermata ridisegnata');

    /* C. app vuota al ritorno: si ricarica e riprende con il codice salvato */
    await page.evaluate(() => { document.getElementById('app').innerHTML = ''; });
    await Promise.all([page.waitForEvent('load'), away(page, 0)]);
    await page.waitForSelector('.run, #nx', { timeout: 8000 }); ok('C app vuota: ricarica e riprende');

    /* parte 2 con service worker: sessione salvata, si apre la pagina d'accesso con «Continua come» (non servono dati dal server) */
    const ctx2 = await browser.newContext(Object.assign({}, opts, { locale: 'it-IT', timezoneId: 'Europe/Rome' }));
    await ctx2.addInitScript(() => { try { localStorage.setItem('rb.code', 'ABCD2345'); localStorage.setItem('rb.cache', JSON.stringify({ ok: true, me: { first_name: 'Mario', last_name: 'Rossi' } })); } catch (e) {} });
    page = await ctx2.newPage(); page.on('pageerror', e => errors.push(devName + ' pageerror: ' + e.message));
    await page.goto(base); await page.waitForSelector('#resume');

    /* D. rete debole (10 s): l'app si apre dalla copia salvata entro pochi secondi */
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 });
    net.slow = 10000; let t0 = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }); await page.waitForSelector('#resume', { timeout: 9000 });
    const dt = Date.now() - t0; net.slow = 0;
    assert(dt < 8000, 'D rete debole: apertura in ' + dt + ' ms'); ok('D rete debole: aperta in ' + (dt / 1000).toFixed(1) + ' s');

    /* E. rete assente: l'app si apre lo stesso */
    net.down = true; t0 = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#resume', { timeout: 8000 });
    net.down = false; ok('E senza rete: aperta in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');

    /* F. rete buona: arriva la versione nuova del file, non la copia */
    await page.evaluate(() => fetch('ui.js', { cache: 'no-store' }).then(r => r.text())).then(t => assert(t.includes("RB.RELEASE = '5.3.1'"), 'F file non aggiornato'));
    ok('F rete buona: file dalla rete');

    assert.deepStrictEqual(errors, [], errors.join('\n'));
  } finally { net.slow = 0; net.down = false; await browser.close(); }
  return res;
}

(async () => {
  const arg = process.argv[2] || 'iPhone 14', list = arg === 'all' ? Object.keys(DEVICES) : [arg];
  const srv = await serve(), base = 'http://localhost:' + srv.address().port + '/';
  let fail = 0;
  for (const d of list) {
    try { const r = await run(d, base); console.log('✓ ' + d + ' (' + DEVICES[d] + '): ' + r.join(' · ')); }
    catch (e) { fail++; console.log('✗ ' + d + ': ' + e.message); }
  }
  srv.close();
  process.exit(fail ? 1 : 0);
})();
