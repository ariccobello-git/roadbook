/* Roadbook · posizione del gruppo durante il Run e invito al Run con link e QR.
   La posizione si condivide solo per scelta, solo nelle ore del Run, e la vedono solo gli organizzatori. */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t, L = window.RBL;
  var SEND_MS = 20000, POLL_MS = 20000, STALE_MIN = 5, FAR_KM = 5;

  function loadScript(src, test) { return new Promise(function (res, rej) { if (test()) { res(); return; } var s = document.createElement('script'); s.src = src; s.onload = function () { res(); }; s.onerror = function () { rej(new Error('load')); }; document.head.appendChild(s); }); }
  function km(a, b) { var R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r, x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(x)); }

  /* il Run è in corso: da 3 ore prima della partenza a 6 ore dopo la fine dell'ultimo giorno */
  RB.liveWindow = function (r, now) {
    if (!r || r.status === 'annullato') return false;
    var st = new Date(r.run_date).getTime(), n = now || Date.now(), days = Math.max(1, L.runDays(r));
    return n >= st - 3 * 3600000 && n <= st + days * 86400000 + 6 * 3600000;
  };
  function mySignup(runId) { var me = RB.S.me && RB.S.me.id; return RB.signupsOf(runId).filter(function (s) { return s.member_id === me; })[0]; }
  RB.liveCanShare = function (r) { var s = mySignup(r.id); return (s && s.status === 'si') || RB.can('route_view'); };

  /* ---------- invio della mia posizione ---------- */
  var S = RB.live = { run: null, watch: null, last: 0, lastPos: null, lock: null, err: '' };
  function pref(runId, on) { try { if (on === undefined) return localStorage.getItem('rb.live') === runId; if (on) localStorage.setItem('rb.live', runId); else localStorage.removeItem('rb.live'); } catch (e) { return false; } }
  function keepAwake() {
    if (!navigator.wakeLock || S.lock) return;
    navigator.wakeLock.request('screen').then(function (l) { S.lock = l; l.addEventListener('release', function () { S.lock = null; }); }, function () {});
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.watch !== null) keepAwake(); });
  function send(pos, force) {
    var c = pos.coords, now = Date.now(), p = { lat: c.latitude, lng: c.longitude };
    if (!force && now - S.last < SEND_MS && !(S.lastPos && km(S.lastPos, p) > 0.3)) return;
    S.last = now; S.lastPos = p;
    RB.rpc('rc_live_set', { p_code: RB.S.code, p_run: S.run, p_lat: c.latitude, p_lng: c.longitude, p_acc: c.accuracy, p_speed: c.speed == null ? null : c.speed * 3.6, p_heading: c.heading })
      .then(function (r) { if (r && r.error === 'live_fuori_orario') RB.liveStop(true); });
  }
  RB.liveStart = function (r) {
    if (!navigator.geolocation) { RB.toast(t('live_nogps'), 'err'); return false; }
    if (S.watch !== null) RB.liveStop(true);
    S.run = r.id; S.last = 0; S.err = '';
    S.watch = navigator.geolocation.watchPosition(function (pos) { S.err = ''; send(pos); haltFeed(pos); }, function (e) {
      S.err = e && e.code === 1 ? 'denied' : 'nofix';
      if (e && e.code === 1) { RB.toast(t('live_denied'), 'err'); RB.liveStop(true); }
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    pref(r.id, true); keepAwake(); RB.sound('ok');
    if (!HS.timer) HS.timer = setInterval(haltTickAll, 15000);
    return true;
  };
  /* ---------- soste rilevate dal telefono di chi guida (solo con l'app aperta e la posizione condivisa) ---------- */
  var HS = { run: null, st: null, timer: null, busy: false };
  function haltRun() {
    var r = S.run && RB.run(S.run);
    return r && r.status === 'programmato' && r.started_at && L.canStart(RB.S.me, r) ? r : null;
  }
  /* allinea il rilevatore allo stato del server (sosta aperta da un altro o a mano) */
  RB.haltSync = function (runId, halted) {
    if (!HS.st || HS.run !== runId || HS.busy) return;
    var open = halted === undefined ? !!RB.openHalt(runId) : halted;
    if (open && HS.st.mode !== 'halt') { var hl = RB.openHalt(runId); HS.st = L.haltNew(true, hl && hl.lat != null ? { lat: hl.lat, lng: hl.lng } : S.lastPos); }
    else if (!open && HS.st.mode === 'halt') HS.st = L.haltNew(false);
  };
  function haltEvent(r, ev, at) {
    if (HS.busy) return;
    HS.busy = true;
    RB.write('rc_run_halt', { p_id: r.id, p_action: ev === 'stop' ? 'stop' : 'go', p_lat: at ? at.lat : null, p_lng: at ? at.lng : null, p_min: null }).then(function (x) {
      HS.busy = false;
      if (!x.ok) return;
      if (ev === 'stop') { RB.toast(t('halt_detected')); RB.sound('open'); return; }
      RB.haltUndoBar(r);
      /* ripartiti da soli mentre qualcuno sta ancora raggiungendo la sosta: «Annulla» riporta la sosta */
      var w = RB.lostWaiting(r.id); if (w.length) { RB.toast(t('lost_left_behind', RB.fullName(RB.mem(w[0].member_id))), 'err'); RB.sound('open'); }
    });
  }
  function haltFeed(pos) {
    var r = haltRun();
    if (!r) { HS.run = null; HS.st = null; return; }
    if (HS.run !== r.id || !HS.st) { HS.run = r.id; HS.st = L.haltNew(!!RB.openHalt(r.id)); }
    else RB.haltSync(r.id);
    var c = pos.coords, at = HS.st.at, ev = L.haltStep(HS.st, { lat: c.latitude, lng: c.longitude, t: pos.timestamp || Date.now(), kmh: c.speed == null || c.speed < 0 ? null : c.speed * 3.6 });
    if (ev) haltEvent(r, ev, ev === 'stop' ? HS.st.at : at);
  }
  function haltTickAll() {
    var r = haltRun();
    if (!r || !HS.st || HS.run !== r.id) return;
    var ev = L.haltTick(HS.st, Date.now());
    if (ev) haltEvent(r, ev, HS.st.at);
  }
  RB.liveStop = function (quiet) {
    if (S.watch !== null && navigator.geolocation) navigator.geolocation.clearWatch(S.watch);
    var run = S.run; S.watch = null; S.run = null; pref(run, false);
    if (HS.timer) { clearInterval(HS.timer); HS.timer = null; } HS.run = null; HS.st = null;
    if (S.lock) { try { S.lock.release(); } catch (e) {} S.lock = null; }
    if (run && RB.S.code) RB.rpc('rc_live_stop', { p_code: RB.S.code, p_run: run });
    if (!quiet) RB.toast(t('live_stopped'));
  };
  RB.liveOn = function (runId) { return S.watch !== null && S.run === runId; };
  /* riapre la condivisione se l'app è stata chiusa durante il Run (la scelta resta su questo dispositivo) */
  RB.liveResume = function () {
    var id; try { id = localStorage.getItem('rb.live'); } catch (e) { id = null; }
    var r = id && RB.run(id);
    if (!r || !RB.liveWindow(r) || !RB.liveCanShare(r)) { if (id) pref(id, false); return; }
    if (S.watch === null) RB.liveStart(r);
  };
  RB.on('logout', function () { if (S.watch !== null) RB.liveStop(true); });

  /* ---------- mappa del gruppo (organizzatori) ---------- */
  RB.liveStatus = function (pts, run, nowMs) {
    var fm = (run && run.formation) || [], leadId = null, sweepId = null, by = {}, n = nowMs || Date.now();
    fm.forEach(function (x) { if (x.kind === 'road_captain' && !leadId && x.member_id) leadId = x.member_id; if (x.kind === 'scopa' && x.member_id) sweepId = x.member_id; });
    pts.forEach(function (p) { by[p.member_id] = p; });
    var lead = (leadId && by[leadId]) || null;
    return pts.map(function (p) {
      var age = (n - new Date(p.at).getTime()) / 60000, d = lead && p !== lead ? km(lead, p) : null;
      return { p: p, age: age, km: d, stale: age > STALE_MIN, far: d !== null && d > FAR_KM, lead: p.member_id === leadId, sweep: p.member_id === sweepId };
    }).sort(function (a, b) { return (b.far - a.far) || (b.stale - a.stale) || ((b.km || 0) - (a.km || 0)); });
  };
  RB.liveSheet = function (run) {
    var box = h('div', { id: 'live-box' }), mapEl = h('div', { class: 'live-map', id: 'live-map' }), list = h('div', { class: 'list', id: 'live-list' }), info = h('p', { class: 'sm', id: 'live-info' }, t('loading'));
    var map = null, layer = null, timer = null, fitted = false, ctl;
    box.appendChild(mapEl); box.appendChild(info); box.appendChild(list);
    box.appendChild(h('p', { class: 'sm' }, t('live_help', STALE_MIN, FAR_KM)));
    function draw(res) {
      if (!res || !res.ok) { info.textContent = RB.errMsg(res && res.error); return; }
      var rows = RB.liveStatus(res.pts || [], RB.run(run.id) || run), signed = RB.signupsOf(run.id).filter(function (s) { return s.status === 'si'; }).length;
      info.textContent = t('live_count', rows.length, signed) + (rows.some(function (x) { return x.far; }) ? ' · ' + t('live_far_n', rows.filter(function (x) { return x.far; }).length) : '');
      RB.clear(list);
      if (!rows.length) list.appendChild(h('div', { class: 'empty', style: 'padding:18px' }, t('live_none')));
      rows.forEach(function (x) {
        var m = RB.mem(x.p.member_id), chips = [];
        if (x.lead) chips.push(RB.chip(t('k_rc'), 'acc')); if (x.sweep) chips.push(RB.chip(t('k_scopa'), 'acc'));
        if (x.far) chips.push(RB.chip(t('live_far', Math.round(x.km)), 'er'));
        if (x.stale) chips.push(RB.chip(t('live_stale'), 'wa'));
        list.appendChild(RB.row({ lead: m ? RB.av(m, 'sm') : RB.icon('user'), title: m ? RB.fullName(m) : '—',
          sub: t('live_ago', Math.max(0, Math.round(x.age))) + (x.km !== null ? ' · ' + (Math.round(x.km * 10) / 10) + ' km ' + t('live_from_lead') : '') + (x.p.speed != null ? ' · ' + Math.round(x.p.speed) + ' km/h' : ''),
          right: h('span', { class: 'chips', style: 'margin:0' }, chips), go: false,
          onclick: function () { if (map) map.setView([x.p.lat, x.p.lng], 14); } }));
      });
      if (!map || !window.L) return;
      layer.clearLayers();
      var bounds = [];
      rows.forEach(function (x) {
        var m = RB.mem(x.p.member_id), ini = m ? ((m.first_name || '').charAt(0) + (m.last_name || '').charAt(0)).toUpperCase() : '?';
        var cls = 'live-pin' + (x.lead ? ' lead' : x.sweep ? ' sweep' : '') + (x.far ? ' far' : x.stale ? ' stale' : '');
        window.L.marker([x.p.lat, x.p.lng], { icon: window.L.divIcon({ className: '', html: '<span class="' + cls + '">' + ini + '</span>', iconSize: [30, 30], iconAnchor: [15, 15] }), title: m ? RB.fullName(m) : '' }).addTo(layer);
        bounds.push([x.p.lat, x.p.lng]);
      });
      if (bounds.length && !fitted) { map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 }); fitted = true; }
    }
    function poll() { RB.rpc('rc_live_get', { p_code: RB.S.code, p_run: run.id }).then(draw); }
    RB.loadLeaflet().then(function (Lf) {
      map = Lf.map(mapEl, { zoomControl: true, attributionControl: true }).setView([41.9, 12.5], 8);
      Lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
      layer = Lf.layerGroup().addTo(map); setTimeout(function () { map.invalidateSize(); }, 200); poll();
    }, function () { mapEl.style.display = 'none'; poll(); });
    timer = setInterval(poll, POLL_MS);
    ctl = RB.sheet({ title: t('live_title'), content: box, full: true, leftLabel: t('close'), onclose: function () { clearInterval(timer); if (map) map.remove(); } });
    return ctl;
  };

  /* ---------- righe nella scheda del Run ---------- */
  RB.liveRows = function (f, r) {
    if (!RB.liveWindow(r)) return;
    var share = RB.liveCanShare(r), boss = RB.can('route_view');
    if (!share && !boss) return;
    f.appendChild(RB.secT(t('live_title')));
    var l = h('div', { class: 'list', id: 'live-rows' });
    if (share) {
      var on = RB.liveOn(r.id);
      var row = RB.row({ lead: RB.icon('pin'), title: t('live_share'), sub: on ? t('live_share_on') : t('live_share_off'), go: false,
        right: RB.toggle(on, function (v) { if (v) { if (!RB.liveStart(r)) return; } else RB.liveStop(); var sb = row.querySelector('.rt span'); if (sb) sb.textContent = RB.liveOn(r.id) ? t('live_share_on') : t('live_share_off'); }) });
      row.id = 'live-share'; l.appendChild(row);
    }
    if (boss) l.appendChild(RB.row({ lead: RB.icon('route'), title: t('live_map'), sub: t('live_map_d'), onclick: function () { RB.liveSheet(r); } }));
    if (RB.lostRun && (RB.lostRun() || {}).id === r.id) l.appendChild(RB.row({ lead: RB.icon('pin'), title: t('lost_btn'), sub: t('lost_btn_d'), id: 'lost-open', onclick: function () { RB.lostAsk(r); } }));
    f.appendChild(l);
    if (share) f.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('live_note')));
  };

  /* ---------- invito al Run: link e QR ---------- */
  RB.runLink = function (r) { return RB.appUrl() + '#run=' + r.id; };
  RB.inviteSheet = function (r) {
    var url = RB.runLink(r), txt = t('inv_text', r.title, RB.fmt.full(String(r.run_date).slice(0, 10)), url);
    var qr = h('div', { class: 'xqr', id: 'inv-qr' }, t('loading')), box = h('div', { id: 'inv-box' });
    box.appendChild(h('p', { class: 'sm', style: 'text-align:center' }, t('inv_help')));
    box.appendChild(qr);
    box.appendChild(h('div', { class: 'list' }, h('div', { class: 'field' }, h('span', null, t('inv_link')), h('input', { type: 'text', readonly: true, '.value': url, id: 'inv-url', onclick: function () { this.select(); } }))));
    box.appendChild(h('button', { type: 'button', class: 'btn pri', id: 'inv-wa', onclick: function () { RB.waSend(txt); } }, RB.icon('chat'), t('inv_wa')));
    if (navigator.share) box.appendChild(h('button', { type: 'button', class: 'btn sec', onclick: function () { navigator.share({ title: r.title, text: txt }).catch(function () {}); } }, RB.icon('share'), t('inv_share')));
    box.appendChild(h('button', { type: 'button', class: 'btn ghost', onclick: function () { RB.copy(url).then(function () { RB.toast(t('copied')); }); } }, t('inv_copy')));
    loadScript('vendor/qrcode.js', function () { return window.qrcode; }).then(function () {
      var q = window.qrcode(0, 'M'); q.addData(url); q.make(); qr.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); qr.setAttribute('data-qr', url);
    }, function () { qr.textContent = t('e_generic'); });
    return RB.sheet({ title: t('inv_title'), content: box, full: true, leftLabel: t('close') });
  };
  /* link ricevuto: dopo l'accesso si apre direttamente il Run */
  RB.openFromLink = function () {
    var m = /#(run|lost)=([0-9a-f-]{36})/i.exec(location.hash || '');
    if (!m) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
    if (m[1] === 'lost') { RB.lostFromLink(m[2]); return; }
    if (RB.run(m[2])) RB.openRun(m[2]); else RB.toast(t('inv_notfound'), 'err');
  };
  /* notifica toccata con l'app già aperta: il service worker passa il link */
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type !== 'open' || typeof d.url !== 'string' || d.url.indexOf('#') < 0 || !RB.S.code) return;
    location.hash = d.url.slice(d.url.indexOf('#'));
    RB.sync().then(RB.openFromLink);
  });
})();
