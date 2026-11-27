/* Roadbook · «Mi sono perso»: il socio staccato dal gruppo raggiunge la sosta che gli indica chi guida (un punto fisso),
   con Google Maps; il suo telefono stima l'ora di arrivo e la manda al capogruppo. */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t, L = window.RBL;
  var POS_MS = 60000, ROUTE_MS = 120000, TICK_MS = 15000;
  var OSRM = 'https://router.project-osrm.org/route/v1/driving/';
  var TITLE_ME = { open: 'lost_title_me_open', sent: 'lost_title_me_sent', arrived: 'lost_title_me_arrived', closed: 'lost_title_me_closed' };
  var TITLE_G = { open: 'lost_title_g_open', sent: 'lost_title_g_sent', arrived: 'lost_title_g_arrived', closed: 'lost_title_g_closed' };

  function me() { return RB.S.me && RB.S.me.id; }
  RB.losts = function (runId) { return ((RB.S.d && RB.S.d.lost) || []).filter(function (x) { return !runId || x.run_id === runId; }); };
  RB.lostById = function (id) { return RB.losts().filter(function (x) { return x.id === id; })[0] || null; };
  RB.lostMine = function () { var id = me(); return RB.losts().filter(function (x) { return x.member_id === id && L.lostActive(x); })[0] || null; };
  /* richieste da seguire per chi aiuta: attive, più quelle chiuse da poco (per vedere l'arrivo) */
  RB.lostToGuide = function (runId) {
    var id = me();
    return RB.losts(runId).filter(function (x) { var r = RB.run(x.run_id); return x.member_id !== id && r && L.lostGuide(RB.S.me, r) && (L.lostActive(x) || x.status === 'arrived'); });
  };
  /* posso chiedere aiuto: iscritto («Ci sono») a un Run partito e ancora nelle sue ore */
  RB.lostRun = function () {
    var id = me();
    return RB.runs().filter(function (r) {
      return r.status === 'programmato' && r.started_at && RB.liveWindow(r) && RB.signupsOf(r.id).some(function (s) { return s.member_id === id && s.status === 'si'; });
    })[0] || null;
  };
  function name(x) { return RB.fullName(RB.mem(x.member_id)); }
  function stopName(s) { return (s && (s.name || s.addr)) || t('lost_stop'); }
  function upd(ts) { var n = ago(ts); return n ? t('lost_eta_upd', n) : t('lost_eta_now'); }
  function ago(ts) { return Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000)); }
  function here(done) {
    if (!navigator.geolocation) { done(null); return; }
    navigator.geolocation.getCurrentPosition(function (p) { done({ lat: p.coords.latitude, lng: p.coords.longitude }); }, function () { done(null); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  /* ---------- chi si è perso: richiesta ---------- */
  RB.lostAsk = function (r) {
    r = r || RB.lostRun();
    if (!r) { RB.toast(t('lost_no_run'), 'err'); return Promise.resolve(false); }
    var cur = RB.lostMine();
    if (cur) { RB.lostSheet(cur.id); return Promise.resolve(true); }
    return RB.ask({ title: t('lost_q'), msg: t('lost_q_msg'), ok: t('lost_send'), no: t('cancel') }).then(function (ok) {
      if (!ok) return false;
      return new Promise(function (res) {
        here(function (p) {
          RB.write('rc_lost_send', { p_run: r.id, p_lat: p ? p.lat : null, p_lng: p ? p.lng : null }).then(function (x) {
            if (!x.ok) { RB.toast(RB.errMsg(x.error), 'err'); res(false); return; }
            RB.sound('ok'); RB.toast(t('lost_sent')); RB.lostSheet(x.id); track(); res(true);
          });
        });
      });
    });
  };

  /* ---------- chi si è perso: posizione e ora prevista (solo con l'app aperta) ---------- */
  var TR = { id: null, watch: null, pos: null, sent: 0, key: '', timer: null, lock: null, route: null, routeAt: 0 };
  function routeMin(x) {
    var now = Date.now(), d = L.haversine(TR.pos, x.stop), guess = L.etaMin(TR.pos, x.stop);
    /* il servizio di percorsi si chiede al massimo ogni 2 minuti; nel frattempo si scala l'ultimo tempo sulla distanza rimasta */
    if (TR.route && TR.route.id === x.id && now - TR.routeAt < ROUTE_MS && TR.route.km > 0.05) return Promise.resolve(Math.max(1, Math.round(TR.route.min * d / TR.route.km)));
    TR.routeAt = now;
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    var url = OSRM + Number(TR.pos.lng).toFixed(5) + ',' + Number(TR.pos.lat).toFixed(5) + ';' + Number(x.stop.lng).toFixed(5) + ',' + Number(x.stop.lat).toFixed(5) + '?overview=false';
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (res) { return res.ok ? res.json() : null; }).then(function (j) {
      clearTimeout(to);
      var s = j && j.code === 'Ok' && j.routes && j.routes[0] ? j.routes[0].duration : null;
      if (s == null || !isFinite(s)) return guess;
      TR.route = { id: x.id, min: s / 60, km: d };
      return Math.max(1, Math.ceil(s / 60));
    }, function () { clearTimeout(to); return guess; });
  }
  function tick(force) {
    var x = RB.lostMine();
    if (!x) { untrack(); return; }
    if (!TR.pos || !RB.S.code) return;
    var near = x.status === 'sent' && L.hasCoords(x.stop) && L.haversine(TR.pos, x.stop) < L.LOST.arriveKm;
    /* sosta appena arrivata (o cambiata): l'ora prevista parte subito per chi aspetta */
    var key = x.status + ':' + JSON.stringify(x.stop || null);
    if (!force && !near && TR.key === key && Date.now() - TR.sent < POS_MS) return;
    TR.sent = Date.now(); TR.key = key;
    var eta = x.status === 'sent' && L.hasCoords(x.stop) ? routeMin(x) : Promise.resolve(null);
    eta.then(function (min) {
      return RB.rpc('rc_lost_pos', { p_code: RB.S.code, p_id: x.id, p_lat: TR.pos.lat, p_lng: TR.pos.lng, p_eta_min: min == null ? null : Math.min(1440, min) });
    }).then(function (r) {
      if (!r || !r.ok) return;
      if (r.status === 'arrived') { RB.sound('ok'); RB.haptic([20, 60, 20]); RB.toast(t('lost_arrived_me')); }
      RB.sync();
    });
  }
  function track() {
    var x = RB.lostMine();
    if (!x) { untrack(); return; }
    if (TR.id === x.id) return;
    untrack(); TR.id = x.id; TR.sent = 0;
    if (navigator.geolocation) TR.watch = navigator.geolocation.watchPosition(function (p) {
      var first = !TR.pos; TR.pos = { lat: p.coords.latitude, lng: p.coords.longitude }; if (first) tick(true); else tick();
    }, function () {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    TR.timer = setInterval(function () { tick(); }, TICK_MS);
    if (navigator.wakeLock && !TR.lock) navigator.wakeLock.request('screen').then(function (l) { TR.lock = l; l.addEventListener('release', function () { TR.lock = null; }); }, function () {});
  }
  function untrack() {
    if (TR.watch !== null && navigator.geolocation) navigator.geolocation.clearWatch(TR.watch);
    clearInterval(TR.timer); TR.watch = null; TR.timer = null; TR.id = null; TR.pos = null; TR.route = null; TR.key = '';
    if (TR.lock) { try { TR.lock.release(); } catch (e) {} TR.lock = null; }
  }
  RB.lostTrack = track;
  /* tornando da Google Maps: posizione e ora prevista subito */
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && TR.id) tick(true); });
  RB.on('data', function () { if (RB.lostMine()) { track(); tick(); } else if (TR.id) untrack(); });
  RB.on('logout', untrack);

  RB.lostClose = function (x, found) {
    var mine = x.member_id === me();
    return RB.ask({ title: found ? (mine ? t('lost_found_q') : t('lost_found_g_q', name(x))) : t('lost_cancel_q'), msg: found ? '' : t('lost_cancel_msg'),
      ok: found ? t('lost_found_ok') : t('lost_cancel_ok'), no: t('cancel'), danger: !found }).then(function (ok) {
      if (!ok) return false;
      return RB.write('rc_lost_close', { p_id: x.id, p_found: !!found }).then(function (r) {
        if (!r.ok) { RB.toast(RB.errMsg(r.error), 'err'); return false; }
        RB.sound('ok'); RB.toast(found ? t('lost_found_done') : t('lost_cancel_done')); return true;
      });
    });
  };

  /* ---------- chi aiuta: scelta della sosta ---------- */
  /* luoghi del giorno con la proposta in testa; in più la sosta in corso e la mia posizione */
  /* tip = proposta del server (se c'è va in testa); altrimenti si calcola qui */
  RB.lostOptions = function (r, groupPos, tip) {
    var day = r.started_day || 1, places = L.dayPlaces(r, L.runDays(r) > 1 ? day : null), hl = RB.openHalt(r.id);
    var haltAt = hl && hl.lat != null ? { lat: hl.lat, lng: hl.lng } : null;
    var useTip = !!(tip && (L.hasCoords(tip) || (tip.addr || '').trim())), k = useTip ? -1 : L.nextStop(places, groupPos, haltAt), out = [];
    function same(a, b) { return L.hasCoords(a) && L.hasCoords(b) ? L.haversine(a, b) < 0.05 : (a.name || a.addr) === (b.name || b.addr); }
    if (useTip) out.push({ stop: { name: tip.name || '', addr: tip.addr || '', lat: L.hasCoords(tip) ? Number(tip.lat) : null, lng: L.hasCoords(tip) ? Number(tip.lng) : null }, tip: true, i: -1 });
    places.forEach(function (p, i) { if ((L.hasCoords(p) || (p.addr || '').trim()) && !(useTip && same(p, tip))) out.push({ stop: { name: p.name || '', addr: p.addr || '', lat: L.hasCoords(p) ? Number(p.lat) : null, lng: L.hasCoords(p) ? Number(p.lng) : null }, tip: i === k, i: i }); });
    out.sort(function (a, b) { return (b.tip - a.tip) || (a.i - b.i); });
    if (haltAt && !(useTip && same(haltAt, tip))) out.push({ stop: { name: t('lost_here_halt'), addr: '', lat: haltAt.lat, lng: haltAt.lng }, tip: !useTip && k < 0, halt: true });
    if (groupPos) out.push({ stop: { name: t('lost_here_me'), addr: '', lat: groupPos.lat, lng: groupPos.lng }, tip: false, me: true });
    if (!out.some(function (o) { return o.tip; }) && out.length) out[0].tip = true;
    return out;
  };
  function pickStop(x, box, done) {
    var r = RB.run(x.run_id), lp = RB.live && RB.live.lastPos;
    RB.clear(box); box.appendChild(h('p', { class: 'sm' }, t('loading')));
    function draw(pos) {
      RB.clear(box);
      var opts = RB.lostOptions(r, pos, x.tip), sel = opts.filter(function (o) { return o.tip; })[0] || null;
      if (!opts.length) { box.appendChild(h('div', { class: 'empty', style: 'padding:16px' }, t('lost_no_places'))); return; }
      var l = h('div', { class: 'list', id: 'lost-opts' });
      opts.forEach(function (o, i) {
        var dist = x.lat != null && o.stop.lat != null ? Math.round(L.haversine(x, o.stop) * 10) / 10 + ' km ' + t('lost_from_him') : (o.stop.addr || '');
        var row = RB.row({ lead: RB.icon(o.halt || o.me ? 'moto' : 'pin'), title: stopName(o.stop), sub: [o.tip ? t('lost_tip') : '', dist].filter(Boolean).join(' · '), go: false,
          cls: 'lost-opt' + (o === sel ? ' sel' : ''), onclick: function () { sel = o; l.querySelectorAll('.lost-opt').forEach(function (n) { n.classList.remove('sel'); }); row.classList.add('sel'); RB.feel('tap'); } });
        row.setAttribute('data-i', i); l.appendChild(row);
      });
      box.appendChild(l);
      box.appendChild(h('button', { type: 'button', class: 'btn pri', id: 'lost-send-stop', onclick: function () {
        if (!sel) return;
        var b = this; b.disabled = true;
        RB.write('rc_lost_stop', { p_id: x.id, p_stop: sel.stop }).then(function (res) {
          b.disabled = false;
          if (!res.ok) { RB.toast(RB.errMsg(res.error), 'err'); return; }
          RB.sound('ok'); RB.toast(t('lost_stop_sent', name(x))); if (done) done();
        });
      } }, t('lost_send_stop')));
      box.appendChild(h('p', { class: 'sm' }, t('lost_pick_help')));
    }
    if (lp) draw(lp); else here(draw);
  }

  /* prima di Google Maps: l'unico tocco che serve per farsi seguire dal capogruppo anche a schermo spento */
  function shareSheet(x, nav) {
    var rc = (x.helpers || []).filter(function (p) { return p.role === 'rc'; })[0] || (x.helpers || [])[0];
    var go = h('a', { class: 'btn pri big', id: 'lost-nav-go', href: nav, target: '_blank', rel: 'noopener', onclick: function () { RB.feel('tap'); setTimeout(function () { c.close(); }, 300); } }, RB.icon('route'), t('lost_share_go'));
    var c = RB.sheet({ title: t('lost_share_t'), leftLabel: t('close'), content: h('div', { class: 'lost-share', id: 'lost-share' },
      h('ol', null, h('li', null, t('lost_share_1')), h('li', null, t('lost_share_2')), h('li', null, rc ? t('lost_share_3n', rc.name) : t('lost_share_3'))),
      h('p', { class: 'sm' }, t('lost_share_d')), go) });
    return c;
  }
  function callRow(title, phone, id) {
    var row = RB.row({ lead: RB.icon('phone'), title: title, sub: phone, href: 'tel:' + String(phone).replace(/[^+\d]/g, ''), go: false, id: id });
    row.removeAttribute('target'); row.removeAttribute('rel'); return row;
  }

  /* ---------- scheda ---------- */
  RB.lostSheet = function (id) {
    var box = h('div', { id: 'lost-sheet' }), ctl, pick = null, changing = false;
    function draw() {
      var x = RB.lostById(id);
      RB.clear(box);
      if (!x) { box.appendChild(RB.empty('check', t('lost_none'), '')); return; }
      var mine = x.member_id === me(), r = RB.run(x.run_id), s = x.stop;
      box.setAttribute('data-status', x.status);
      var head = h('div', { class: 'lost-head ' + x.status }, h('span', { class: 'lost-ic' }, RB.icon(x.status === 'arrived' ? 'check' : 'pin')),
        h('span', null, h('small', null, r ? r.title : ''), h('b', null, mine ? t(TITLE_ME[x.status]) : t(TITLE_G[x.status], name(x))),
          h('span', null, mine ? '' : t('lost_since', RB.fmt.time(x.created_at)))));
      box.appendChild(head);
      if (s) {
        var l = h('div', { class: 'list', id: 'lost-stop' });
        l.appendChild(RB.row({ lead: RB.icon('pin'), title: stopName(s), sub: s.name && s.addr ? s.addr : t('lost_stop'), go: false }));
        if (x.eta && x.status === 'sent') l.appendChild(RB.row({ lead: RB.icon('clock'), title: t('lost_eta', RB.fmt.time(x.eta)), sub: x.eta_at ? upd(x.eta_at) : '', go: false, id: 'lost-eta' }));
        else if (x.status === 'sent' && !L.hasCoords(s)) l.appendChild(RB.row({ lead: RB.icon('clock'), title: t('lost_eta_none'), go: false }));
        if (!mine && x.pos_at && L.lostActive(x)) l.appendChild(RB.row({ lead: RB.icon('user'), title: t('lost_seen', ago(x.pos_at)), sub: x.lat != null && L.hasCoords(s) ? t('lost_left_km', Math.round(L.haversine(x, s) * 10) / 10) : '', go: false,
          href: x.lat != null ? RB.mapsUrl(x.lat + ',' + x.lng) : null }));
        box.appendChild(l);
      }
      if (mine && x.status === 'sent') {
        var nav = L.lostNavUrl(s);
        if (nav) box.appendChild(h('button', { type: 'button', class: 'btn pri big', id: 'lost-nav', 'data-href': nav, onclick: function () { RB.feel('tap'); tick(true); shareSheet(x, nav); } }, RB.icon('route'), t('lost_nav')));
        box.appendChild(h('p', { class: 'sm' }, t('lost_nav_help')));
      }
      if (mine && x.status === 'open') box.appendChild(h('p', { class: 'sm', id: 'lost-wait' }, t('lost_wait')));
      if (!mine && x.status === 'open' && !L.lostActor(RB.S.me, r)) box.appendChild(h('p', { class: 'sm', id: 'lost-info' }, t('lost_info_dir')));
      /* la scelta resta la stessa anche quando la scheda si aggiorna */
      if (!mine && (x.status === 'open' || (changing && x.status === 'sent'))) {
        if (!pick) { pick = h('div', { id: 'lost-pick' }); pickStop(x, pick, function () { pick = null; changing = false; draw(); }); }
        box.appendChild(RB.secT(changing ? t('lost_change') : t('lost_pick'))); box.appendChild(pick);
      } else { pick = null; changing = false; }
      var acts = h('div', { class: 'list', id: 'lost-acts' });
      /* una telefonata risolve spesso prima di tutto: il socio chiama capogruppo o safety, loro chiamano lui */
      if (mine && L.lostActive(x)) (x.helpers || []).forEach(function (p) { acts.appendChild(callRow(t(p.role === 'safety' ? 'lost_call_safety' : 'lost_call_rc', p.name), p.phone, 'lost-call-' + p.role)); });
      if (!mine) {
        var m = RB.mem(x.member_id), ph = x.phone || (m && m.phone);
        if (ph && L.lostActive(x)) acts.appendChild(callRow(t('lost_call', (m && m.first_name) || name(x)), ph, 'lost-call'));
        if (ph && x.status === 'sent' && RB.waDigits(ph)) acts.appendChild(RB.row({ lead: RB.icon('chat'), title: t('lost_follow_wa', (m && m.first_name) || name(x)), sub: t('lost_follow_wa_d'), href: 'https://wa.me/' + RB.waDigits(ph), go: false, id: 'lost-follow' }));
        if (x.status === 'sent' && !changing) acts.appendChild(RB.row({ lead: RB.icon('edit'), title: t('lost_change'), id: 'lost-change', go: false, onclick: function () { changing = true; draw(); } }));
      }
      if (L.lostActive(x)) {
        acts.appendChild(RB.row({ lead: RB.icon('check'), title: mine ? t('lost_found') : t('lost_found_g'), id: 'lost-found', go: false, onclick: function () { RB.lostClose(x, true); } }));
        if (mine) acts.appendChild(RB.row({ lead: RB.icon('x'), title: t('lost_cancel'), id: 'lost-cancel', go: false, cls: 'dng', onclick: function () { RB.lostClose(x, false); } }));
      }
      if (acts.children.length) box.appendChild(acts);
      if (mine && L.lostActive(x)) box.appendChild(h('p', { class: 'sm' }, t('lost_keep_open')));
    }
    ctl = RB.sheet({ title: t('lost_btn'), content: box, full: true, leftLabel: t('close') });
    ctl.refresh = draw; draw();
    return ctl;
  };

  /* ---------- avvisi in cima alla pagina ---------- */
  function card(x, mine) {
    var s = x.stop, tx;
    if (mine) tx = x.status === 'sent' ? t('lost_card_me_sent', stopName(s)) + (x.eta ? ' · ' + t('lost_eta', RB.fmt.time(x.eta)) : '') : t('lost_card_me_open');
    else if (x.status === 'open') tx = L.lostActor(RB.S.me, RB.run(x.run_id)) ? (x.tip ? t('lost_card_g_tip', stopName(x.tip)) : t('lost_card_g_open')) : t('lost_card_g_info');
    else if (x.status === 'sent') tx = stopName(s) + (x.eta ? ' · ' + t('lost_eta', RB.fmt.time(x.eta)) + ' (' + upd(x.eta_at) + ')' : '');
    else tx = t('lost_card_g_arrived', stopName(s));
    return h('button', { type: 'button', class: 'lost-card ' + x.status + (mine ? ' mine' : ''), id: 'lost-' + x.id, 'data-status': x.status, onclick: function () { RB.feel('tap'); RB.lostSheet(x.id); } },
      h('span', { class: 'lost-ic' }, RB.icon(x.status === 'arrived' ? 'check' : 'pin')),
      h('span', { class: 'lost-tx' }, h('small', null, mine ? t('lost_btn') : t('lost_card_g', name(x))), h('b', null, tx)), RB.icon('chev'));
  }
  RB.lostBlock = function () {
    var mine = RB.lostMine(), list = RB.lostToGuide(), cards = [];
    if (mine) cards.push(card(mine, true));
    list.forEach(function (x) { cards.push(card(x, false)); });
    return cards.length ? h('div', { class: 'lost-block', id: 'lost-block' }, cards) : null;
  };
  /* prima di «Si riparte»: chi aspettiamo ancora a questa sosta */
  RB.lostWaiting = function (runId) { return RB.losts(runId).filter(function (x) { return x.status === 'sent' && x.member_id !== me(); }); };
  RB.lostConfirmRestart = function (r) {
    var w = RB.lostWaiting(r.id);
    if (!w.length) return Promise.resolve(true);
    var x = w[0];
    return RB.ask({ title: t('lost_restart_q', name(x)), msg: x.eta ? t('lost_restart_eta', RB.fmt.time(x.eta)) : t('lost_restart_msg'), ok: t('lost_restart_ok'), no: t('lost_restart_wait') });
  };
  /* dalle notifiche: #lost=<id> */
  RB.lostFromLink = function (id) { if (RB.lostById(id)) { RB.lostSheet(id); return true; } RB.toast(t('lost_none')); return false; };
})();
