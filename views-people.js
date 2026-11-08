/* Roadbook · Soci, Direttivo, Quote */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t;

  function waDigits(phone) {
    var d = String(phone || '').replace(/[^\d+]/g, '');
    if (!d) return '';
    if (d.charAt(0) === '+') return d.slice(1);
    if (d.slice(0, 2) === '00') return d.slice(2);
    if (/^3\d{8,9}$/.test(d)) return '39' + d;
    return d;
  }
  RB.waDigits = waDigits;
  function payInfo() { return (RB.S.d.settings && RB.S.d.settings.payment_info) || {}; }
  RB.inviteLink = function (code) { return RB.appUrl() + '?c=' + code; };

  /* ================= SOCI ================= */
  RB.views.soci = function (root) {
    var list = h('div'), admin = RB.can('members_edit');
    var total = RB.members().filter(function (m) { return m.active; }).length;
    var right = admin ? [RB.iconBtn('plus', t('add_member'), function () { RB.memberForm(null); }, true), RB.iconBtn('altro', t('more'), function () { RB.memberTools(); })] : null;
    root.appendChild(RB.title(t('tab_soci'), total + ' ' + t('members_n'), right));
    var inp = h('input', { type: 'search', placeholder: t('search'), '.value': RB.ui.q, autocomplete: 'off', oninput: function () { RB.ui.q = inp.value.trim().toLowerCase(); draw(); } });
    root.appendChild(h('div', { class: 'search' }, RB.icon('search'), inp));
    root.appendChild(RB.seg([{ v: 'all', label: t('f_all') }, { v: 'org', label: t('f_org') }, { v: 'soci', label: t('f_soci') }], RB.ui.memFilter, function (v) { RB.ui.memFilter = v; draw(); }));
    root.appendChild(h('div', { style: 'height:12px' }));
    root.appendChild(list);
    function draw() {
      RB.clear(list);
      var f = RB.ui.memFilter, q = RB.ui.q;
      var src = RB.members().filter(function (m) {
        if (!m.active && !admin) return false;
        if (f === 'org' && m.title === 'socio') return false;
        if (f === 'soci' && m.title !== 'socio') return false;
        return !q || (RB.fullName(m) + ' ' + (m.bike || '') + ' ' + (m.tessera || '')).toLowerCase().indexOf(q) >= 0;
      });
      if (!src.length) { list.appendChild(RB.empty('soci', t('no_results'), RB.members().length ? '' : (admin ? t('no_members_admin') : ''))); return; }
      var box = h('div', { class: 'list' });
      src.forEach(function (m) {
        var right = [];
        if (!m.active) right.push(RB.chip(t('inactive'), 'wa'));
        box.appendChild(RB.row({ lead: RB.av(m, ''), title: RB.fullName(m), sub: RB.titleName(m.title) + (m.bike ? ' · ' + m.bike : ''), onclick: function () { RB.memberDetail(m.id); },
          right: right.length ? h('span', { class: 'chips', style: 'margin:0' }, right) : null }));
      });
      list.appendChild(box);
    }
    draw();
  };

  RB.memberTools = function () {
    RB.menu(t('members_tools'), [
      { label: t('add_member'), fn: function () { RB.memberForm(null); } },
      { label: t('import_xls'), fn: function () { RB.importSheet(); } },
      { label: t('export_xls'), fn: function () { RB.xls.exportMembers().catch(function () { RB.toast(t('e_xls'), 'err'); }); } },
      { label: t('export_codes'), fn: function () { RB.xls.exportCodes().catch(function () { RB.toast(t('e_xls'), 'err'); }); } },
      { label: t('download_template'), fn: function () { RB.xls.template().catch(function () { RB.toast(t('e_xls'), 'err'); }); } }]);
  };

  RB.memberDetail = function (id) {
    var ctl = RB.sheet({ title: '', full: true });
    function build() {
      var m = RB.mem(id); if (!m) { ctl.close(true); return; }
      var edit = RB.can('members_edit') && RB.covers(m.title), f = h('div'), st = ctl.body.scrollTop;
      ctl.setTitle(RB.fullName(m));
      f.appendChild(h('div', { style: 'text-align:center;padding:8px 0 14px' }, h('div', { style: 'display:flex;justify-content:center' }, RB.av(m, 'xl')),
        h('h2', { style: 'margin:10px 0 2px' }, RB.fullName(m)), h('div', { class: 'chips', style: 'justify-content:center' }, RB.chip(RB.titleName(m.title), 'acc'), m.active ? null : RB.chip(t('inactive'), 'wa'))));
      var info = h('div', { class: 'list' });
      if (m.bike) info.appendChild(RB.row({ lead: RB.icon('moto'), title: t('bike'), value: m.bike, go: false }));
      if (m.phone) {
        info.appendChild(RB.row({ lead: RB.icon('phone'), title: t('phone'), value: m.phone, href: 'tel:' + m.phone.replace(/[^\d+]/g, '') }));
        if (waDigits(m.phone)) info.appendChild(RB.row({ title: 'WhatsApp', href: 'https://wa.me/' + waDigits(m.phone) }));
      }
      {
        if (m.email) info.appendChild(RB.row({ title: 'Email', value: m.email, href: 'mailto:' + m.email }));
        if (m.tessera) info.appendChild(RB.row({ title: t('tessera'), value: m.tessera, go: false }));
        if (m.joined_on) info.appendChild(RB.row({ title: t('joined'), value: RB.fmt.full(m.joined_on), go: false }));
        if (m.birth_date) info.appendChild(RB.row({ title: t('birth'), value: RB.fmt.full(m.birth_date), go: false }));
      }
      if (info.children.length) f.appendChild(info);
      if (m.notes) f.appendChild(h('div', { class: 'card', style: 'white-space:pre-wrap' }, m.notes));
      if (edit && m.access_code) {
        f.appendChild(RB.secT(t('invite')));
        var codeRow = RB.row({ title: m.access_code.slice(0, 4) + '-' + m.access_code.slice(4), cls: 'iban', go: false });
        f.appendChild(h('div', { class: 'list' }, codeRow,
          RB.row({ lead: RB.icon('share'), title: t('send_invite'), onclick: function () { sendInvite(m); } }),
          RB.row({ lead: RB.icon('copy'), title: t('copy_invite'), onclick: function () { RB.copy(inviteText(m)).then(function () { RB.toast(t('copied')); }); } }),
          RB.row({ title: t('new_code'), go: false, onclick: function () {
            RB.ask({ title: t('new_code'), msg: t('new_code_msg'), ok: t('new_code') }).then(function (ok) { if (ok) RB.write('rc_member_regen_code', { p_id: m.id }).then(function (x) { if (x.ok) RB.toast(t('saved')); else RB.toast(RB.errMsg(x.error), 'err'); }); });
          } })));
        f.appendChild(h('div', { class: 'list', style: 'margin-top:18px' },
          RB.row({ lead: RB.icon('cam'), title: t('change_photo'), onclick: function () { RB.photoMenu(m); } }),
          RB.row({ lead: RB.icon('edit'), title: t('edit'), onclick: function () { RB.memberForm(m.id); } })));
      }
      ctl.set(f); ctl.body.scrollTop = st;
    }
    ctl.refresh = build; build();
  };

  function inviteText(m) {
    return t('invite_text', m.first_name, RB.chapterName(), RB.inviteLink(m.access_code), m.access_code.slice(0, 4) + '-' + m.access_code.slice(4));
  }
  RB.inviteText = inviteText;
  function sendInvite(m) {
    var txt = inviteText(m);
    var url = 'https://wa.me/' + (waDigits(m.phone) || '') + '?text=' + encodeURIComponent(txt);
    window.open(url, '_blank', 'noopener');
  }

  RB.memberForm = function (id) {
    var m = id ? RB.mem(id) : null, title = m ? m.title : 'socio', active = m ? m.active : true;
    var opts = RB.profiles().filter(function (p) { return p.key === title || RB.covers(p.key); }).reverse();
    var sel = h('select', { id: 'mf-title' }, opts.map(function (p) { return h('option', { value: p.key, selected: p.key === title ? true : null }, RB.titleName(p.key)); }));
    sel.value = title; sel.addEventListener('change', function () { title = sel.value; });
    var ph = { changed: false, data: null }, phBox = h('div', { class: 'tessrow' });
    function drawPh() {
      RB.clear(phBox);
      var shown = ph.changed ? ph.data : (m ? RB.S.photos[m.id] : null);
      var prev = h('div', { class: 'tess', style: '--ah:' + RB.hue(m ? m.id : 'x'), id: 'mf-photo' });
      if (shown) prev.appendChild(h('img', { src: shown, alt: '' })); else prev.appendChild(RB.icon('cam'));
      phBox.appendChild(prev);
      phBox.appendChild(h('div', { style: 'flex:1;min-width:0' }, h('button', { type: 'button', class: 'btn sec', id: 'mf-photo-btn', style: 'margin-top:0', onclick: function () {
        RB.pickPhoto(t('photo_id'), !!shown, function (d) { ph.changed = true; ph.data = d; drawPh(); });
      } }, RB.icon('cam'), shown ? t('change_photo') : t('photo_id')), h('p', { class: 'sm' }, t('photo_hint'))));
    }
    drawPh();
    var box = h('div', null, h('div', { class: 'list' }, phBox), h('div', { class: 'list', style: 'margin-top:14px' },
      RB.field(t('first_name'), RB.input('mf-fn', m ? m.first_name : '', { max: 60 })), RB.field(t('last_name'), RB.input('mf-ln', m ? m.last_name : '', { max: 60 })),
      RB.field(t('phone'), RB.input('mf-ph', m ? m.phone : '', { type: 'tel', mode: 'tel', max: 30 })), RB.field('Email', RB.input('mf-em', m ? m.email : '', { type: 'email', mode: 'email', max: 120 })),
      RB.field(t('bike'), RB.input('mf-bike', m ? m.bike : '', { max: 80 })), RB.field(t('tessera'), RB.input('mf-te', m ? m.tessera : '', { max: 30 })),
      RB.field(t('role'), sel),
      RB.field(t('joined'), RB.input('mf-jo', m ? m.joined_on : '', { type: 'date' })), RB.field(t('birth'), RB.input('mf-bi', m ? m.birth_date : '', { type: 'date' })),
      RB.field(t('f_notes'), h('textarea', { id: 'mf-no', maxlength: 600, '.value': m ? m.notes || '' : '' }))));
    if (m) {
      box.appendChild(h('div', { class: 'list', style: 'margin-top:14px' }, h('div', { class: 'pass' }, h('span', null, t('active_member')), RB.toggle(active, function (on) { active = on; }))));
      box.appendChild(h('button', { type: 'button', class: 'btn dng', onclick: function () {
        RB.ask({ title: t('delete_member'), msg: t('delete_member_msg'), ok: t('delete'), danger: true }).then(function (ok) {
          if (ok) RB.write('rc_member_delete', { p_id: m.id }).then(function (x) { if (x.ok) { RB.sheets.slice().forEach(function (s) { if (s !== ctl && s.refresh) s.refresh(); }); ctl.close(true); RB.toast(t('deleted')); } else RB.toast(RB.errMsg(x.error), 'err'); });
        });
      } }, RB.icon('trash'), t('delete_member')));
    }
    var ctl = RB.sheet({ title: m ? t('edit') : t('add_member'), content: box, full: true, leftLabel: t('cancel'),
      right: { label: t('save'), fn: function () {
        var p = { id: m ? m.id : null, first_name: RB.val('mf-fn'), last_name: RB.val('mf-ln'), phone: RB.val('mf-ph'), email: RB.val('mf-em'), bike: RB.val('mf-bike'), tessera: RB.val('mf-te'),
          title: title, joined_on: RB.val('mf-jo'), birth_date: RB.val('mf-bi'), notes: RB.val('mf-no'), active: active };
        if (!p.first_name || !p.last_name) { RB.toast(t('e_nome_mancante'), 'err'); return; }
        if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) { RB.toast(t('e_email'), 'err'); return; }
        RB.act(ctl.right, function () {
          return RB.write('rc_member_save', { p: p }).then(function (x) {
            if (x && x.ok && ph.changed) return RB.write('rc_member_photo', { p_member: x.id || (m && m.id), p_data: ph.data }).then(function (y) { RB.refreshPhotos(); if (!y.ok) RB.toast(RB.errMsg(y.error), 'err'); return x; });
            return x;
          });
        }, t('saved')).then(function (x) {
          if (!x || !x.ok) return;
          ctl.close(true);
          if (!m) { var nm = RB.mem(x.id); if (nm) RB.memberDetail(nm.id); }
        });
      } } });
  };

  /* foto tipo tessera: scattata con la fotocamera o scelta dalla libreria/file; cb(dataUrl) oppure cb(null) per rimuovere */
  RB.pickPhoto = function (title, hasPhoto, cb) {
    function take(camera) {
      RB.pickImage(function (file) {
        RB.tessera(file).then(cb, function () { RB.toast(t('e_foto_non_valida'), 'err'); });
      }, camera);
    }
    RB.menu(title, [
      { label: t('take_photo'), fn: function () { take(true); } },
      { label: t('choose_photo'), fn: function () { take(false); } },
      hasPhoto ? { label: t('remove_photo'), danger: true, fn: function () { cb(null); } } : null]);
  };
  RB.photoMenu = function (m) {
    RB.pickPhoto(RB.fullName(m), !!RB.S.photos[m.id], function (data) {
      RB.write('rc_member_photo', { p_member: m.id, p_data: data }).then(function (x) { if (x.ok) { RB.refreshPhotos(); RB.toast(t('saved')); } else RB.toast(RB.errMsg(x.error), 'err'); });
    });
  };
  /* foto tessera in grande (si apre toccando un nome nelle liste) */
  RB.tess = function (m, big) {
    var ph = m && RB.S.photos[m.id], el = h('div', { class: 'tess' + (big ? ' big' : ''), style: '--ah:' + RB.hue(m ? m.id : '') });
    if (ph && /^data:image\//.test(ph)) el.appendChild(h('img', { src: ph, alt: '' }));
    else el.textContent = m ? ((m.first_name || '').charAt(0) + (m.last_name || '').charAt(0)).toUpperCase() : '?';
    return el;
  };
  RB.memberCard = function (m) {
    var canEdit = m.id === RB.S.me.id || (RB.can('members_edit') && RB.covers(m.title)), box = h('div', { class: 'mcard' }), ctl;
    function draw() {
      RB.clear(box);
      box.appendChild(h('div', { style: 'display:flex;justify-content:center;margin:6px 0 12px' }, RB.tess(m, true)));
      box.appendChild(h('div', { style: 'text-align:center' }, h('b', { style: 'font-size:22px' }, RB.fullName(m)), h('div', { class: 'chips', style: 'justify-content:center' }, RB.chip(RB.titleName(m.title), 'acc'), m.bike ? RB.chip(m.bike, '', 'moto') : null)));
      if (!RB.S.photos[m.id]) box.appendChild(h('p', { class: 'sm', style: 'text-align:center' }, t('no_photo')));
      if (canEdit) box.appendChild(h('button', { type: 'button', class: 'btn sec', onclick: function () { RB.photoMenu(m); } }, RB.icon('cam'), t('change_photo')));
    }
    draw();
    ctl = RB.sheet({ title: t('photo_id'), content: box, leftLabel: t('close') });
    ctl.refresh = draw;
    return ctl;
  };
  /* rende cliccabili avatar e nome di una riga */
  RB.linkMember = function (row, m) {
    ['.av', '.rt b'].forEach(function (sel) {
      var el = row.querySelector(sel); if (!el) return;
      el.style.cursor = 'pointer'; el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
      el.addEventListener('click', function (e) { e.stopPropagation(); RB.feel('tap'); RB.memberCard(m); });
    });
    return row;
  };

  /* ================= IMPORT EXCEL ================= */
  RB.importSheet = function () {
    var box = h('div', { class: 'imp' }), ctl;
    function step1() {
      RB.clear(box);
      box.appendChild(h('p', { class: 'sm' }, t('imp_help')));
      box.appendChild(h('button', { type: 'button', class: 'btn ghost', onclick: function () { RB.xls.template().catch(function () { RB.toast(t('e_xls'), 'err'); }); } }, RB.icon('file'), t('download_template')));
      box.appendChild(h('button', { type: 'button', class: 'btn pri', onclick: function () {
        var inp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', style: 'display:none', onchange: function () {
          var f = inp.files && inp.files[0]; if (inp.parentNode) inp.parentNode.removeChild(inp); if (!f) return;
          RB.toast(t('reading'));
          RB.xls.read(f).then(function (matrix) { step2(RBL.rowsFromMatrix(matrix, RB.profiles().filter(function (p) { return RB.covers(p.key); }))); }, function () { RB.toast(t('e_xls'), 'err'); });
        } });
        document.body.appendChild(inp); inp.click();
      } }, RB.icon('file'), t('choose_file')));
    }
    function step2(res) {
      RB.clear(box);
      if (res.missing.length) {
        box.appendChild(h('div', { class: 'banner er' }, t('imp_missing')));
        box.appendChild(h('button', { type: 'button', class: 'btn sec', onclick: step1 }, t('back')));
        return;
      }
      box.appendChild(h('div', { class: 'stat' }, h('div', null, h('b', null, res.rows.length), h('span', null, t('imp_ready'))), h('div', null, h('b', { style: res.invalid.length ? 'color:var(--er)' : '' }, res.invalid.length), h('span', null, t('imp_skipped')))));
      var tbl = h('table', null, h('thead', null, h('tr', null, [t('first_name'), t('last_name'), t('phone'), t('role'), t('tessera')].map(function (x) { return h('th', null, x); }))),
        h('tbody', null, res.rows.slice(0, 8).map(function (r) { return h('tr', null, [r.first_name, r.last_name, r.phone, RB.titleName(r.title), r.tessera].map(function (x) { return h('td', null, x || ''); })); })));
      box.appendChild(h('div', { class: 'tbl' }, tbl));
      if (res.rows.length > 8) box.appendChild(h('p', { class: 'sm' }, t('imp_more', res.rows.length - 8)));
      if (res.invalid.length) box.appendChild(h('p', { class: 'sm' }, t('imp_invalid') + ' ' + res.invalid.slice(0, 12).map(function (x) { return t('row') + ' ' + x.row + ' (' + t('ie_' + x.reason) + (x.value ? ': ' + x.value : '') + ')'; }).join(', ') + (res.invalid.length > 12 ? '…' : '')));
      box.appendChild(h('p', { class: 'sm' }, t('imp_merge')));
      var go = h('button', { type: 'button', class: 'btn pri', onclick: function () { run(res.rows, go); } }, t('import_n', res.rows.length));
      if (!res.rows.length) go.disabled = true;
      box.appendChild(go);
      box.appendChild(h('button', { type: 'button', class: 'btn sec', onclick: step1 }, t('back')));
    }
    function run(rows, btn) {
      btn.disabled = true; btn.textContent = t('importing');
      var ins = 0, upd = 0, skip = 0, i = 0, failed = null;
      (function next() {
        if (i >= rows.length || failed) return done();
        var chunk = rows.slice(i, i + 150); i += 150;
        RB.rpc('rc_members_import', { p_code: RB.S.code, p_rows: chunk }).then(function (r) {
          if (!r.ok) failed = r.error; else { ins += r.inserted; upd += r.updated; skip += r.skipped; }
          next();
        });
      })();
      function done() {
        RB.sync();
        RB.clear(box);
        if (failed) { box.appendChild(h('div', { class: 'banner er' }, RB.errMsg(failed))); RB.sound('err'); }
        else { RB.sound('ok'); }
        box.appendChild(h('div', { class: 'stat' }, h('div', null, h('b', null, ins), h('span', null, t('imp_added'))), h('div', null, h('b', null, upd), h('span', null, t('imp_updated'))), h('div', null, h('b', null, skip), h('span', null, t('imp_skipped')))));
        if (ins) box.appendChild(h('button', { type: 'button', class: 'btn ghost', onclick: function () { RB.xls.exportCodes().catch(function () { RB.toast(t('e_xls'), 'err'); }); } }, RB.icon('file'), t('export_codes')));
        box.appendChild(h('button', { type: 'button', class: 'btn pri', onclick: function () { ctl.close(); } }, t('done')));
      }
    }
    ctl = RB.sheet({ title: t('import_xls'), content: box, full: true });
    step1();
  };

  /* ================= DIRETTIVO ================= */
  RB.views.dir = function (root) {
    root.appendChild(RB.title(t('tab_dir'), RB.chapterName()));
    var any = false;
    RB.profiles().filter(function (p) { return p.in_direttivo; }).forEach(function (pr) {
      var ti = pr.key, ms = RB.members().filter(function (m) { return m.active && m.title === ti; });
      if (!ms.length) return;
      any = true;
      root.appendChild(RB.secT(RB.titleName(ti)));
      var g = h('div', { class: 'org' });
      ms.forEach(function (m, i) {
        var can = RB.can('members_edit') || m.id === RB.S.me.id;
        var av = RB.av(m, 'lg');
        if (can) av.appendChild(h('span', { class: 'cam', role: 'button', 'aria-label': t('change_photo'), onclick: function (e) { e.stopPropagation(); RB.photoMenu(m); } }, RB.icon('cam')));
        g.appendChild(h('div', { class: 'oc b', role: 'button', tabindex: '0', style: 'animation-delay:' + Math.min(i, 8) * 40 + 'ms', onclick: function () { RB.feel('tap'); RB.memberDetail(m.id); } },
          av, h('b', null, RB.fullName(m)), RB.chip(RB.titleName(m.title), 'acc'), m.bike ? h('span', { class: 'sm', style: 'margin:0' }, m.bike) : null));
      });
      root.appendChild(g);
    });
    if (!any) root.appendChild(RB.empty('dir', t('no_org'), RB.can('members_edit') ? t('no_org_admin') : ''));
  };

  /* ================= QUOTE (solo informazioni) ================= */
  function feeRuns() {
    return (RB.S.d.runs || []).filter(function (r) { return r.status === 'programmato' && RBL.hasFee(r) && new Date(r.run_date).getTime() > Date.now() - 86400000; })
      .sort(function (a, b) { return new Date(a.run_date) - new Date(b.run_date); });
  }
  RB.views.quote = function (root) {
    var info = payInfo(), me = RB.S.me, runs = feeRuns();
    root.appendChild(RB.title(t('tab_quote'), t('fees_info')));

    /* le mie quote: importo e rate dei Run a cui partecipo */
    root.appendChild(RB.secT(t('my_fees')));
    var n = 0;
    runs.forEach(function (r) {
      var sg = RB.signupsOf(r.id).filter(function (x) { return x.member_id === me.id && x.status === 'si'; })[0];
      if (!sg || !RBL.dueOf(r, sg)) return; n++;
      var l = h('div', { class: 'list', style: 'margin-bottom:10px' }, RB.row({ title: r.title, sub: RB.fmt.day(new Date(r.run_date)), onclick: function () { RB.openRun(r.id); } }));
      RB.feeRows(r, sg).forEach(function (x) { l.appendChild(x); });
      root.appendChild(l);
    });
    if (!n) root.appendChild(h('div', { class: 'list' }, h('div', { class: 'empty', style: 'padding:22px' }, t('no_my_fees'))));

    /* quote dei prossimi Run */
    if (runs.length) {
      root.appendChild(RB.secT(t('upcoming_fees')));
      var ul = h('div', { class: 'list' });
      runs.forEach(function (r) {
        ul.appendChild(RB.row({ title: r.title, sub: RB.fmt.day(new Date(r.run_date)) + ' · ' + RB.feeSummary(r), onclick: function () { RB.openRun(r.id); } }));
      });
      root.appendChild(ul);
    }

    /* come pagare */
    root.appendChild(RB.secT(t('how_to_pay'), RB.can('settings_edit') ? h('button', { type: 'button', class: 'btn ghost sm2', onclick: function () { RB.payInfoForm(); } }, t('edit')) : null));
    var methods = info.methods || [], c = h('div', { class: 'list' });
    if (methods.indexOf('contanti') >= 0) {
      c.appendChild(RB.row({ lead: RB.icon('quote'), title: t('m_contanti'), sub: [info.cash_contact ? t('cash_to') + ' ' + info.cash_contact : '', info.cash_note || ''].filter(Boolean).join(' · ') || t('cash_default'), go: false }));
    }
    if (methods.indexOf('bonifico') >= 0) {
      c.appendChild(RB.row({ lead: RB.icon('quote'), title: t('m_bonifico'), sub: info.holder ? t('holder') + ': ' + info.holder : '', go: false }));
      if (info.iban) c.appendChild(RB.row({ title: 'IBAN', sub: info.iban, cls: 'iban', go: false, right: h('button', { type: 'button', class: 'btn ghost sm2', onclick: function () { RB.copy(info.iban.replace(/\s/g, '')).then(function () { RB.toast(t('copied')); }); } }, RB.icon('copy')) }));
      if (info.causale) c.appendChild(RB.row({ title: t('causale'), sub: info.causale, go: false }));
    }
    if (!c.children.length) c.appendChild(h('div', { class: 'empty', style: 'padding:22px' }, t('pay_info_missing')));
    root.appendChild(c);
  };

  RB.payInfoForm = function () {
    var info = payInfo(), cash = (info.methods || []).indexOf('contanti') >= 0, bank = (info.methods || []).indexOf('bonifico') >= 0;
    var box = h('div', null,
      h('div', { class: 'list' }, h('div', { class: 'pass' }, h('span', null, t('m_contanti')), RB.toggle(cash, function (v) { cash = v; })), h('div', { class: 'pass' }, h('span', null, t('m_bonifico')), RB.toggle(bank, function (v) { bank = v; }))),
      RB.secT(t('m_contanti')),
      h('div', { class: 'list' }, RB.field(t('cash_to'), RB.input('pi-cc', info.cash_contact || '', { max: 80 })), RB.field(t('f_notes'), RB.input('pi-cn', info.cash_note || '', { max: 160 }))),
      RB.secT(t('m_bonifico')),
      h('div', { class: 'list' }, RB.field(t('holder'), RB.input('pi-ho', info.holder || '', { max: 80 })), RB.field('IBAN', RB.input('pi-ib', info.iban || '', { max: 40, ph: 'IT00 X000 0000 0000 0000 0000 000' })),
        RB.field(t('causale'), RB.input('pi-ca', info.causale || '', { max: 120 }))),
      h('p', { class: 'sm' }, t('causale_help')));
    var ctl = RB.sheet({ title: t('how_to_pay'), content: box, full: true, leftLabel: t('cancel'),
      right: { label: t('save'), fn: function () {
        var iban = RB.val('pi-ib').toUpperCase().replace(/\s+/g, '');
        if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) { RB.toast(t('e_iban'), 'err'); return; }
        var v = { methods: [cash ? 'contanti' : null, bank ? 'bonifico' : null].filter(Boolean), cash_contact: RB.val('pi-cc'), cash_note: RB.val('pi-cn'),
          holder: RB.val('pi-ho'), iban: iban.replace(/(.{4})/g, '$1 ').trim(), causale: RB.val('pi-ca') };
        RB.act(ctl.right, function () { return RB.write('rc_settings_save', { p_key: 'payment_info', p_value: v }); }, t('saved')).then(function (x) { if (x && x.ok) ctl.close(true); });
      } } });
  };
})();
