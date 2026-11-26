/* Roadbook · dati: chiamate al database, sessione, sincronizzazione automatica */
(function () {
  'use strict';
  var RB = window.RB = window.RB || {};
  var URL_ = 'https://qaffjgvnexaditlovwea.supabase.co/rest/v1/rpc/';
  var KEY = 'sb_publishable_r4XO0rNOCaUg19TW9-ULUg_kZDBcjUU';
  var listeners = {};

  RB.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
  function emit(ev, a) { (listeners[ev] || []).forEach(function (f) { try { f(a); } catch (e) { if (window.console) console.error(e); } }); }

  RB.S = { code: null, me: null, d: null, photos: {}, photosAt: 0, photosSig: '', online: true, lastSync: 0 };

  RB.rpc = function (fn, args) {
    return fetch(URL_ + fn, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }, function () { return { ok: r.ok, j: null }; }); })
      .then(function (x) {
        if (!x.ok || !x.j || typeof x.j !== 'object') return { ok: false, error: 'server' };
        return x.j;
      }, function () { return { ok: false, error: 'network' }; });
  };

  /* funzioni sul server (Edge Functions), es. apertura dei link brevi di Google Maps */
  RB.fn = function (name, body) {
    return fetch(URL_.replace('/rest/v1/rpc/', '/functions/v1/') + name, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return null; }); }, function () { return { ok: false, error: 'network' }; })
      .then(function (j) { return j && typeof j === 'object' ? j : { ok: false, error: 'server' }; });
  };

  /* ---- sessione ---- */
  RB.normCode = function (s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  RB.login = function (code) {
    var c = RB.normCode(code);
    if (c.length < 8) return Promise.resolve({ ok: false, error: 'auth' });
    return RB.rpc('rc_login', { p_code: c }).then(function (r) {
      if (r.ok) { RB.S.code = c; try { localStorage.setItem('rb.code', c); } catch (e) {} }
      return r;
    });
  };
  RB.logout = function (why) {
    RB.S.code = null; RB.S.me = null; RB.S.d = null; RB.S.photos = {}; RB.S.photosSig = '';
    try { localStorage.removeItem('rb.code'); localStorage.removeItem('rb.cache'); } catch (e) {}
    emit('logout', why || '');
  };
  RB.restore = function () {
    var c = null, d = null;
    try { c = localStorage.getItem('rb.code'); d = JSON.parse(localStorage.getItem('rb.cache') || 'null'); } catch (e) {}
    if (!c) return false;
    RB.S.code = c;
    if (d && d.ok) { RB.S.d = d; RB.S.me = d.me; }
    return true;
  };

  /* ---- sincronizzazione ---- */
  var inflight = null, timer = null;
  RB.sync = function () {
    if (!RB.S.code) return Promise.resolve(null);
    if (inflight) return inflight;
    inflight = RB.rpc('rc_sync', { p_code: RB.S.code }).then(function (r) {
      inflight = null;
      if (r.ok) {
        RB.S.d = r; RB.S.me = r.me; RB.S.lastSync = Date.now();
        var was = RB.S.online; RB.S.online = true;
        try { localStorage.setItem('rb.cache', JSON.stringify(r)); } catch (e) {}
        emit('data', r); if (!was) emit('online', true);
        syncPhotos(false);
      } else if (r.error === 'auth') {
        RB.logout('expired');
      } else {
        if (RB.S.online) { RB.S.online = false; emit('online', false); }
      }
      return r;
    });
    return inflight;
  };
  function syncPhotos(force) {
    var d = RB.S.d; if (!d || !RB.S.code) return;
    var sig = d.members.filter(function (m) { return m.has_photo; }).map(function (m) { return m.id; }).sort().join(',');
    if (!force && sig === RB.S.photosSig && Date.now() - RB.S.photosAt < 180000) return;
    RB.S.photosSig = sig; RB.S.photosAt = Date.now();
    if (!sig) { RB.S.photos = {}; emit('photos'); return; }
    RB.rpc('rc_photos', { p_code: RB.S.code }).then(function (r) { if (r.ok) { RB.S.photos = r.photos || {}; emit('photos'); } });
  }
  RB.refreshPhotos = function () { syncPhotos(true); };
  RB.startSync = function () {
    RB.stopSync();
    timer = setInterval(function () { if (!document.hidden) RB.sync(); }, 20000);
  };
  RB.stopSync = function () { if (timer) clearInterval(timer); timer = null; };
  document.addEventListener('visibilitychange', function () { if (!document.hidden && RB.S.code) RB.sync(); });
  window.addEventListener('online', function () { if (RB.S.code) RB.sync(); });

  /* ---- scorciatoie sui dati ---- */
  RB.members = function () { return (RB.S.d && RB.S.d.members) || []; };
  RB.mem = function (id) { var a = RB.members(), i; for (i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; };
  RB.runs = function () { return (RB.S.d && RB.S.d.runs) || []; };
  RB.run = function (id) { var a = RB.runs(), i; for (i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; };
  RB.signupsOf = function (runId) { return ((RB.S.d && RB.S.d.signups) || []).filter(function (s) { return s.run_id === runId; }); };
  RB.profiles = function () { return (RB.S.d && RB.S.d.profiles) || []; };
  RB.profile = function (key) { var a = RB.profiles(), i; for (i = 0; i < a.length; i++) if (a[i].key === key) return a[i]; return null; };
  /* il profilo dell'utente decide cosa può vedere e fare */
  RB.can = function (perm) { var me = RB.S.me; return !!(me && me.perms && me.perms.indexOf(perm) >= 0); };
  /* si può assegnare o modificare solo un profilo che non concede più permessi dei propri */
  RB.covers = function (key) {
    var p = RB.profile(key), me = RB.S.me;
    return !!(p && me && me.perms && p.perms.every(function (x) { return me.perms.indexOf(x) >= 0; }));
  };
  RB.fullName = function (m) { return m ? (m.first_name + ' ' + m.last_name).trim() : '—'; };

  /* esegue una scrittura, poi riallinea i dati; restituisce la risposta */
  RB.write = function (fn, args) {
    args = args || {}; args.p_code = RB.S.code;
    return RB.rpc(fn, args).then(function (r) {
      if (r.ok) return RB.sync().then(function () { return r; });
      if (r.error === 'auth') RB.logout('expired');
      return r;
    });
  };
})();
