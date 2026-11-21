/* Roadbook · Run: elenco, dettaglio, modulo, formazione, foto */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t;

  function isPast(r) { return r.status === 'concluso' || new Date(r.run_date).getTime() < Date.now() - 6 * 3600 * 1000; }
  function mySignup(runId) {
    var me = RB.S.me, a = RB.signupsOf(runId), i;
    for (i = 0; i < a.length; i++) if (a[i].member_id === me.id) return a[i];
    return null;
  }
  var DIFF = { facile: 'diff_facile', media: 'diff_media', impegnativa: 'diff_impegnativa' };

  /* risposta del socio, con aggiornamento immediato e poi conferma dal database */
  RB.respond = function (runId, status, pass) {
    var d = RB.S.d, me = RB.S.me, list = d.signups, i, found = false;
    for (i = 0; i < list.length; i++) if (list[i].run_id === runId && list[i].member_id === me.id) {
      found = true;
      if (status === 'rimuovi') list.splice(i, 1); else { list[i].status = status; list[i].passengers = pass; }
      break;
    }
    if (!found && status !== 'rimuovi') list.push({ run_id: runId, member_id: me.id, status: status, passengers: pass, checked_in: false });
    RB.refresh(); RB.refreshSheets(); RB.feel('tap');
    return RB.write('rc_signup', { p_run: runId, p_status: status, p_passengers: pass, p_member: null }).then(function (r) {
      if (!r.ok) { RB.toast(RB.errMsg(r.error), 'err'); RB.sync(); } else RB.sound('ok');
      return r;
    });
  };

  function respSeg(r, onchange) {
    var mine = mySignup(r.id);
    return RB.seg([{ v: 'si', label: t('yes_go') }, { v: 'no', label: t('no_go') }], mine && mine.status !== 'forse' ? mine.status : '', function (v) {
      var m = mySignup(r.id); RB.respond(r.id, v, m ? m.passengers : 0); if (onchange) onchange();
    }, 'ac');
  }

  /* ---------- elenco ---------- */
  function runCard(r, i) {
    var c = RB.counts(RB.signupsOf(r.id)), dt = new Date(r.run_date), past = isPast(r), off = r.status === 'annullato';
    var chips = h('div', { class: 'chips' });
    if (off) chips.appendChild(RB.chip(t('st_annullato'), 'er'));
    else if (r.status === 'concluso') chips.appendChild(RB.chip(t('st_concluso'), ''));
    if (r.km) chips.appendChild(RB.chip(r.km + ' km', '', 'route'));
    var wc = past ? null : RB.wxChip(r); if (wc) chips.appendChild(wc);
    chips.appendChild(RB.chip(t(DIFF[r.difficulty] || 'diff_media'), 'acc'));
    chips.appendChild(RB.chip(c.total + ' ' + t('persons') + (r.max_participants ? ' / ' + r.max_participants : ''), c.total ? 'ok' : '', 'soci'));
    if (r.formation_published) chips.appendChild(RB.chip(t('formation'), '', 'moto'));
    var me = null;
    if (!off && !past && r.status === 'programmato') me = h('div', { class: 'me', onclick: function (e) { e.stopPropagation(); } }, respSeg(r));
    var card = h('div', { class: 'run' + (off ? ' off' : '') + (i === 0 && !off && !past ? ' hero' : ''), role: 'button', tabindex: '0', style: 'animation-delay:' + Math.min(i, 8) * 40 + 'ms',
      onclick: function () { RB.feel('tap'); RB.openRun(r.id); }, onkeydown: function (e) { if (e.key === 'Enter') RB.openRun(r.id); } },
      h('div', { class: 'dbox' }, h('b', null, dt.getDate()), h('span', null, RB.fmt.month(dt))),
      h('div', { class: 'bd' }, h('h3', null, r.title), h('div', { class: 'wh' }, RB.fmt.time(dt) + (r.meeting_point ? ' · ' + r.meeting_point : '')), chips, me));
    return card;
  }

  /* archivio: Run passati con ricerca, anno e stato; si possono riaprire e richiamare come nuovo Run */
  function archiveFilters(root, past) {
    var A = RB.ui.arch = RB.ui.arch || { q: '', year: '', status: '' }, years = RBL.yearsOf(past);
    var q = h('input', { type: 'search', id: 'ar-q', placeholder: t('ar_search'), autocomplete: 'off', '.value': A.q, oninput: function (e) { A.q = e.target.value; drawList(); } });
    var yr = h('select', { id: 'ar-year', onchange: function (e) { A.year = e.target.value; drawList(); } }, h('option', { value: '' }, t('ar_all_years')), years.map(function (y) { return h('option', { value: String(y), selected: A.year === String(y) ? true : null }, String(y)); }));
    var st = h('select', { id: 'ar-status', onchange: function (e) { A.status = e.target.value; drawList(); } }, h('option', { value: '' }, t('ar_all_status')),
      ['concluso', 'annullato', 'programmato'].map(function (k) { return h('option', { value: k, selected: A.status === k ? true : null }, t('st_' + k)); }));
    root.appendChild(h('div', { class: 'list', style: 'padding:8px;display:flex;gap:8px;flex-wrap:wrap' }, h('div', { class: 'search', style: 'flex:1 1 100%;margin:0' }, q), yr, st));
    var box = h('div'), cnt = h('div', { class: 'sm', style: 'padding:4px 8px' });
    root.appendChild(cnt); root.appendChild(box);
    function drawList() {
      RB.clear(box);
      var ql = A.q.trim().toLowerCase(), rows = past.filter(function (r) {
        return (!A.year || String(new Date(r.run_date).getFullYear()) === A.year) && (!A.status || r.status === A.status) &&
          (!ql || [r.title, r.meeting_point, r.destination, r.description].join(' ').toLowerCase().indexOf(ql) >= 0);
      });
      cnt.textContent = t('ar_count', rows.length);
      if (!rows.length) box.appendChild(RB.empty('run', t('no_past'), ''));
      rows.forEach(function (r, i) { box.appendChild(runCard(r, i)); });
    }
    drawList();
  }

  RB.views.run = function (root) {
    var runs = RB.runs().slice(), next, past;
    next = runs.filter(function (r) { return !isPast(r); }).sort(function (a, b) { return new Date(a.run_date) - new Date(b.run_date); });
    past = runs.filter(isPast).sort(function (a, b) { return new Date(b.run_date) - new Date(a.run_date); });
    root.appendChild(RB.title(t('tab_run'), RB.chapterName(), RB.can('runs_edit') ? RB.iconBtn('plus', t('new_run'), function () { RB.newRun(); }, true) : null));
    root.appendChild(RB.seg([{ v: 'next', label: t('upcoming') + (next.length ? ' (' + next.length + ')' : '') }, { v: 'past', label: t('archive') + (past.length ? ' (' + past.length + ')' : '') }], RB.ui.runTab, function (v) { RB.ui.runTab = v; RB.refresh(); }));
    if (RB.ui.runTab === 'past') { archiveFilters(root, past); return; }
    RB.wxBanners(root, next);
    RB.reviewBanners(root);
    if (!next.length) root.appendChild(RB.empty('run', t('no_runs'), RB.can('runs_edit') ? t('no_runs_staff') : t('no_runs_member')));
    next.forEach(function (r, i) { root.appendChild(runCard(r, i)); });
  };

  /* ---------- dettaglio ---------- */
  RB.openRun = function (id) {
    var state = { photos: null };
    var ctl = RB.sheet({ title: '', full: true });
    function build() {
      var r = RB.run(id);
      if (!r) { ctl.close(true); return; }
      var st = ctl.body.scrollTop;
      ctl.setTitle(r.title);
      ctl.set(buildRun(r, ctl, state));
      ctl.body.scrollTop = st;
    }
    ctl.refresh = build;
    build();
    RB.rpc('rc_run_photos', { p_code: RB.S.code, p_run: id }).then(function (x) { if (x.ok) { state.photos = x.photos; build(); } });
    return ctl;
  };

  function shareRun(r) {
    var dt = new Date(r.run_date);
    var txt = r.title + '\n' + RB.fmt.day(dt) + ' · ' + RB.fmt.time(dt) + (r.meeting_point ? '\n' + r.meeting_point : '') + '\n' + RB.appUrl();
    if (navigator.share) { navigator.share({ title: r.title, text: txt }).catch(function () {}); return; }
    RB.copy(txt).then(function (ok) { RB.toast(ok ? t('copied') : t('e_generic'), ok ? '' : 'err'); });
  }

  /* percorso e tappe: solo organizzatori (route_view) o Run con percorso condiviso con tutti */
  function seeRoute(r) { return RB.can('route_view') || !!r.route_public; }
  function navSection(r, f) {
    if (!seeRoute(r)) return;
    var edit = RB.can('runs_edit'), tool = r.nav_tool || 'both', days = RBL.runDays(r), tools = edit || tool === 'both' ? ['apple', 'google'] : (tool === 'none' ? [] : [tool]), d, any = false;
    if (!tools.length) return;
    if (RB.isApple) tools.sort(function (a, b) { return a === 'apple' ? -1 : b === 'apple' ? 1 : 0; });
    var l = h('div', { class: 'list' });
    for (d = 1; d <= days; d++) {
      var pts = RBL.navPoints(r, days > 1 ? d : undefined);
      if (pts.length < 1) continue;
      any = true;
      var km = RBL.dayKm(r, days > 1 ? d : undefined), pre = days > 1 ? t('day_n', d) + ' · ' : '';
      tools.forEach(function (k) {
        if (k === 'apple') l.appendChild(RB.row({ lead: RB.icon('route'), title: pre + t('nav_open_apple'), sub: t('nav_points_n', pts.length) + (km ? ' · ~' + km + ' km' : ''), href: RBL.appleNav(pts) }));
        else { var g = RBL.googleNav(pts); l.appendChild(RB.row({ lead: RB.icon('route'), title: pre + t('nav_open_google'), sub: (g.dropped ? t('nav_dropped', g.dropped) : t('nav_points_n', pts.length)) + (km ? ' · ~' + km + ' km' : ''), href: g.url })); }
      });
    }
    if (!any) return;
    f.appendChild(RB.secT(t('nav_title')));
    f.appendChild(l);
    if (edit) f.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('nav_staff_note', t('nav_' + tool))));
  }
  function stopLine(s) {
    var label = s.name || s.addr || '';
    return h('li', null, h('i'), h('div', null, s.time ? h('b', null, s.time + ' ') : null, label,
      s.kind && s.kind !== 'altro' ? h('span', { class: 'sm', style: 'margin-left:6px' }, RB.kindLabel(s.kind)) : null,
      s.name && s.addr ? h('a', { class: 'sm', href: RB.mapsUrl(RBL.hasCoords(s) ? s.lat + ',' + s.lng : s.addr), target: '_blank', rel: 'noopener', style: 'display:block;margin:0' }, s.addr) : null));
  }
  function routeSection(r, f) {
    if (!seeRoute(r)) return;
    var days = RBL.runDays(r), d, any = false, card = h('div', { class: 'card', style: 'margin-top:0' });
    for (d = 1; d <= days; d++) {
      var pl = RBL.dayPlaces(r, days > 1 ? d : undefined), km = RBL.dayKm(r, days > 1 ? d : undefined);
      if (!pl.length || (pl.length === 1 && days === 1 && !(r.stops || []).length)) continue;
      any = true;
      if (days > 1) card.appendChild(h('div', { class: 'sec-t', style: 'margin:6px 0' }, h('span', null, t('day_n', d) + (km ? ' · ~' + km + ' km' : '')), RBL.kmWarn(km) ? RB.chip(t('km_over'), 'wa') : null));
      else if (RBL.kmWarn(km) && RB.can('runs_edit')) card.appendChild(h('div', { class: 'banner wa' }, t('km_warn_short', km)));
      var tl = h('ul', { class: 'tl' });
      pl.forEach(function (s) { tl.appendChild(stopLine(s)); });
      card.appendChild(tl);
    }
    if (!any) return;
    f.appendChild(RB.secT(t('stops')));
    f.appendChild(card);
  }

  function buildRun(r, ctl, state) {
    var f = h('div', null), dt = new Date(r.run_date), past = isPast(r), me = RB.S.me, cRun = RB.can('runs_edit'), cFm = RB.can('formation_edit'), cSign = RB.can('signups_manage'), cDraft = RB.can('formation_draft_view');
    var signups = RB.signupsOf(r.id), c = RB.counts(signups), mine = mySignup(r.id);
    if (r.status === 'annullato') f.appendChild(h('div', { class: 'banner er' }, t('run_cancelled')));
    if (r.status === 'concluso') f.appendChild(h('div', { class: 'banner acc' }, t('run_done')));

    var info = h('div', { class: 'list' });
    info.appendChild(RB.row({ lead: RB.icon('clock'), title: RB.fmt.day(dt), sub: RB.fmt.time(dt), go: false }));
    if (r.meeting_point) info.appendChild(RB.row({ lead: RB.icon('pin'), title: t('meeting'), sub: r.meeting_point, href: RB.mapsUrl(r.meeting_point) }));
    if (r.destination) info.appendChild(RB.row({ lead: RB.icon('route'), title: t('destination'), sub: r.destination, href: RB.mapsUrl(r.destination) }));
    if (r.km) info.appendChild(RB.row({ title: t('distance'), value: r.km + ' km', go: false }));
    info.appendChild(RB.row({ title: t('difficulty'), value: t(DIFF[r.difficulty] || 'diff_media'), go: false }));
    if (r.max_participants) info.appendChild(RB.row({ title: t('max_places'), value: String(r.max_participants), go: false }));
    if (RBL.hasFee(r)) {
      var rms = RBL.rooms(r), si = mine && mine.status === 'si';
      info.appendChild(RB.row({ title: t('run_fee'), sub: RB.feeSummary(r), go: false }));
      info.appendChild(RB.row({ title: t('pay_plan'), sub: RB.planText(r), go: false }));
      if (si && RBL.dueOf(r, mine)) RB.feeRows(r, mine).forEach(function (x) { info.appendChild(x); });
    }
    var ru = seeRoute(r) ? RB.safeUrl(r.route_url) : null;
    if (ru) info.appendChild(RB.row({ lead: RB.icon('route'), title: t('route_link'), href: ru }));
    f.appendChild(info);
    if (r.description) f.appendChild(h('div', { class: 'card', style: 'white-space:pre-wrap' }, r.description));

    RB.weatherSection(r, f, ctl);
    routeSection(r, f);
    navSection(r, f);
    RB.runExtras(f, r, cSign);

    /* la mia risposta */
    if (r.status === 'programmato' && !past) {
      f.appendChild(RB.secT(t('my_answer')));
      f.appendChild(h('div', { class: 'card', style: 'margin-top:0' }, respSeg(r)));
      if (mine && mine.status === 'si') {
        var pl = h('div', { class: 'list', style: 'margin-top:10px' }, h('div', { class: 'pass' }, h('span', null, t('passenger')),
          RB.toggle(mine.passengers > 0, function (on) { RB.respond(r.id, 'si', on ? 1 : 0); })));
        f.appendChild(pl);
      }
    }

    RB.reviewCard(f, r);

    /* formazione */
    var fm = r.formation || [];
    if (fm.length || cFm) {
      f.appendChild(RB.secT(t('formation'), cFm ? h('button', { type: 'button', class: 'btn ghost sm2', onclick: function () { RB.formationEditor(r.id); } }, fm.length ? t('edit') : t('create')) : null));
      if (fm.length) {
        RB.ui.fmRun = r.id;
        if ((cFm || cDraft) && !r.formation_published) f.appendChild(h('div', { class: 'banner wa' }, t('fm_hidden')));
        f.appendChild(h('div', { class: 'list' }, RB.formationView(fm)));
      } else f.appendChild(h('div', { class: 'sm', style: 'padding:0 6px' }, t('fm_none')));
    }

    /* partecipanti */
    f.appendChild(RB.secT(t('participants') + ' · ' + c.total, cSign ? h('span', null, c.checked + '/' + c.si + ' ' + t('present')) : null));
    var order = { si: 0, no: 1 }, relTracked = RB.members().some(function (x) { return !!x.release_year; });
    var sorted = signups.filter(function (s) { return s.status === 'si' || s.status === 'no'; }).sort(function (a, b) { return order[a.status] - order[b.status] || RB.fullName(RB.mem(a.member_id)).localeCompare(RB.fullName(RB.mem(b.member_id))); });
    var pl2 = h('div', { class: 'list' });
    sorted.forEach(function (s) {
      var m = RB.mem(s.member_id); if (!m) return;
      var right = [];
      if (s.passengers) right.push(RB.chip('+1', 'acc'));
      var srm = RBL.roomOf(r, s.room), canRoom = cSign && s.status === 'si' && (RBL.rooms(r).length || RBL.extras(r).length), nx = Object.keys(s.extras || {}).reduce(function (a, k) { return a + (RBL.extras(r).some(function (x) { return x.id === k; }) ? Math.floor(+s.extras[k] || 0) : 0); }, 0);
      if (nx && !canRoom) right.push(RB.chip('+' + nx + ' ' + t('extra_short'), 'acc'));
      if (srm || canRoom) {
        var rc = RB.chip((srm ? srm.name : t('room_assign')) + (nx ? ' +' + nx : ''), srm || nx ? 'acc' : 'wa');
        if (canRoom) { rc.setAttribute('role', 'button'); rc.style.cursor = 'pointer'; rc.addEventListener('click', function (e) { e.stopPropagation(); RB.roomPicker(r, m, s); }); }
        right.push(rc);
      }
      if (s.status === 'si' && RB.can('personal_view')) { var dc = RBL.memberDocs(m, r.run_date, relTracked); if (dc.hog === 'expired') right.push(RB.chip(t('doc_hog_expired'), 'er')); if (dc.release === 'missing') right.push(RB.chip(t('doc_release_missing'), 'wa')); }
      if (s.status === 'no') right.push(RB.chip(t('no_go'), 'er'));
      if (cSign && s.status === 'si') right.push(RB.toggle(!!s.checked_in, function (on) {
        s.checked_in = on;
        RB.write('rc_checkin', { p_run: r.id, p_member: m.id, p_value: on }).then(function (x) { if (!x.ok) { RB.toast(RB.errMsg(x.error), 'err'); RB.sync(); } });
      }));
      var row = RB.row({ lead: RB.av(m, 'sm'), title: RB.fullName(m), sub: RB.titleName(m.title), go: false, right: h('span', { class: 'chips', style: 'margin:0;align-items:center' }, right) });
      pl2.appendChild(RB.linkMember(row, m));
    });
    if (!sorted.length) pl2.appendChild(h('div', { class: 'empty', style: 'padding:22px' }, t('no_participants')));
    f.appendChild(pl2);
    if (cSign && r.status === 'programmato') {
      f.appendChild(h('button', { type: 'button', class: 'btn ghost', onclick: function () {
        RB.pickMember({ title: t('add_participant'), list: function () { return RB.members().filter(function (m) { return m.active && !RB.signupsOf(r.id).some(function (s) { return s.member_id === m.id && s.status === 'si'; }); }); },
          onPick: function (m) { RB.write('rc_signup', { p_run: r.id, p_status: 'si', p_passengers: 0, p_member: m.id }).then(function (x) { if (!x.ok) RB.toast(RB.errMsg(x.error), 'err'); else RB.sound('ok'); }); } });
      } }, RB.icon('plus'), t('add_participant')));
    }

    /* foto */
    f.appendChild(RB.secT(t('photos'), h('button', { type: 'button', class: 'btn ghost sm2', onclick: function () { addPhoto(r.id, state, ctl); } }, RB.icon('cam'), t('add'))));
    if (state.photos && state.photos.length) {
      var g = h('div', { class: 'list ph' });
      state.photos.forEach(function (p) { g.appendChild(h('button', { type: 'button', onclick: function () { viewPhoto(p, r.id, state, ctl); } }, h('img', { src: p.data, alt: p.caption || '', loading: 'lazy' }))); });
      f.appendChild(g);
    } else f.appendChild(h('div', { class: 'sm', style: 'padding:0 6px' }, state.photos ? t('no_photos') : '…'));

    /* azioni */
    var acts = h('div', { class: 'list', style: 'margin-top:22px' });
    acts.appendChild(RB.row({ lead: RB.icon('share'), title: t('share'), onclick: function () { shareRun(r); } }));
    if (cRun) {
      acts.appendChild(RB.row({ lead: RB.icon('edit'), title: t('edit_run'), onclick: function () { RB.runForm(r.id); } }));
      acts.appendChild(RB.row({ lead: RB.icon('copy'), title: t('ar_reuse'), sub: t('ar_reuse_sub'), onclick: function () { RB.runForm(r.id, { clone: true }); } }));
      if (r.status === 'programmato') acts.appendChild(RB.row({ title: t('mark_done'), go: false, onclick: function () { setStatus(r, 'concluso'); } }));
      if (r.status !== 'annullato') acts.appendChild(RB.row({ title: t('cancel_run'), go: false, cls: 'dng', onclick: function () { RB.ask({ title: t('cancel_run'), msg: t('cancel_run_msg'), ok: t('cancel_run'), danger: true }).then(function (ok) { if (ok) setStatus(r, 'annullato'); }); } }));
      else acts.appendChild(RB.row({ title: t('reopen_run'), go: false, onclick: function () { setStatus(r, 'programmato'); } }));
      acts.appendChild(RB.row({ lead: RB.icon('trash'), title: t('delete_run'), go: false, cls: 'dng', onclick: function () {
        RB.ask({ title: t('delete_run'), msg: t('delete_run_msg'), ok: t('delete'), danger: true }).then(function (ok) {
          if (ok) RB.write('rc_run_delete', { p_id: r.id }).then(function (x) { if (x.ok) { ctl.close(true); RB.toast(t('deleted')); } else RB.toast(RB.errMsg(x.error), 'err'); });
        });
      } }));
    }
    f.appendChild(acts);
    return f;
  }

  function setStatus(r, status) {
    RB.write('rc_run_save', { p: runPayload(r, { status: status }) }).then(function (x) { if (x.ok) RB.sound('ok'); else RB.toast(RB.errMsg(x.error), 'err'); });
  }
  function runPayload(r, over) {
    var o = { id: r.id, title: r.title, run_date: r.run_date, meeting_point: r.meeting_point || '', destination: r.destination || '', description: r.description || '', km: r.km == null ? '' : String(r.km),
      difficulty: r.difficulty, route_url: r.route_url || '', stops: r.stops || [], meeting: r.meeting || null, dest: r.dest || null, days: RBL.runDays(r), route_public: !!r.route_public, nav_tool: r.nav_tool || 'both', status: r.status, fee: r.fee == null ? '' : String(r.fee), causale: r.causale || '', rooms: r.rooms || [], extras: r.extras || [], installments: r.installments || [], max_participants: r.max_participants == null ? '' : String(r.max_participants) }, k;
    for (k in over) o[k] = over[k];
    return o;
  }

  /* ---------- foto ---------- */
  function addPhoto(runId, state, ctl) {
    RB.pickImage(function (file) {
      RB.resizeImage(file, 1280, 0.72).then(function (data) {
        if (data.length > 390000) return RB.resizeImage(file, 1024, 0.55);
        return data;
      }).then(function (data) {
        if (data.length > 390000) { RB.toast(t('e_foto_non_valida'), 'err'); return; }
        RB.toast(t('uploading'));
        RB.write('rc_run_photo_add', { p_run: runId, p_data: data, p_caption: null }).then(function (x) {
          if (!x.ok) { RB.toast(RB.errMsg(x.error), 'err'); return; }
          RB.rpc('rc_run_photos', { p_code: RB.S.code, p_run: runId }).then(function (y) { if (y.ok) { state.photos = y.photos; if (ctl.refresh) ctl.refresh(); } });
        });
      }, function () { RB.toast(t('e_foto_non_valida'), 'err'); });
    });
  }
  function viewPhoto(p, runId, state, parent) {
    var canDel = RB.can('photos_moderate') || p.member_id === RB.S.me.id;
    var box = h('div', null, h('img', { class: 'bigph', src: p.data, alt: p.caption || '' }),
      p.member_id && RB.mem(p.member_id) ? h('p', { class: 'sm', style: 'text-align:center' }, RB.fullName(RB.mem(p.member_id)) + ' · ' + RB.fmt.full(p.created_at)) : null,
      canDel ? h('button', { type: 'button', class: 'btn dng', onclick: function () {
        RB.ask({ title: t('delete'), msg: t('delete_photo_msg'), ok: t('delete'), danger: true }).then(function (ok) {
          if (!ok) return;
          RB.write('rc_run_photo_delete', { p_id: p.id }).then(function (x) {
            if (!x.ok) { RB.toast(RB.errMsg(x.error), 'err'); return; }
            state.photos = state.photos.filter(function (q) { return q.id !== p.id; });
            for (var i = RB.sheets.length - 1; i >= 0; i--) if (RB.sheets[i].el.classList.contains('photo-view')) RB.sheets[i].close(true);
            if (parent.refresh) parent.refresh();
          });
        });
      } }, RB.icon('trash'), t('delete')) : null);
    RB.sheet({ title: t('photos'), content: box, cls: 'photo-view' });
  }

  /* ---------- modulo run ---------- */
  function nextSunday9() {
    var d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); d.setHours(9, 0, 0, 0); return d.toISOString();
  }
  /* nuovo Run: da zero oppure copiando l'ultimo (come "duplica evento" delle app di eventi) */
  RB.newRun = function () {
    var last = RB.runs().filter(function (r) { return r.status !== 'annullato' && isPast(r); }).sort(function (a, b) { return new Date(b.run_date) - new Date(a.run_date); })[0];
    if (!last) { RB.runForm(null); return; }
    RB.menu(t('new_run'), [
      { label: t('nr_scratch'), fn: function () { RB.runForm(null); } },
      { label: t('nr_copy', last.title), fn: function () { RB.runForm(last.id, { clone: true }); } }]);
  };
  /* l'organizzazione assegna sistemazione ed extra di ogni partecipante */
  RB.roomPicker = function (r, m, s) {
    var ctl, box = h('div');
    function mineS() { return RB.signupsOf(r.id).filter(function (x) { return x.member_id === m.id; })[0] || s; }
    function save(room, extras) {
      var q = { p_run: r.id, p_status: mineS().status, p_passengers: mineS().passengers || 0, p_member: m.id };
      if (room !== undefined) q.p_room = room; if (extras !== undefined) q.p_extras = extras;
      return RB.write('rc_signup', q).then(function (x) { if (!x.ok) RB.toast(RB.errMsg(x.error), 'err'); else RB.sound('tap'); });
    }
    function build() {
      var cs = mineS(); RB.clear(box);
      if (RBL.rooms(r).length) {
        box.appendChild(RB.secT(t('rooms_title')));
        var l = h('div', { class: 'list' });
        RBL.rooms(r).forEach(function (x) { l.appendChild(RB.row({ title: x.name, value: RB.fmt.money(x.price), go: false, right: cs.room === x.id ? RB.icon('check') : null, onclick: function () { cs.room = x.id; save(x.id).then(build); build(); } })); });
        l.appendChild(RB.row({ title: t('room_none'), sub: RBL.runFee(r) ? t('base_fee') + ' ' + RB.fmt.money(RBL.runFee(r)) : '', go: false, right: !cs.room ? RB.icon('check') : null, onclick: function () { cs.room = null; save('').then(build); build(); } }));
        box.appendChild(l);
      }
      if (RBL.extras(r).length) {
        box.appendChild(RB.secT(t('extras_title')));
        var xl = h('div', { class: 'list' }), q = Object.assign({}, cs.extras || {});
        RBL.extras(r).forEach(function (x) {
          var n = Math.floor(+q[x.id] || 0);
          function set(v) { v = Math.max(0, Math.min(20, v)); var o = Object.assign({}, q); if (v) o[x.id] = v; else delete o[x.id]; cs.extras = o; save(undefined, o).then(build); build(); }
          xl.appendChild(h('div', { class: 'row' }, h('span', { class: 'rt' }, h('b', null, x.name), h('span', null, RB.fmt.money(x.price))),
            h('button', { type: 'button', class: 'ib', 'aria-label': '-', onclick: function () { set(n - 1); } }, '−'),
            h('b', { class: 'xq', style: 'min-width:24px;text-align:center' }, String(n)),
            h('button', { type: 'button', class: 'ib', 'aria-label': '+', onclick: function () { set(n + 1); } }, '+')));
        });
        box.appendChild(xl);
      }
      box.appendChild(h('p', { class: 'sm', style: 'text-align:center' }, t('due_total', RB.fmt.money(RBL.dueOf(r, cs)))));
    }
    ctl = RB.sheet({ title: RB.fullName(m), content: box, full: true });
    ctl.refresh = build; build();
  };

  /* riassunto prezzi: quota base, sistemazioni, extra */
  RB.feeSummary = function (r) {
    var bits = [];
    if (RBL.runFee(r)) bits.push((RBL.rooms(r).length ? t('base_fee') + ' ' : '') + RB.fmt.money(RBL.runFee(r)));
    RBL.rooms(r).forEach(function (x) { bits.push(x.name + ' ' + RB.fmt.money(x.price)); });
    if (RBL.extras(r).length) bits.push(RBL.extras(r).map(function (x) { return x.name + ' ' + RB.fmt.money(x.price); }).join(', '));
    return bits.join(' · ') || t('no_fee');
  };
  /* importo di una persona, rate con scadenza e causale del bonifico (con copia) */
  RB.feeRows = function (r, sg) {
    var pi = (RB.S.d.settings && RB.S.d.settings.payment_info) || {}, me = RB.mem(sg.member_id) || RB.S.me, sc = RBL.schedule(r, sg), rm = RBL.roomOf(r, sg.room), rows = [];
    var parts = [];
    if (rm) parts.push(rm.name + ' ' + RB.fmt.money(rm.price));
    else if (RBL.runFee(r)) parts.push(t('base_fee') + ' ' + RB.fmt.money(RBL.runFee(r)));
    if (sg.passengers) parts.push('+1 ' + t('passenger'));
    RBL.extras(r).forEach(function (x) { var q = Math.floor(+((sg.extras || {})[x.id]) || 0); if (q > 0) parts.push(x.name + ' x' + q); });
    rows.push(RB.row({ title: t('my_quota'), sub: parts.join(' · '), value: RB.fmt.money(sc.due), go: false }));
    var tpl = r.causale || pi.causale || '', many = sc.rows.length > 1, bank = (pi.methods || []).indexOf('bonifico') >= 0;
    if (many && tpl && !/\{rata\}/.test(tpl)) tpl += ' {rata}';
    sc.rows.forEach(function (x, i) {
      var cz = RBL.causale(tpl, { run: r.title, cognome: me.last_name, nome: me.first_name, rata: many ? t('rate_k', i + 1, sc.rows.length) : '' });
      rows.push(RB.row({ title: (many ? t('rate_k', i + 1, sc.rows.length) + ' · ' : '') + RB.fmt.money(x.amount), sub: (x.due_on ? t('by_date', RB.fmt.full(x.due_on)) : t('plan_single')) + (bank && cz ? ' · ' + t('causale') + ': ' + cz : ''), go: false,
        right: bank && cz ? h('button', { type: 'button', class: 'btn ghost sm2', 'aria-label': t('copy'), onclick: function () { RB.copy(cz).then(function () { RB.toast(t('copied')); }); } }, RB.icon('copy')) : null }));
    });
    return rows;
  };

  /* sistemazioni (prezzi per persona) e piano di pagamento: tutto deciso dall'organizzazione */
  RB.planText = function (r) {
    var ins = (r.installments || []);
    if (!ins.length) return t('plan_single');
    var today = new Date().toISOString().slice(0, 10);
    return ins.map(function (x) { var d = String(x.due_on).slice(0, 10); return t('plan_row', +x.pct, RB.fmt.full(d)) + (d < today ? ' (' + t('rate_expired') + ')' : ''); }).join(' · ');
  };
  var PRESETS = ['rp_1', 'rp_2', 'rp_3', 'rp_4'];
  function newRoomId() { return 'r' + Math.random().toString(36).slice(2, 8); }
  RB.payEditor = function (ST, done) {
    var causale = ST.causale || '', rooms = ST.rooms.map(function (x) { return Object.assign({}, x); }), extras = ST.extras.map(function (x) { return Object.assign({}, x); }), inst = ST.inst.map(function (x) { return Object.assign({}, x); }), box = h('div'), ctl;
    function sum() { return Math.round(inst.reduce(function (a, x) { return a + (parseFloat(String(x.pct).replace(',', '.')) || 0); }, 0) * 100) / 100; }
    function even() {
      var n = inst.length, base = Math.floor(10000 / n) / 100, i, acc = 0;
      for (i = 0; i < n; i++) { var v = i === n - 1 ? Math.round((100 - acc) * 100) / 100 : base; acc += v; inst[i].pct = String(v); }
    }
    function build() {
      RB.clear(box);
      box.appendChild(RB.secT(t('rooms_title')));
      box.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('rooms_help')));
      var l = h('div', { class: 'list' });
      rooms.forEach(function (x, i) {
        l.appendChild(h('div', { class: 'row pe-room' },
          h('input', { class: 'pe-name', type: 'text', maxlength: 30, value: x.name, 'aria-label': t('room_name'), placeholder: t('room_name'), oninput: function (e) { x.name = e.target.value; } }),
          h('input', { class: 'pe-price', type: 'number', inputmode: 'decimal', step: '0.01', min: 0, value: x.price, 'aria-label': t('room_price'), placeholder: '€', oninput: function (e) { x.price = e.target.value; } }),
          h('button', { type: 'button', class: 'ib', 'aria-label': t('delete'), onclick: function () { rooms.splice(i, 1); build(); } }, RB.icon('trash'))));
      });
      if (rooms.length) box.appendChild(l);
      var chips = h('div', { class: 'chips', style: 'margin:8px 0' });
      if (rooms.length < 8) {
        PRESETS.forEach(function (k) { if (!rooms.some(function (x) { return x.name === t(k); })) chips.appendChild(h('button', { type: 'button', class: 'kchip pe-preset', onclick: function () { rooms.push({ id: newRoomId(), name: t(k), price: '' }); build(); } }, '+ ' + t(k))); });
        chips.appendChild(h('button', { type: 'button', class: 'kchip pe-other', onclick: function () { rooms.push({ id: newRoomId(), name: '', price: '' }); build(); } }, '+ ' + t('room_other')));
      }
      box.appendChild(chips);

      box.appendChild(RB.secT(t('extras_title')));
      box.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('extras_help')));
      var el = h('div', { class: 'list' });
      extras.forEach(function (x, i) {
        el.appendChild(h('div', { class: 'row pe-extra' },
          h('input', { class: 'pe-ename', type: 'text', maxlength: 30, value: x.name, 'aria-label': t('room_name'), placeholder: t('room_name'), oninput: function (e) { x.name = e.target.value; } }),
          h('input', { class: 'pe-eprice', type: 'number', inputmode: 'decimal', step: '0.01', min: 0, value: x.price, 'aria-label': t('room_price'), placeholder: '€', oninput: function (e) { x.price = e.target.value; } }),
          h('button', { type: 'button', class: 'ib', 'aria-label': t('delete'), onclick: function () { extras.splice(i, 1); build(); } }, RB.icon('trash'))));
      });
      if (extras.length) box.appendChild(el);
      var echips = h('div', { class: 'chips', style: 'margin:8px 0' });
      if (extras.length < 8) {
        ['xp_1', 'xp_2', 'xp_3'].forEach(function (k) { if (!extras.some(function (x) { return x.name === t(k); })) echips.appendChild(h('button', { type: 'button', class: 'kchip pe-xpreset', onclick: function () { extras.push({ id: newRoomId(), name: t(k), price: '' }); build(); } }, '+ ' + t(k))); });
        echips.appendChild(h('button', { type: 'button', class: 'kchip pe-xother', onclick: function () { extras.push({ id: newRoomId(), name: '', price: '' }); build(); } }, '+ ' + t('room_other')));
      }
      box.appendChild(echips);

      box.appendChild(RB.secT(t('pay_plan')));
      box.appendChild(RB.seg([{ v: 'one', label: t('pay_one') }, { v: 'rates', label: t('pay_rates') }], inst.length ? 'rates' : 'one', function (v) {
        if (v === 'one') inst = []; else if (!inst.length) { inst = [{ due_on: '', pct: '50' }, { due_on: '', pct: '50' }]; }
        build();
      }));
      if (inst.length) {
        var rl = h('div', { class: 'list', style: 'margin-top:12px' });
        inst.forEach(function (x, i) {
          rl.appendChild(h('div', { class: 'row pe-rate' },
            h('input', { class: 'pe-date', type: 'date', value: x.due_on, 'aria-label': t('rate_date'), oninput: function (e) { x.due_on = e.target.value; } }),
            h('input', { class: 'pe-pct', type: 'number', inputmode: 'decimal', step: '0.01', min: 0, max: 100, value: x.pct, 'aria-label': '%', oninput: function (e) { x.pct = e.target.value; tot.textContent = t('rates_sum', sum()); tot.className = 'sm' + (Math.abs(sum() - 100) > 0.01 ? ' err-t' : ''); } }),
            h('span', null, '%'),
            inst.length > 2 ? h('button', { type: 'button', class: 'ib', 'aria-label': t('delete'), onclick: function () { inst.splice(i, 1); build(); } }, RB.icon('trash')) : null));
        });
        box.appendChild(rl);
        var tot = h('div', { class: 'sm' + (Math.abs(sum() - 100) > 0.01 ? ' err-t' : ''), style: 'padding:6px 8px' }, t('rates_sum', sum()));
        box.appendChild(tot);
        var row = h('div', { class: 'chips' });
        if (inst.length < 6) row.appendChild(h('button', { type: 'button', class: 'kchip pe-addrate', onclick: function () { inst.push({ due_on: '', pct: '' }); even(); build(); } }, '+ ' + t('add_rate')));
        row.appendChild(h('button', { type: 'button', class: 'kchip pe-even', onclick: function () { even(); build(); } }, t('rate_even')));
        box.appendChild(row);
      }
      box.appendChild(RB.secT(t('run_causale')));
      var cin = RB.input('pe-causale', causale, { max: 120, ph: t('run_causale_ph') }); cin.addEventListener('input', function () { causale = cin.value; });
      box.appendChild(h('div', { class: 'list' }, RB.field(t('causale'), cin)));
      box.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('causale_help')));
    }
    ctl = RB.sheet({ title: t('pay_setup'), content: box, full: true, leftLabel: t('cancel'),
      right: { label: t('done'), fn: function () {
        var seen = {};
        for (var i = 0; i < rooms.length; i++) {
          var pr = parseFloat(String(rooms[i].price).replace(',', '.'));
          if (!rooms[i].name.trim() || !isFinite(pr) || pr < 0 || pr > 9999 || seen[rooms[i].name.trim().toLowerCase()]) { RB.toast(t('e_rooms'), 'err'); return; }
          seen[rooms[i].name.trim().toLowerCase()] = 1;
        }
        var seenX = {};
        for (var j = 0; j < extras.length; j++) {
          var xp = parseFloat(String(extras[j].price).replace(',', '.')), nm = extras[j].name.trim().toLowerCase();
          if (!nm || !isFinite(xp) || xp < 0 || xp > 9999 || seenX[nm]) { RB.toast(t('e_rooms'), 'err'); return; }
          seenX[nm] = 1;
        }
        if (inst.length && (Math.abs(sum() - 100) > 0.01 || inst.some(function (x) { return !x.due_on || !(parseFloat(String(x.pct).replace(',', '.')) > 0); }))) { RB.toast(t('e_rates'), 'err'); return; }
        ST.rooms = rooms; ST.extras = extras; ST.inst = inst; ST.causale = causale.trim(); ctl.close(true); if (done) done();
      } } });
    ctl.refresh = null; build();
  };

  RB.runForm = function (id, opts) {
    var r = id ? RB.run(id) : null;
    if (r && opts && opts.clone) r = Object.assign({}, r, { id: null, status: 'programmato', run_date: nextSunday9(), km: r.km, formation: [], formation_published: false, title: r.title });
    var ST = { causale: r ? r.causale || '' : '', rooms: r ? RBL.rooms(r).map(function (x) { return { id: x.id, name: x.name, price: String(x.price) }; }) : [], extras: r ? RBL.extras(r).map(function (x) { return { id: x.id, name: x.name, price: String(x.price) }; }) : [], inst: r && !(opts && opts.clone) ? (r.installments || []).map(function (x) { return { due_on: String(x.due_on).slice(0, 10), pct: String(x.pct) }; }) : [], days: r ? RBL.runDays(r) : 1, day: 1, dismissed: {}, dismissedOver: {}, kmTouched: !!(r && r.km), pub: !!(r && r.route_public) };
    var meeting = r ? (r.meeting || (r.meeting_point ? { name: '', addr: r.meeting_point, kind: 'altro' } : null)) : null;
    var dest = r ? (r.dest || (r.destination ? { name: '', addr: r.destination, kind: 'altro' } : null)) : null;
    var stops = r && r.stops ? r.stops.map(function (s) { return { time: s.time || '', name: s.name || '', addr: s.addr || '', kind: s.kind || 'altro', lat: s.lat, lng: s.lng, day: parseInt(s.day, 10) || 1, end: !!s.end }; }) : [];
    var diff = r ? r.difficulty : 'media', status = r ? r.status : 'programmato', nav = r ? r.nav_tool || 'both' : 'both';
    var box = h('div', null), panel = h('div'), tabs = h('div'), durBox = h('div'), kmInfo = h('div'), routed = {};

    function snapshot() { return { meeting: meeting, dest: dest, days: ST.days, stops: stops.map(function (s) { return s; }) }; }
    function dayKmOf(d) { return routed[d] != null ? routed[d] : RBL.dayKm(snapshot(), ST.days > 1 ? d : undefined); }
    function totalKm() { var d, sum = 0, ok = false; for (d = 1; d <= ST.days; d++) { var k = dayKmOf(d); if (k != null) { sum += k; ok = true; } } return ok ? sum : null; }
    function syncKm() {
      var k = totalKm(), el = document.getElementById('rf-km');
      if (el && !ST.kmTouched && k != null) el.value = k;
    }
    function endStop(d) { var i; for (i = 0; i < stops.length; i++) if (stops[i].end && stops[i].day === d) return stops[i]; return null; }
    function setEnd(d, p) {
      var e = endStop(d);
      if (!p) { if (e) stops.splice(stops.indexOf(e), 1); return; }
      if (e) { e.name = p.name; e.addr = p.addr; e.kind = p.kind; e.lat = p.lat; e.lng = p.lng; }
      else stops.push({ time: '', name: p.name, addr: p.addr, kind: p.kind, lat: p.lat, lng: p.lng, day: d, end: true });
    }
    function setDays(n) {
      n = Math.max(1, Math.min(30, n));
      if (n < ST.days) {
        stops = stops.filter(function (s) { return s.day <= n && !(s.end && s.day >= n); });
      }
      ST.days = n; if (ST.day > n) ST.day = n; routed = {};
      drawAll();
    }
    function addDayAfterEnd() {
      /* il vecchio arrivo finale diventa l'arrivo della giornata, la nuova destinazione va scelta */
      var d = ST.days;
      if (d >= 14) return;
      if (dest) setEnd(d, dest);
      dest = null; ST.days = d + 1; ST.day = d + 1; routed = {};
      drawAll();
    }
    function endOfDayCheck(d) {
      /* a fine tappa: ricordare che forse conviene pensare al giorno dopo; sopra i 500 km lo dice chiaramente */
      var km = dayKmOf(d), over = RBL.kmWarn(km);
      if (d !== ST.days || ST.days >= 30 || (over ? ST.dismissedOver[d] : ST.dismissed[d])) return;
      RB.ask({ title: t('end_day_title', d), msg: over ? t('km_warn', d, km) + ' ' + t('end_day_q') : (km ? t('end_day_km', km) + ' ' : '') + t('end_day_q'), ok: t('end_day_yes'), no: t('end_day_no') }).then(function (yes) {
        ST.dismissed[d] = true; if (over) ST.dismissedOver[d] = true;
        if (yes) addDayAfterEnd(); else drawPanel();
      });
    }
    function changedAll() { routed = {}; drawPanel(); drawKm(); syncKm(); }

    function stopCard(s, i) {
      var holder = h('div', { class: 'stopc' });
      var pr = RB.placeRow({ label: t('stop_n', i + 1), kinds: RBL.PLACE_KINDS, get: function () { return s.name || s.addr ? s : null; },
        set: function (p) { s.name = p.name; s.addr = p.addr; s.kind = p.kind; s.lat = p.lat; s.lng = p.lng; }, changed: function () { changedAll(); } });
      holder.appendChild(h('div', { class: 'stop-h' },
        h('input', { type: 'time', '.value': s.time, 'aria-label': t('stop_time'), oninput: function (e) { s.time = e.target.value; } }),
        h('button', { type: 'button', class: 'ib', 'aria-label': t('delete'), onclick: function () { stops.splice(stops.indexOf(s), 1); changedAll(); } }, RB.icon('x'))));
      holder.appendChild(pr);
      return holder;
    }
    function drawPanel() {
      RB.clear(panel);
      var d = ST.day, multi = ST.days > 1, last = d === ST.days;
      if (!multi || d === 1) {
        panel.appendChild(RB.placeRow({ label: t('meeting'), kinds: ['area', 'bar', 'altro'], withFungo: true, get: function () { return meeting; }, set: function (p) { meeting = p; }, changed: function () { changedAll(); } }));
      } else {
        var from = endStop(d - 1) || meeting;
        panel.appendChild(h('div', { class: 'list' }, RB.row({ lead: RB.icon('pin'), title: t('day_start'), sub: from ? RB.placeLabel(from) : t('pp_choose'), go: false })));
      }
      panel.appendChild(RB.secT(t('stops'), h('span', { style: 'display:flex;gap:6px' }, h('button', { type: 'button', class: 'btn ghost sm2', id: 'rf-gpx', onclick: function () { RB.gpxPick(function (g) { g.stops.forEach(function (p) { if (stops.length < 40) stops.push({ time: '', name: p.name, addr: '', kind: 'altro', lat: p.lat, lng: p.lng, day: d, end: false }); }); if (g.km && !ST.kmTouched) { var kk = document.getElementById('rf-km'); if (kk && !kk.value) kk.value = g.km; } drawPanel(); RB.toast(t('x2_gpx_ok', g.stops.length)); }); } }, 'GPX'), h('button', { type: 'button', class: 'btn ghost sm2', onclick: function () { if (stops.length < 40) { stops.push({ time: '', name: '', addr: '', kind: 'altro', day: d, end: false }); drawPanel(); } } }, RB.icon('plus'), t('add')))));
      var mine = stops.filter(function (s) { return s.day === d && !s.end; });
      if (!mine.length) panel.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('stops_none')));
      mine.forEach(function (s, i) { panel.appendChild(stopCard(s, i)); });
      if (!last) {
        var e = endStop(d);
        panel.appendChild(RB.secT(t('day_end', d)));
        panel.appendChild(RB.placeRow({ label: t('day_end', d), kinds: ['hotel', 'agri', 'ristorante', 'altro', 'area', 'hd', 'bar'], get: function () { return e || endStop(d); }, set: function (p) { setEnd(d, p); }, changed: function () { changedAll(); } }));
      } else {
        panel.appendChild(RB.secT(t('destination')));
        panel.appendChild(RB.placeRow({ label: t('destination'), kinds: RBL.PLACE_KINDS, get: function () { return dest; }, set: function (p) { dest = p; },
          changed: function () { changedAll(); endOfDayCheck(d); } }));
      }
      var km = dayKmOf(d);
      if (RBL.kmWarn(km)) {
        var wb = h('div', { class: 'banner wa' }, t('km_warn', d, km));
        if (last && ST.days < 30) wb.appendChild(h('button', { type: 'button', class: 'btn sec sm2', style: 'margin-top:8px;display:block', onclick: addDayAfterEnd }, RB.icon('plus'), t('end_day_yes')));
        panel.appendChild(wb);
      }
    }
    function drawKm() {
      RB.clear(kmInfo);
      var d, parts = [];
      for (d = 1; d <= ST.days; d++) { var k = dayKmOf(d); if (k != null) parts.push((ST.days > 1 ? t('day_n', d) + ': ' : '') + (routed[d] != null ? '' : '~') + k + ' km'); }
      kmInfo.appendChild(h('div', { class: 'sm', style: 'padding:6px 8px' }, parts.length ? parts.join(' · ') : t('km_unknown')));
      kmInfo.appendChild(h('button', { type: 'button', class: 'btn sec sm2', id: 'rf-calc', style: 'margin:0 6px 6px', onclick: calcRoad }, RB.icon('route'), t('km_calc')));
      if (panel.firstChild) { /* il banner nel pannello dipende dai km */ }
    }
    function calcRoad() {
      var d, jobs = [];
      for (d = 1; d <= ST.days; d++) (function (day) {
        var u = RBL.dayPlaces(snapshot(), ST.days > 1 ? day : undefined);
        jobs.push(RB.geo.route(u).then(function (k) { if (k != null) routed[day] = k; }));
      })(d);
      Promise.all(jobs).then(function () {
        if (!Object.keys(routed).length) RB.toast(t('km_calc_fail'), 'err'); else { ST.kmTouched = false; syncKm(); drawPanel(); }
        drawKm();
      });
    }
    function drawTabs() {
      RB.clear(tabs); RB.clear(durBox);
      durBox.appendChild(h('div', { class: 'list' }, h('div', { class: 'row' }, h('span', { class: 'rt' }, h('b', null, t('days_count'))),
        h('button', { type: 'button', class: 'ib', id: 'rf-dm', 'aria-label': '-', onclick: function () { setDays(ST.days - 1); } }, '−'),
        h('b', { id: 'rf-days', style: 'min-width:24px;text-align:center' }, String(ST.days)),
        h('button', { type: 'button', class: 'ib', id: 'rf-dp', 'aria-label': '+', onclick: function () { setDays(ST.days + 1); } }, '+'))));
      if (ST.days > 1) {
        var bar = h('div', { class: 'kbar' }), d;
        for (d = 1; d <= ST.days; d++) (function (n) {
          bar.appendChild(h('button', { type: 'button', class: 'kchip' + (n === ST.day ? ' on' : ''), 'data-day': n, onclick: function () { ST.day = n; drawTabs(); drawPanel(); } }, t('day_n', n)));
        })(d);
        tabs.appendChild(bar);
      }
    }
    function drawAll() { drawTabs(); drawPanel(); drawKm(); syncKm(); }

    var kmInput = RB.input('rf-km', r && r.km != null ? r.km : '', { type: 'number', mode: 'numeric', min: 0 });
    kmInput.addEventListener('input', function () { ST.kmTouched = true; });
    var payHold = h('div');
    function drawPay() {
      RB.clear(payHold);
      var bits = [];
      if (ST.rooms.length) bits.push(ST.rooms.length + ' ' + t('rooms_n'));
      if (ST.extras.length) bits.push(ST.extras.length + ' ' + t('extras_n'));
      bits.push(ST.inst.length ? ST.inst.length + ' ' + t('rates_n') : t('plan_single'));
      payHold.appendChild(RB.row({ title: t('pay_setup'), sub: bits.join(' · '), id: 'rf-pay', onclick: function () { RB.payEditor(ST, drawPay); } }));
    }
    var fields = h('div', { class: 'list' },
      RB.field(t('f_title'), RB.input('rf-title', r ? r.title : '', { ph: t('f_title_ph'), max: 80 })),
      RB.field(t('f_datetime'), RB.input('rf-dt', RB.localInput(r ? r.run_date : nextSunday9()), { type: 'datetime-local' })),
      RB.field(t('distance') + ' (km)', kmInput),
      RB.field(t('run_fee') + ' (€)', RB.input('rf-fee', r && r.fee != null ? r.fee : '', { type: 'number', mode: 'decimal', step: '0.01', min: 0, ph: t('run_fee_ph') })),
      payHold);
    drawPay();
    var more = h('div', { class: 'more' }), moreOpen = !!(r && r.id) || !!(opts && opts.clone);
    more.appendChild(h('div', { class: 'list' },
      RB.field(t('max_places'), RB.input('rf-max', r && r.max_participants != null ? r.max_participants : '', { type: 'number', mode: 'numeric', min: 1, ph: t('no_limit') })),
      RB.field(t('route_link'), RB.input('rf-url', r ? r.route_url : '', { type: 'url', ph: 'https://' }))));
    box.appendChild(fields);
    box.appendChild(h('p', { class: 'sm', style: 'padding:6px 8px' }, t('route_org_only')));
    box.appendChild(RB.secT(t('route_title')));
    box.appendChild(durBox); box.appendChild(tabs); box.appendChild(panel); box.appendChild(kmInfo);
    box.appendChild(h('div', { class: 'list', style: 'margin-top:12px' }, h('div', { class: 'row' }, h('span', { class: 'rt' }, h('b', null, t('route_public')), h('span', null, t('route_public_help'))), RB.toggle(ST.pub, function (v) { ST.pub = v; }))));
    more.appendChild(RB.secT(t('difficulty')));
    more.appendChild(RB.seg([{ v: 'facile', label: t('diff_facile') }, { v: 'media', label: t('diff_media') }, { v: 'impegnativa', label: t('diff_impegnativa') }], diff, function (v) { diff = v; }));
    if (r && r.id) { more.appendChild(RB.secT(t('status'))); more.appendChild(RB.seg([{ v: 'programmato', label: t('st_programmato') }, { v: 'annullato', label: t('st_annullato') }, { v: 'concluso', label: t('st_concluso') }], status, function (v) { status = v; })); }
    more.appendChild(RB.secT(t('nav_tool')));
    more.appendChild(RB.seg([{ v: 'apple', label: t('nav_apple') }, { v: 'google', label: t('nav_google') }, { v: 'both', label: t('nav_both') }, { v: 'none', label: t('nav_none') }], nav, function (v) { nav = v; }));
    more.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('nav_help')));
    more.appendChild(h('div', { class: 'list', style: 'margin-top:14px' }, RB.field(t('f_notes'), h('textarea', { id: 'rf-desc', maxlength: 1500, '.value': r ? r.description || '' : '' }))));
    var moreBtn = h('button', { type: 'button', class: 'btn sec', id: 'rf-more', style: 'margin-top:14px', onclick: function () { moreOpen = !moreOpen; showMore(); } });
    function showMore() { more.style.display = moreOpen ? '' : 'none'; moreBtn.textContent = moreOpen ? t('less_options') : t('more_options'); moreBtn.setAttribute('aria-expanded', moreOpen ? 'true' : 'false'); }
    box.appendChild(moreBtn); box.appendChild(more); showMore();
    drawAll();
    var ctl = RB.sheet({ title: r && r.id ? t('edit_run') : t('new_run'), content: box, full: true, leftLabel: t('cancel'),
      right: { label: t('save'), fn: function () {
        var title = RB.val('rf-title'), dtv = RB.val('rf-dt');
        if (!title || !dtv) { RB.toast(t('e_dati_mancanti'), 'err'); return; }
        var url = RB.val('rf-url');
        if (url && !RB.safeUrl(url)) { RB.toast(t('e_link_non_valido'), 'err'); return; }
        var out = [], d;
        for (d = 1; d <= ST.days; d++) {
          stops.filter(function (s) { return s.day === d && !s.end && (s.name.trim() || s.addr.trim()); }).forEach(function (s) { out.push(stopOut(s)); });
          var e = endStop(d); if (d < ST.days && e && (e.name || e.addr)) out.push(stopOut(e));
        }
        var p = { id: r ? r.id : null, title: title, run_date: new Date(dtv).toISOString(), meeting_point: '', destination: '', meeting: meeting, dest: dest, days: ST.days, route_public: ST.pub,
          description: RB.val('rf-desc'), km: RB.val('rf-km'), difficulty: diff, route_url: url, nav_tool: nav, status: status, max_participants: RB.val('rf-max'), fee: RB.val('rf-fee').replace(',', '.'), causale: ST.causale, rooms: ST.rooms.map(function (x) { return { id: x.id, name: x.name.trim(), price: String(x.price).replace(',', '.') }; }), extras: ST.extras.map(function (x) { return { id: x.id, name: x.name.trim(), price: String(x.price).replace(',', '.') }; }), installments: ST.inst.map(function (x) { return { due_on: x.due_on, pct: String(x.pct).replace(',', '.') }; }), stops: out };
        RB.act(ctl.right, function () { return RB.geo.withTimes(p).then(function (q) { return RB.write('rc_run_save', { p: q }); }); }, t('saved')).then(function (x) { if (x && x.ok) ctl.close(true); });
      } } });
    return ctl;
  };
  function stopOut(s) {
    var o = { time: s.time, name: s.name.trim(), addr: s.addr.trim(), kind: s.kind || 'altro', day: s.day };
    if (RBL.hasCoords(s)) { o.lat = s.lat; o.lng = s.lng; }
    if (s.end) o.end = true;
    return o;
  }

  /* ---------- formazione ---------- */
  var KIND = { road_captain: 'k_rc', safety: 'k_safety', scopa: 'k_scopa', socio: 'k_socio' };
  RB.formationView = function (fm) {
    var g = h('div', { class: 'fm' });
    fm.forEach(function (s, i) {
      var m = s.member_id ? RB.mem(s.member_id) : null, pass = m ? (RB.signupsOf(RB.ui.fmRun || '').filter(function (x) { return x.member_id === m.id; })[0] || {}).passengers : 0;
      g.appendChild(h('div', { class: 'sl ' + s.kind + (m ? '' : ' empty0') }, h('span', { class: 'n' }, i + 1),
        h('span', { class: 'nm' }, h('small', null, t(KIND[s.kind])), m ? h('b', { class: 'fmn', style: 'font-weight:inherit;cursor:pointer', role: 'button', tabindex: '0', onclick: function (e) { e.stopPropagation(); RB.feel('tap'); RB.memberCard(m); } }, RB.fullName(m) + (pass ? ' +1' : '')) : t('to_assign'))));
    });
    return g;
  };

  RB.formationEditor = function (runId) {
    var r = RB.run(runId); if (!r) return;
    var slots = (r.formation || []).map(function (s) { return { kind: s.kind, member_id: s.member_id || null }; }), publish = !!r.formation_published;
    var box = h('div', { class: 'fe' }), prev = h('div'), listBox = h('div', { class: 'list' });
    RB.ui.fmRun = runId;
    function used() { var o = {}; slots.forEach(function (s) { if (s.member_id) o[s.member_id] = 1; }); return o; }
    function draw() {
      RB.clear(listBox); RB.clear(prev);
      if (!slots.length) listBox.appendChild(h('div', { class: 'empty', style: 'padding:24px' }, t('fm_empty')));
      slots.forEach(function (s, i) {
        var m = s.member_id ? RB.mem(s.member_id) : null;
        var mv = h('span', { class: 'mv' },
          h('button', { type: 'button', 'aria-label': t('move_up'), disabled: i === 0, onclick: function (e) { e.stopPropagation(); swap(i, i - 1); } }, RB.icon('up')),
          h('button', { type: 'button', 'aria-label': t('move_down'), disabled: i === slots.length - 1, onclick: function (e) { e.stopPropagation(); swap(i, i + 1); } }, RB.icon('down')));
        listBox.appendChild(RB.row({ lead: h('span', { class: 'pos' }, i + 1), title: m ? RB.fullName(m) : t('to_assign'), sub: null, go: false,
          right: h('span', { style: 'display:flex;gap:8px;align-items:center' }, h('span', { class: 'tag ' + s.kind }, t(KIND[s.kind])), mv),
          onclick: function () { slotMenu(i); } }));
      });
      if (slots.length) prev.appendChild(RB.secT(t('preview'))), prev.appendChild(h('div', { class: 'list' }, RB.formationView(slots)));
    }
    function swap(a, b) { var x = slots[a]; slots[a] = slots[b]; slots[b] = x; RB.feel('tap'); draw(); }
    function assign(i) {
      RB.pickMember({ title: t('assign_person'), list: function () { var u = used(); return RB.members().filter(function (m) { return m.active && (!u[m.id] || slots[i].member_id === m.id); }); },
        onPick: function (m) { slots[i].member_id = m.id; draw(); } });
    }
    function slotMenu(i) {
      RB.menu(t('position') + ' ' + (i + 1), [
        { label: t('assign_person'), fn: function () { assign(i); } },
        slots[i].member_id ? { label: t('unassign'), fn: function () { slots[i].member_id = null; draw(); } } : null,
        { label: t('k_rc'), fn: function () { slots[i].kind = 'road_captain'; draw(); } },
        { label: t('k_safety'), fn: function () { slots[i].kind = 'safety'; draw(); } },
        { label: t('k_socio'), fn: function () { slots[i].kind = 'socio'; draw(); } },
        { label: t('k_scopa'), fn: function () { slots[i].kind = 'scopa'; draw(); } },
        { label: t('remove'), danger: true, fn: function () { slots.splice(i, 1); draw(); } }]);
    }
    function addMenu() {
      RB.menu(t('add'), [
        { label: t('add_from_participants'), fn: function () {
          RB.pickMember({ title: t('participants'), multi: true,
            list: function () { var u = used(); return RB.signupsOf(runId).filter(function (s) { return s.status === 'si' && !u[s.member_id]; }).map(function (s) { return RB.mem(s.member_id); }).filter(Boolean); },
            onPick: function (m) { slots.splice(Math.max(0, slots.length - (slots.length && slots[slots.length - 1].kind === 'scopa' ? 1 : 0)), 0, { kind: m.title === 'road_captain' || m.title === 'head_road_captain' ? 'road_captain' : m.title === 'safety' ? 'safety' : 'socio', member_id: m.id }); draw(); } });
        } },
        { label: t('add_anyone'), fn: function () {
          RB.pickMember({ title: t('tab_soci'), multi: true, list: function () { var u = used(); return RB.members().filter(function (m) { return m.active && !u[m.id]; }); },
            onPick: function (m) { slots.push({ kind: 'socio', member_id: m.id }); draw(); } });
        } },
        { label: t('add_safety'), fn: function () { slots.splice(Math.max(0, slots.length - 1), 0, { kind: 'safety', member_id: null }); draw(); } },
        { label: t('add_scopa'), fn: function () { slots.push({ kind: 'scopa', member_id: null }); draw(); } }]);
    }
    function auto() {
      var run = function () {
        var people = RB.signupsOf(runId).filter(function (s) { return s.status === 'si'; }).map(function (s, k) { var m = RB.mem(s.member_id); return m ? { id: m.id, title: m.title, joined_on: m.joined_on, order: k } : null; }).filter(Boolean);
        slots = RBL.autoFormation(people); draw(); RB.sound('ok');
      };
      if (slots.length) RB.ask({ title: t('auto_fm'), msg: t('auto_fm_msg'), ok: t('auto_fm') }).then(function (ok) { if (ok) run(); }); else run();
    }
    box.appendChild(h('div', { class: 'sm' }, t('fm_help')));
    box.appendChild(h('div', { style: 'display:flex;gap:8px' },
      h('button', { type: 'button', class: 'btn ghost', style: 'margin-top:6px', onclick: auto }, t('auto_fm')),
      h('button', { type: 'button', class: 'btn ghost', style: 'margin-top:6px', onclick: addMenu }, RB.icon('plus'), t('add'))));
    box.appendChild(RB.secT(t('positions')));
    box.appendChild(listBox);
    box.appendChild(h('div', { class: 'list', style: 'margin-top:14px' }, h('div', { class: 'pass' }, h('span', null, t('fm_publish')), RB.toggle(publish, function (on) { publish = on; }))));
    box.appendChild(prev);
    draw();
    var ctl = RB.sheet({ title: t('formation'), content: box, full: true, leftLabel: t('cancel'),
      right: { label: t('save'), fn: function () {
        RB.act(ctl.right, function () { return RB.write('rc_formation_save', { p_run: runId, p_formation: slots, p_publish: publish }); }, t('saved')).then(function (x) { if (x && x.ok) ctl.close(true); });
      } } });
    return ctl;
  };
})();
