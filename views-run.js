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
    return RB.seg([{ v: 'si', label: t('yes_go') }, { v: 'forse', label: t('maybe') }, { v: 'no', label: t('no_go') }], mine ? mine.status : '', function (v) {
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
    chips.appendChild(RB.chip(t(DIFF[r.difficulty] || 'diff_media'), 'acc'));
    chips.appendChild(RB.chip(c.total + ' ' + t('persons') + (r.max_participants ? ' / ' + r.max_participants : ''), c.total ? 'ok' : '', 'soci'));
    if (r.formation_published) chips.appendChild(RB.chip(t('formation'), '', 'moto'));
    var me = null;
    if (!off && !past && r.status === 'programmato') me = h('div', { class: 'me', onclick: function (e) { e.stopPropagation(); } }, respSeg(r));
    var card = h('div', { class: 'run' + (off ? ' off' : ''), role: 'button', tabindex: '0', style: 'animation-delay:' + Math.min(i, 8) * 40 + 'ms',
      onclick: function () { RB.feel('tap'); RB.openRun(r.id); }, onkeydown: function (e) { if (e.key === 'Enter') RB.openRun(r.id); } },
      h('div', { class: 'dbox' }, h('b', null, dt.getDate()), h('span', null, RB.fmt.month(dt))),
      h('div', { class: 'bd' }, h('h3', null, r.title), h('div', { class: 'wh' }, RB.fmt.time(dt) + (r.meeting_point ? ' · ' + r.meeting_point : '')), chips, me));
    return card;
  }

  RB.views.run = function (root) {
    var runs = RB.runs().slice(), next, past;
    next = runs.filter(function (r) { return !isPast(r); }).sort(function (a, b) { return new Date(a.run_date) - new Date(b.run_date); });
    past = runs.filter(isPast).sort(function (a, b) { return new Date(b.run_date) - new Date(a.run_date); });
    root.appendChild(RB.title(t('tab_run'), RB.chapterName(), RB.isStaff() ? RB.iconBtn('plus', t('new_run'), function () { RB.runForm(null); }, true) : null));
    root.appendChild(RB.seg([{ v: 'next', label: t('upcoming') + (next.length ? ' (' + next.length + ')' : '') }, { v: 'past', label: t('past') }], RB.ui.runTab, function (v) { RB.ui.runTab = v; RB.refresh(); }));
    var list = RB.ui.runTab === 'next' ? next : past;
    if (!list.length) root.appendChild(RB.empty('run', RB.ui.runTab === 'next' ? t('no_runs') : t('no_past'), RB.ui.runTab === 'next' && RB.isStaff() ? t('no_runs_staff') : (RB.ui.runTab === 'next' ? t('no_runs_member') : '')));
    list.forEach(function (r, i) { root.appendChild(runCard(r, i)); });
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

  function buildRun(r, ctl, state) {
    var f = h('div', null), dt = new Date(r.run_date), past = isPast(r), me = RB.S.me, staff = RB.isStaff();
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
    var ru = RB.safeUrl(r.route_url);
    if (ru) info.appendChild(RB.row({ lead: RB.icon('route'), title: t('route_link'), href: ru }));
    f.appendChild(info);
    if (r.description) f.appendChild(h('div', { class: 'card', style: 'white-space:pre-wrap' }, r.description));

    if (r.stops && r.stops.length) {
      var tl = h('ul', { class: 'tl' });
      r.stops.forEach(function (s) { tl.appendChild(h('li', null, h('i'), h('div', null, s.time ? h('b', null, s.time + ' ') : null, s.name || ''))); });
      f.appendChild(RB.secT(t('stops')));
      f.appendChild(h('div', { class: 'card', style: 'margin-top:0' }, tl));
    }

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

    /* formazione */
    var fm = r.formation || [];
    if (fm.length || staff) {
      f.appendChild(RB.secT(t('formation'), staff ? h('button', { type: 'button', class: 'btn ghost sm2', onclick: function () { RB.formationEditor(r.id); } }, fm.length ? t('edit') : t('create')) : null));
      if (fm.length) {
        RB.ui.fmRun = r.id;
        if (staff && !r.formation_published) f.appendChild(h('div', { class: 'banner wa' }, t('fm_hidden')));
        f.appendChild(h('div', { class: 'list' }, RB.formationView(fm)));
      } else f.appendChild(h('div', { class: 'sm', style: 'padding:0 6px' }, t('fm_none')));
    }

    /* partecipanti */
    f.appendChild(RB.secT(t('participants') + ' · ' + c.total, staff ? h('span', null, c.checked + '/' + c.si + ' ' + t('present')) : null));
    var order = { si: 0, forse: 1, no: 2 };
    var sorted = signups.slice().sort(function (a, b) { return order[a.status] - order[b.status] || RB.fullName(RB.mem(a.member_id)).localeCompare(RB.fullName(RB.mem(b.member_id))); });
    var pl2 = h('div', { class: 'list' });
    sorted.forEach(function (s) {
      var m = RB.mem(s.member_id); if (!m) return;
      var right = [];
      if (s.passengers) right.push(RB.chip('+1', 'acc'));
      if (s.status === 'forse') right.push(RB.chip(t('maybe'), 'wa')); else if (s.status === 'no') right.push(RB.chip(t('no_go'), 'er'));
      if (staff && s.status === 'si') right.push(RB.toggle(!!s.checked_in, function (on) {
        s.checked_in = on;
        RB.write('rc_checkin', { p_run: r.id, p_member: m.id, p_value: on }).then(function (x) { if (!x.ok) { RB.toast(RB.errMsg(x.error), 'err'); RB.sync(); } });
      }));
      var row = RB.row({ lead: RB.av(m, 'sm'), title: RB.fullName(m), sub: RB.titleName(m.title), go: false, right: h('span', { class: 'chips', style: 'margin:0;align-items:center' }, right) });
      pl2.appendChild(row);
    });
    if (!sorted.length) pl2.appendChild(h('div', { class: 'empty', style: 'padding:22px' }, t('no_participants')));
    f.appendChild(pl2);
    if (staff && r.status === 'programmato') {
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
    if (staff) {
      acts.appendChild(RB.row({ lead: RB.icon('edit'), title: t('edit_run'), onclick: function () { RB.runForm(r.id); } }));
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
      difficulty: r.difficulty, route_url: r.route_url || '', stops: r.stops || [], status: r.status, max_participants: r.max_participants == null ? '' : String(r.max_participants) }, k;
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
    var canDel = RB.isStaff() || p.member_id === RB.S.me.id;
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
  RB.runForm = function (id) {
    var r = id ? RB.run(id) : null, stops = r && r.stops ? r.stops.map(function (s) { return { time: s.time || '', name: s.name || '' }; }) : [];
    var diff = r ? r.difficulty : 'media', status = r ? r.status : 'programmato';
    var box = h('div', null), stopsBox = h('div', { class: 'list' });
    function drawStops() {
      RB.clear(stopsBox);
      stops.forEach(function (s, i) {
        stopsBox.appendChild(h('div', { class: 'row', style: 'gap:8px' },
          h('input', { type: 'time', '.value': s.time, style: 'width:96px;border:0;background:var(--fill);border-radius:9px;padding:7px', oninput: function (e) { s.time = e.target.value; } }),
          h('input', { type: 'text', '.value': s.name, placeholder: t('stop_name'), maxlength: 80, style: 'flex:1;min-width:0;border:0;background:transparent;outline:0', oninput: function (e) { s.name = e.target.value; } }),
          h('button', { type: 'button', class: 'ib', 'aria-label': t('delete'), onclick: function () { stops.splice(i, 1); drawStops(); } }, RB.icon('x'))));
      });
    }
    drawStops();
    var fields = h('div', { class: 'list' },
      RB.field(t('f_title'), RB.input('rf-title', r ? r.title : '', { ph: t('f_title_ph'), max: 80 })),
      RB.field(t('f_datetime'), RB.input('rf-dt', RB.localInput(r ? r.run_date : nextSunday9()), { type: 'datetime-local' })),
      RB.field(t('meeting'), RB.input('rf-meet', r ? r.meeting_point : '', { max: 120 })),
      RB.field(t('destination'), RB.input('rf-dest', r ? r.destination : '', { max: 120 })),
      RB.field(t('distance') + ' (km)', RB.input('rf-km', r && r.km != null ? r.km : '', { type: 'number', mode: 'numeric', min: 0 })),
      RB.field(t('max_places'), RB.input('rf-max', r && r.max_participants != null ? r.max_participants : '', { type: 'number', mode: 'numeric', min: 1, ph: t('no_limit') })),
      RB.field(t('route_link'), RB.input('rf-url', r ? r.route_url : '', { type: 'url', ph: 'https://' })));
    box.appendChild(fields);
    box.appendChild(RB.secT(t('difficulty')));
    box.appendChild(RB.seg([{ v: 'facile', label: t('diff_facile') }, { v: 'media', label: t('diff_media') }, { v: 'impegnativa', label: t('diff_impegnativa') }], diff, function (v) { diff = v; }));
    if (r) { box.appendChild(RB.secT(t('status'))); box.appendChild(RB.seg([{ v: 'programmato', label: t('st_programmato') }, { v: 'annullato', label: t('st_annullato') }, { v: 'concluso', label: t('st_concluso') }], status, function (v) { status = v; })); }
    box.appendChild(RB.secT(t('stops'), h('button', { type: 'button', class: 'btn ghost sm2', onclick: function () { if (stops.length < 30) { stops.push({ time: '', name: '' }); drawStops(); } } }, RB.icon('plus'), t('add'))));
    box.appendChild(stopsBox);
    box.appendChild(h('div', { class: 'list', style: 'margin-top:14px' }, RB.field(t('f_notes'), h('textarea', { id: 'rf-desc', maxlength: 1500, '.value': r ? r.description || '' : '' }))));
    var ctl = RB.sheet({ title: r ? t('edit_run') : t('new_run'), content: box, full: true, leftLabel: t('cancel'),
      right: { label: t('save'), fn: function () {
        var title = RB.val('rf-title'), dtv = RB.val('rf-dt');
        if (!title || !dtv) { RB.toast(t('e_dati_mancanti'), 'err'); return; }
        var url = RB.val('rf-url');
        if (url && !RB.safeUrl(url)) { RB.toast(t('e_link_non_valido'), 'err'); return; }
        var p = { id: r ? r.id : null, title: title, run_date: new Date(dtv).toISOString(), meeting_point: RB.val('rf-meet'), destination: RB.val('rf-dest'), description: RB.val('rf-desc'),
          km: RB.val('rf-km'), difficulty: diff, route_url: url, status: status, max_participants: RB.val('rf-max'),
          stops: stops.filter(function (s) { return s.name.trim(); }).map(function (s) { return { time: s.time, name: s.name.trim() }; }) };
        RB.act(ctl.right, function () { return RB.write('rc_run_save', { p: p }); }, t('saved')).then(function (x) { if (x && x.ok) ctl.close(true); });
      } } });
    return ctl;
  };

  /* ---------- formazione ---------- */
  var KIND = { road_captain: 'k_rc', safety: 'k_safety', scopa: 'k_scopa', socio: 'k_socio' };
  RB.formationView = function (fm) {
    var g = h('div', { class: 'fm' });
    fm.forEach(function (s, i) {
      var m = s.member_id ? RB.mem(s.member_id) : null, pass = m ? (RB.signupsOf(RB.ui.fmRun || '').filter(function (x) { return x.member_id === m.id; })[0] || {}).passengers : 0;
      g.appendChild(h('div', { class: 'sl ' + s.kind + (m ? '' : ' empty0') }, h('span', { class: 'n' }, i + 1),
        h('span', { class: 'nm' }, h('small', null, t(KIND[s.kind])), m ? RB.fullName(m) + (pass ? ' +1' : '') : t('to_assign'))));
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
            onPick: function (m) { slots.splice(Math.max(0, slots.length - (slots.length && slots[slots.length - 1].kind === 'scopa' ? 1 : 0)), 0, { kind: m.title === 'road_captain' || m.title === 'head_road_captain' ? 'road_captain' : 'socio', member_id: m.id }); draw(); } });
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
