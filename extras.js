/* Roadbook · funzioni di secondo livello: avvisi, tessera con QR, check-in con scansione, statistiche, calendario, GPX, import Run da Excel, elenchi */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t, L = window.RBL;

  function loadScript(src, test) { return new Promise(function (res, rej) { if (test()) { res(); return; } var s = document.createElement('script'); s.src = src; s.onload = function () { res(); }; s.onerror = function () { rej(new Error('load')); }; document.head.appendChild(s); }); }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function pickFile(accept, cb) {
    var inp = h('input', { type: 'file', accept: accept, style: 'display:none', onchange: function () { var f = inp.files && inp.files[0]; if (inp.parentNode) inp.parentNode.removeChild(inp); if (f) cb(f); } });
    document.body.appendChild(inp); inp.click();
  }

  /* ---------- avvisi dell'organizzazione ---------- */
  RB.notices = { items: null, at: 0 };
  RB.noticesLoad = function (force) {
    if (!RB.S.code || (!force && RB.notices.items && Date.now() - RB.notices.at < 120000)) return Promise.resolve();
    return RB.rpc('rc_notice_list', { p_code: RB.S.code }).then(function (r) {
      if (r && r.ok) { var sig = JSON.stringify(r.items); var ch = sig !== JSON.stringify(RB.notices.items); RB.notices.items = r.items; RB.notices.at = Date.now(); if (ch && RB.ui && RB.ui.tab === 'run') RB.render(); }
    });
  };
  RB.noticesBlock = function () {
    if (!RB.notices.items) { RB.noticesLoad(); return null; }
    RB.noticesLoad();
    if (!RB.notices.items.length) return null;
    var box = h('div', { id: 'notices' });
    RB.notices.items.slice(0, 3).forEach(function (n) {
      box.appendChild(h('div', { class: 'notice' + (n.pinned ? ' pin' : '') }, h('b', null, (n.pinned ? '📌 ' : '') + n.title), n.body ? h('p', null, n.body) : null,
        h('small', null, RB.fmt.dayShort(n.created_at))));
    });
    return box;
  };
  RB.noticeText = function (n) { return t('wa_notice', n.title, (n.body || '').trim(), RB.appUrl()).replace(/\n{3,}/g, '\n\n'); };
  RB.noticesManage = function () {
    var body = h('div'), ctl = RB.sheet({ title: t('x2_notices'), content: body, full: true, leftLabel: t('close') });
    function edit(n) {
      var ti = RB.input('nt-t', n ? n.title : '', { max: 120, ph: t('x2_n_title') }), bo = h('textarea', { id: 'nt-b', maxlength: 1000, rows: 4, placeholder: t('x2_n_body') }); bo.value = n && n.body || '';
      var pin = n ? !!n.pinned : false, days = n && n.expires_at ? Math.max(1, Math.round((new Date(n.expires_at) - Date.now()) / 86400000)) : 14;
      var d2 = RB.input('nt-d', days, { type: 'number', min: 1, mode: 'numeric' });
      var c2 = RB.sheet({ title: n ? t('x2_n_edit') : t('x2_n_new'), leftLabel: t('cancel'), right: { label: t('save'), fn: function (cc) {
        var v = (RB.val('nt-t') || '').trim(); if (!v) { RB.toast(t('e_dati_mancanti'), 'err'); return; } var bv = document.getElementById('nt-b').value;
        RB.act(cc.right, function () { return RB.write('rc_notice_save', { p_id: n ? n.id : null, p_title: v, p_body: bv, p_pinned: pin, p_days: parseInt(RB.val('nt-d'), 10) || null }); }, t('saved')).then(function (x) { if (x && x.ok) { cc.close(true); RB.noticesLoad(true).then(draw); if (!n) askWa({ title: v, body: bv }); } });
      } }, content: h('div', null, h('div', { class: 'list' }, RB.field(t('x2_n_title'), ti), RB.field(t('x2_n_body'), bo), RB.field(t('x2_n_days'), d2)),
        h('div', { class: 'list', style: 'margin-top:10px' }, h('div', { class: 'pass' }, h('span', null, t('x2_n_pin')), RB.toggle(pin, function (on) { pin = on; })))) });
    }
    /* dopo la pubblicazione: un tocco per mandarlo anche sul gruppo WhatsApp del Chapter */
    function askWa(n) {
      RB.ask({ title: t('wa_ask_t'), msg: t('wa_ask_m'), ok: t('wa_send') }).then(function (y) { if (y) RB.waSend(RB.noticeText(n)); });
    }
    function draw() {
      RB.clear(body);
      body.appendChild(h('button', { type: 'button', class: 'btn pri', id: 'nt-new', style: 'margin-top:0', onclick: function () { edit(null); } }, RB.icon('plus'), t('x2_n_new')));
      var items = RB.notices.items || [];
      if (!items.length) { body.appendChild(h('div', { class: 'empty' }, h('b', null, t('x2_n_none')))); return; }
      var l = h('div', { class: 'list', style: 'margin-top:12px' });
      items.forEach(function (n) {
        l.appendChild(RB.row({ title: n.title, sub: (n.expires_at ? t('x2_n_until', RB.fmt.dayShort(n.expires_at)) : t('x2_n_always')), onclick: function () { edit(n); },
          right: h('span', { class: 'nt-acts' }, h('button', { type: 'button', class: 'btn ghost sm2 nt-wa', 'aria-label': t('wa_send'), onclick: function (e) { e.stopPropagation(); RB.waSend(RB.noticeText(n)); } }, RB.icon('chat')), h('button', { type: 'button', class: 'btn ghost sm2', 'aria-label': t('delete'), onclick: function (e) { e.stopPropagation(); RB.ask({ title: t('x2_n_del'), msg: n.title, ok: t('delete'), danger: true }).then(function (y) { if (y) RB.write('rc_notice_delete', { p_id: n.id }).then(function () { RB.noticesLoad(true).then(draw); }); }); } }, RB.icon('x'))) }));
      });
      body.appendChild(l);
    }
    RB.noticesLoad(true).then(draw); draw(); return ctl;
  };

  /* ---------- tessera digitale con QR ---------- */
  RB.cardSheet = function () {
    var me = RB.S.me, m = RB.mem(me.id) || me, box = h('div', { class: 'xcard', id: 'x-card' });
    var qr = h('div', { class: 'xqr', id: 'x-qr', 'aria-label': 'QR' }, t('loading'));
    box.appendChild(h('div', { class: 'xc-top' }, h('b', null, RB.chapterName()), h('span', null, 'Roadbook')));
    box.appendChild(h('div', { class: 'xc-who' }, RB.av(m, 'lg'), h('div', null, h('b', null, RB.fullName(m)), h('span', null, RB.titleName(me.title)), m.tessera ? h('span', null, t('tessera') + ' ' + m.tessera) : null)));
    box.appendChild(qr);
    box.appendChild(h('p', { class: 'sm', style: 'text-align:center' }, t('x2_card_help')));
    loadScript('vendor/qrcode.js', function () { return window.qrcode; }).then(function () {
      var q = window.qrcode(0, 'M'); q.addData(L.qrPayload(me.id)); q.make(); qr.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); qr.setAttribute('data-qr', L.qrPayload(me.id));
    }, function () { qr.textContent = t('e_generic'); });
    return RB.sheet({ title: t('x2_card'), content: box, full: true, leftLabel: t('close') });
  };

  /* ---------- check-in con scansione tessere ---------- */
  RB.scanSheet = function (run) {
    var video = h('video', { id: 'x-video', playsinline: true, muted: true, autoplay: true, class: 'xvideo' }), out = h('div', { id: 'x-scan-out', class: 'xscan-out' }, h('span', null, t('x2_scan_point')));
    var stream = null, stop = false, last = '', lastAt = 0, det = null, canvas = document.createElement('canvas'), cx = canvas.getContext('2d', { willReadFrequently: true });
    var ctl = RB.sheet({ title: t('x2_scan'), leftLabel: t('close'), full: true, onclose: function () { stop = true; if (stream) stream.getTracks().forEach(function (x) { x.stop(); }); },
      content: h('div', null, h('div', { class: 'xvwrap' }, video), counter, out, h('p', { class: 'sm' }, t('x2_scan_help'))) });
    function cnt() { var c = RB.signupsOf(run.id).filter(function (x) { return x.status === 'si'; }); return t('x2_scan_count', c.filter(function (x) { return x.checked_in; }).length, c.length); }
    var counter = h('p', { id: 'x-scan-count', class: 'sm', style: 'text-align:center;font-weight:600' }, cnt());
    function result(ok, txt, extra) { counter.textContent = cnt(); RB.clear(out); out.className = 'xscan-out ' + (ok ? 'ok' : 'ko'); out.appendChild(h('b', null, txt)); if (extra) out.appendChild(extra); RB.feel(ok ? 'ok' : 'err'); }
    function handle(txt) {
      var id = L.parseQr(txt); if (!id) { result(false, t('x2_scan_bad')); return; }
      var m = RB.mem(id); if (!m) { result(false, t('x2_scan_unknown')); return; }
      var s = RB.signupsOf(run.id).filter(function (x) { return x.member_id === id; })[0];
      if (s && s.status === 'si') {
        if (s.checked_in) { result(true, RB.fullName(m) + ' · ' + t('x2_scan_already')); return; }
        s.checked_in = true;
        RB.write('rc_checkin', { p_run: run.id, p_member: id, p_value: true }).then(function (x) { if (!x.ok) { result(false, RB.errMsg(x.error)); RB.sync(); } });
        result(true, RB.fullName(m) + ' · ' + t('x2_scan_ok'));
      } else {
        result(false, RB.fullName(m) + ' · ' + t('x2_scan_notin'), h('button', { type: 'button', class: 'btn pri', id: 'x-scan-add', style: 'margin-top:8px', onclick: function () {
          RB.write('rc_signup', { p_run: run.id, p_status: 'si', p_passengers: 0, p_member: id }).then(function (x) { if (!x.ok) { RB.toast(RB.errMsg(x.error), 'err'); return; } RB.write('rc_checkin', { p_run: run.id, p_member: id, p_value: true }).then(function () { result(true, RB.fullName(m) + ' · ' + t('x2_scan_ok')); }); });
        } }, t('x2_scan_add')));
      }
    }
    RB.scanHandle = handle;
    function tick() {
      if (stop) return;
      if (video.readyState >= 2 && video.videoWidth) {
        var done = function (txt) { var now = Date.now(); if (txt && (txt !== last || now - lastAt > 4000)) { last = txt; lastAt = now; handle(txt); } setTimeout(tick, 150); };
        if (det) det.detect(video).then(function (c) { done(c && c[0] && c[0].rawValue); }, function () { setTimeout(tick, 250); });
        else {
          var w = Math.min(video.videoWidth, 640), hh = Math.round(w * video.videoHeight / video.videoWidth); canvas.width = w; canvas.height = hh; cx.drawImage(video, 0, 0, w, hh);
          var code = window.jsQR && window.jsQR(cx.getImageData(0, 0, w, hh).data, w, hh); done(code && code.data);
        }
      } else setTimeout(tick, 150);
    }
    var needJs = !('BarcodeDetector' in window);
    (needJs ? loadScript('vendor/jsqr.js', function () { return window.jsQR; }) : Promise.resolve()).then(function () {
      if (!needJs) { try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; } }
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    }).then(function (s) { stream = s; video.srcObject = s; video.play && video.play().catch(function () {}); if (stop) { s.getTracks().forEach(function (x) { x.stop(); }); return; } tick(); },
      function () { RB.clear(out); out.className = 'xscan-out ko'; out.appendChild(h('b', null, t('x2_scan_nocam'))); });
    return ctl;
  };

  /* ---------- statistiche e storico ---------- */
  RB.statsSheet = function (chapter) {
    var d = RB.S.d || {}, runs = d.runs || [], su = d.signups || [], me = RB.S.me, body = h('div', { id: 'x-stats' });
    var s = L.statsMember(runs, su, me.id), big = function (n, lab) { return h('div', { class: 'xs' }, h('b', { class: 'tn' }, String(n)), h('span', null, lab)); };
    body.appendChild(RB.secT(t('x2_st_mine')));
    body.appendChild(h('div', { class: 'xstats' }, big(s.attended, t('x2_st_runs')), big(s.km.toLocaleString(RB.loc()), t('x2_st_km')), big(s.rate + '%', t('x2_st_rate')), big(s.nights, t('x2_st_nights'))));
    var ys = Object.keys(s.years).sort().reverse();
    if (ys.length) { var yl = h('div', { class: 'list', style: 'margin-top:10px' }); ys.forEach(function (y) { yl.appendChild(RB.row({ title: y, value: String(s.years[y]), go: false })); }); body.appendChild(yl); }
    if (s.last) body.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('x2_st_last', s.last.title, RB.fmt.full(s.last.run_date))));
    if (!s.attended) body.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('x2_st_none')));
    if (chapter) {
      var c = L.statsChapter(runs, su, RB.members(), Date.now());
      body.appendChild(RB.secT(t('x2_st_chapter')));
      body.appendChild(h('div', { class: 'xstats' }, big(c.runs, t('x2_st_cruns')), big(c.avg, t('x2_st_avg')), big(c.active, t('x2_st_active')), big(c.km.toLocaleString(RB.loc()), t('x2_st_ckm'))));
      var months = Object.keys(c.byMonth).sort().slice(-12);
      if (months.length) {
        var mx = Math.max.apply(null, months.map(function (k) { return c.byMonth[k]; })), bars = h('div', { class: 'xbars' });
        months.forEach(function (k) { bars.appendChild(h('div', { class: 'xbar' }, h('i', { style: 'height:' + Math.max(8, Math.round(c.byMonth[k] * 70 / mx)) + 'px' }), h('b', null, String(c.byMonth[k])), h('span', null, k.slice(5)))); });
        body.appendChild(h('div', { class: 'card' }, h('b', null, t('x2_st_months')), bars));
      }
      if (c.top.length) { var tl = h('div', { class: 'list' }); c.top.forEach(function (x, i) { tl.appendChild(RB.row({ lead: RB.av(x.m, 'sm'), title: (i + 1) + '. ' + RB.fullName(x.m), value: String(x.n), go: false })); }); body.appendChild(RB.secT(t('x2_st_top'))); body.appendChild(tl); }
    }
    return RB.sheet({ title: t(chapter ? 'x2_st_chapter' : 'x2_stats'), content: body, full: true, leftLabel: t('close') });
  };

  /* ---------- calendario (.ics) ---------- */
  RB.icsDownload = function (run) {
    var txt = L.ics(run, RB.chapterName()), name = 'roadbook-' + String(run.title).replace(/[^\w]+/g, '_').toLowerCase().slice(0, 40) + '.ics';
    download(new Blob([txt], { type: 'text/calendar;charset=utf-8' }), name); RB.toast(t('x2_ics_done'));
  };

  /* ---------- GPX (alternativa al pianificatore integrato) ---------- */
  RB.gpxPick = function (cb) {
    pickFile('.gpx,application/gpx+xml,text/xml', function (f) {
      if (f.size > 8 * 1024 * 1024) { RB.toast(t('x2_gpx_big'), 'err'); return; }
      var fr = new FileReader(); fr.onerror = function () { RB.toast(t('x2_gpx_bad'), 'err'); };
      fr.onload = function () { var g = L.parseGpx(String(fr.result)); if (!g || g.empty) { RB.toast(t('x2_gpx_bad'), 'err'); return; } cb(g); };
      fr.readAsText(f);
    });
  };

  /* ---------- elenco partecipanti in Excel ---------- */
  RB.exportParticipants = function (run) {
    var head = [t('last_name'), t('first_name'), t('phone'), t('bike'), t('x2_answer'), t('passenger'), t('x2_checked')], ph = RB.can('phones_view');
    var map = { si: t('x2_yes'), no: t('no_go') };
    var rows = RB.signupsOf(run.id).filter(function (s) { return s.status !== 'forse'; }).map(function (s) { var m = RB.mem(s.member_id); return m ? [m.last_name, m.first_name, ph ? m.phone || '' : '', m.bike || '', map[s.status] || s.status, s.passengers ? '+1' : '', s.checked_in ? t('x2_yes') : ''] : null; })
      .filter(Boolean).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
    return RB.xls.exportTable(run.title, head, rows).then(function () { RB.toast(t('exported')); }, function () { RB.toast(t('e_xls'), 'err'); });
  };

  /* righe aggiunte alla scheda del Run */
  RB.runExtras = function (f, r, canSign) {
    if (RB.liveRows) RB.liveRows(f, r);
    var l = h('div', { class: 'list', id: 'x-run-tools' });
    if (r.status !== 'annullato') l.appendChild(RB.row({ lead: RB.icon('clock'), title: t('x2_ics'), sub: t('x2_ics_d'), go: false, onclick: function () { RB.icsDownload(r); } }));
    if (canSign && r.status === 'programmato') l.appendChild(RB.row({ lead: RB.icon('check'), title: t('x2_scan'), sub: t('x2_scan_d'), go: false, onclick: function () { RB.scanSheet(r); } }));
    if (canSign) l.appendChild(RB.row({ lead: RB.icon('file'), title: t('x2_export_p'), sub: t('x2_export_p_d'), go: false, onclick: function () { RB.exportParticipants(r); } }));
    if (r.status === 'programmato' && new Date(r.run_date).getTime() > Date.now() - 3 * 3600000 && (RB.can('signups_manage') || RB.can('runs_edit'))) l.appendChild(RB.row({ lead: RB.icon('share'), title: t('inv_title'), sub: t('inv_row_d'), onclick: function () { RB.inviteSheet(r); } }));
    if (l.children.length) f.appendChild(l);
  };

  /* righe aggiunte in Altro */
  /* guida al primo uso: 3 schermate, si apre da sola una volta e resta in Altro */
  RB.tourSeen = function () { try { return !!localStorage.getItem('rb.tour'); } catch (e) { return true; } };
  RB.tour = function () {
    var n = 0, body = h('div', { id: 'x-tour' }), ctl;
    var STEPS = [[t('tour1_t'), t('tour1_d'), 'check'], [t('tour2_t'), t('tour2_d'), 'alert'], [t('tour3_t'), t('tour3_d'), 'user']];
    function draw() {
      RB.clear(body); var st = STEPS[n];
      body.appendChild(h('div', { class: 'empty' }, RB.icon(st[2]), h('b', null, st[0]), h('p', null, st[1])));
      body.appendChild(h('p', { class: 'sm', style: 'text-align:center' }, (n + 1) + ' / ' + STEPS.length));
      body.appendChild(h('button', { type: 'button', class: 'btn pri', id: 'x-tour-next', onclick: function () { if (n < STEPS.length - 1) { n++; draw(); } else ctl.close(true); } }, n < STEPS.length - 1 ? t('sos_continue') : t('tour_go')));
    }
    ctl = RB.sheet({ title: t('tour_title'), content: body, leftLabel: t('close'), onclose: function () { try { localStorage.setItem('rb.tour', '1'); } catch (e) {} } });
    draw(); return ctl;
  };
  RB.extrasSection = function (root) {
    var l = h('div', { class: 'list', id: 'x-tools' });
    l.appendChild(RB.row({ lead: RB.icon('user'), title: t('x2_card'), sub: t('x2_card_d'), onclick: function () { RB.cardSheet(); } }));
    l.appendChild(RB.row({ lead: RB.icon('route'), title: t('x2_stats'), sub: t('x2_stats_d'), onclick: function () { RB.statsSheet(false); } }));
    if (RB.can('members_view')) l.appendChild(RB.row({ lead: RB.icon('route'), title: t('x2_st_chapter'), sub: t('x2_st_chapter_d'), onclick: function () { RB.statsSheet(true); } }));
    l.appendChild(RB.row({ lead: RB.icon('quote'), title: t('tour_title'), sub: t('tour_sub'), id: 'x-tour-row', onclick: function () { RB.tour(); } }));
    if (RB.can('runs_edit')) {
      l.appendChild(RB.row({ lead: RB.icon('quote'), title: t('x2_notices'), sub: t('x2_notices_d'), onclick: function () { RB.noticesManage(); } }));
      l.appendChild(RB.row({ lead: RB.icon('file'), title: t('x2_import'), sub: t('x2_import_d'), onclick: function () { RB.runImport(); } }));
    }
    root.appendChild(RB.secT(t('x2_tools'))); root.appendChild(l);
  };

  /* ---------- importa Run (e presenze passate) da Excel ---------- */
  RB.runImport = function () {
    var box = h('div', { id: 'x-imp' }), ctl = RB.sheet({ title: t('x2_import'), content: box, full: true, leftLabel: t('close') });
    function step1() {
      RB.clear(box); box.appendChild(h('p', { class: 'sm' }, t('x2_imp_help')));
      box.appendChild(h('button', { type: 'button', class: 'btn ghost', onclick: function () { RB.xls.runTemplate().catch(function () { RB.toast(t('e_xls'), 'err'); }); } }, RB.icon('file'), t('download_template')));
      box.appendChild(h('button', { type: 'button', class: 'btn pri', id: 'x-imp-pick', onclick: function () {
        pickFile('.xlsx,.xls,.csv', function (f) {
          RB.toast(t('reading'));
          RB.xls.readBook(f).then(function (bk) {
            var names = bk.names, runName = names.filter(function (n) { return L.normName(n) === 'run' || L.normName(n) === 'runs'; })[0] || names[0], attName = names.filter(function (n) { return /presenz|attend/.test(L.normName(n)); })[0];
            var res = L.parseRunRows(bk.sheets[runName], attName ? bk.sheets[attName] : null, RB.runs(), RB.members(), Date.now());
            if (res.items.length > 80) { RB.toast(t('e_troppe_righe'), 'err'); return; }
            step2(res);
          }, function () { RB.toast(t('e_xls'), 'err'); });
        });
      } }, RB.icon('file'), t('choose_file')));
    }
    function step2(res) {
      RB.clear(box);
      var ok = res.items.filter(function (i) { return i.ok; }), dup = res.items.filter(function (i) { return i.dup; }), bad = res.items.filter(function (i) { return i.errors.length; });
      var okKeys = {}; ok.forEach(function (i) { okKeys[i.key] = 1; });
      var att = res.att.filter(function (a) { return okKeys[a.key]; });
      box.appendChild(h('div', { class: 'card', id: 'x-imp-sum' }, h('b', null, t('x2_imp_sum', ok.length, dup.length, bad.length)), att.length || res.attErrors.length ? h('p', { class: 'sm' }, t('x2_imp_att', att.length, res.attErrors.length)) : null));
      if (bad.length || res.attErrors.length) {
        var l = h('div', { class: 'list' });
        bad.slice(0, 12).forEach(function (i) { l.appendChild(RB.row({ title: t('x2_row', i.row) + ' · ' + (i.title || '—'), sub: i.errors.map(function (e) { return t('x2_err_' + e); }).join(', '), go: false })); });
        res.attErrors.slice(0, 8).forEach(function (a) { l.appendChild(RB.row({ title: t('x2_att_row', a.row), sub: t('x2_err_' + a.why) + (a.name ? ': ' + a.name : ''), go: false })); });
        box.appendChild(RB.secT(t('x2_imp_issues'))); box.appendChild(l);
      }
      if (!ok.length) { box.appendChild(h('button', { type: 'button', class: 'btn sec', onclick: step1 }, t('x2_imp_again'))); return; }
      var prog = h('div', { class: 'gauge', style: 'display:none' }, h('i', { style: 'width:4%' }));
      var btn = h('button', { type: 'button', class: 'btn pri', id: 'x-imp-go', onclick: function () {
        btn.disabled = true; prog.style.display = '';
        var ids = {}, i = 0, fails = 0;
        (function next() {
          if (i >= ok.length) {
            var items = att.filter(function (a) { return ids[a.key]; }).map(function (a) { return { run: ids[a.key], member: a.member }; });
            var fin = function (n) { RB.sync().then(function () { RB.clear(box); box.appendChild(h('div', { class: 'sos-done', id: 'x-imp-done' }, RB.icon('check'), h('b', null, t('x2_imp_done', ok.length - fails, n)), fails ? h('span', null, t('x2_imp_fails', fails)) : null)); RB.feel('ok'); }); };
            if (items.length) RB.rpc('rc_history_import', { p_code: RB.S.code, p_items: items }).then(function (x) { fin(x && x.ok ? x.count : 0); }); else fin(0);
            return;
          }
          var it = ok[i++]; prog.firstChild.style.width = Math.round(i * 90 / ok.length + 5) + '%';
          RB.rpc('rc_run_save', { p_code: RB.S.code, p: it.run }).then(function (x) { if (x && x.ok) ids[it.key] = x.id; else fails++; next(); });
        })();
      } }, t('x2_imp_go', ok.length));
      box.appendChild(btn); box.appendChild(prog);
    }
    step1(); return ctl;
  };
})();
