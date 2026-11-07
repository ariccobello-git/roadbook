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
  function payInfo() { return (RB.S.d.settings && RB.S.d.settings.payment_info) || {}; }
  function paymentsOf(memberId, year) { return (RB.S.d.payments || []).filter(function (p) { return p.member_id === memberId && p.year === year; }); }
  function isPaid(memberId, year) { return paymentsOf(memberId, year).length > 0; }
  RB.inviteLink = function (code) { return RB.appUrl() + '?c=' + code; };

  /* ================= SOCI ================= */
  RB.views.soci = function (root) {
    var list = h('div'), admin = RB.isAdmin();
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
        if (admin && m.active) right.push(RB.chip(isPaid(m.id, RB.ui.year) ? t('paid') : t('unpaid'), isPaid(m.id, RB.ui.year) ? 'ok' : 'er'));
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
      { label: t('download_template'), fn: function () { RB.xls.template().catch(function () { RB.toast(t('e_xls'), 'err'); }); } }]);
  };

  RB.memberDetail = function (id) {
    var ctl = RB.sheet({ title: '', full: true });
    function build() {
      var m = RB.mem(id); if (!m) { ctl.close(true); return; }
      var lv = RB.myLevel(), admin = lv >= 3, f = h('div'), st = ctl.body.scrollTop;
      ctl.setTitle(RB.fullName(m));
      f.appendChild(h('div', { style: 'text-align:center;padding:8px 0 14px' }, h('div', { style: 'display:flex;justify-content:center' }, RB.av(m, 'xl')),
        h('h2', { style: 'margin:10px 0 2px' }, RB.fullName(m)), h('div', { class: 'chips', style: 'justify-content:center' }, RB.chip(RB.titleName(m.title), 'acc'), m.active ? null : RB.chip(t('inactive'), 'wa'))));
      var info = h('div', { class: 'list' });
      if (m.bike) info.appendChild(RB.row({ lead: RB.icon('moto'), title: t('bike'), value: m.bike, go: false }));
      if (lv >= 2 && m.phone) {
        info.appendChild(RB.row({ lead: RB.icon('phone'), title: t('phone'), value: m.phone, href: 'tel:' + m.phone.replace(/[^\d+]/g, '') }));
        if (waDigits(m.phone)) info.appendChild(RB.row({ title: 'WhatsApp', href: 'https://wa.me/' + waDigits(m.phone) }));
      }
      if (admin) {
        if (m.email) info.appendChild(RB.row({ title: 'Email', value: m.email, href: 'mailto:' + m.email }));
        if (m.tessera) info.appendChild(RB.row({ title: t('tessera'), value: m.tessera, go: false }));
        if (m.joined_on) info.appendChild(RB.row({ title: t('joined'), value: RB.fmt.full(m.joined_on), go: false }));
        if (m.birth_date) info.appendChild(RB.row({ title: t('birth'), value: RB.fmt.full(m.birth_date), go: false }));
      }
      if (info.children.length) f.appendChild(info);
      if (admin && m.notes) f.appendChild(h('div', { class: 'card', style: 'white-space:pre-wrap' }, m.notes));
      if (admin) {
        var py = RB.ui.year, pays = paymentsOf(m.id, py);
        f.appendChild(RB.secT(t('fee') + ' ' + py));
        f.appendChild(h('div', { class: 'list' }, RB.row({ title: pays.length ? t('paid') : t('unpaid'), sub: pays.length ? pays.map(function (p) { return RB.fmt.money(p.amount) + ' · ' + t('m_' + p.method); }).join(', ') : '', go: true,
          right: RB.chip(pays.length ? t('paid') : t('unpaid'), pays.length ? 'ok' : 'er'), onclick: function () { RB.paymentSheet(m.id, py); } })));
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
  function sendInvite(m) {
    var txt = inviteText(m);
    var url = 'https://wa.me/' + (waDigits(m.phone) || '') + '?text=' + encodeURIComponent(txt);
    window.open(url, '_blank', 'noopener');
  }

  RB.memberForm = function (id) {
    var m = id ? RB.mem(id) : null, title = m ? m.title : 'socio', active = m ? m.active : true;
    var sel = h('select', { id: 'mf-title' }, RBL.TITLES.slice().reverse().map(function (x) { return h('option', { value: x, selected: x === title ? true : null }, RB.titleName(x)); }));
    sel.value = title; sel.addEventListener('change', function () { title = sel.value; });
    var box = h('div', null, h('div', { class: 'list' },
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
        RB.act(ctl.right, function () { return RB.write('rc_member_save', { p: p }); }, t('saved')).then(function (x) {
          if (!x || !x.ok) return;
          ctl.close(true);
          if (!m) { var nm = RB.mem(x.id); if (nm) RB.memberDetail(nm.id); }
        });
      } } });
  };

  /* foto profilo */
  RB.photoMenu = function (m) {
    RB.menu(RB.fullName(m), [
      { label: t('choose_photo'), fn: function () {
        RB.pickImage(function (file) {
          RB.resizeImage(file, 256, 0.8, true).then(function (data) {
            RB.write('rc_member_photo', { p_member: m.id, p_data: data }).then(function (x) { if (x.ok) { RB.refreshPhotos(); RB.toast(t('saved')); } else RB.toast(RB.errMsg(x.error), 'err'); });
          }, function () { RB.toast(t('e_foto_non_valida'), 'err'); });
        });
      } },
      RB.S.photos[m.id] ? { label: t('remove_photo'), danger: true, fn: function () {
        RB.write('rc_member_photo', { p_member: m.id, p_data: null }).then(function (x) { if (x.ok) { RB.refreshPhotos(); RB.toast(t('saved')); } else RB.toast(RB.errMsg(x.error), 'err'); });
      } } : null]);
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
          RB.xls.read(f).then(function (matrix) { step2(RBL.rowsFromMatrix(matrix)); }, function () { RB.toast(t('e_xls'), 'err'); });
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
      if (res.invalid.length) box.appendChild(h('p', { class: 'sm' }, t('imp_invalid') + ' ' + res.invalid.slice(0, 12).map(function (x) { return t('row') + ' ' + x.row + ' (' + t('ie_' + x.reason) + ')'; }).join(', ') + (res.invalid.length > 12 ? '…' : '')));
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
    RBL.ORG_TITLES.forEach(function (ti) {
      var ms = RB.members().filter(function (m) { return m.active && m.title === ti; });
      if (!ms.length) return;
      any = true;
      root.appendChild(RB.secT(RB.titleName(ti)));
      var g = h('div', { class: 'org' });
      ms.forEach(function (m, i) {
        var can = RB.isAdmin() || m.id === RB.S.me.id;
        var av = RB.av(m, 'lg');
        if (can) av.appendChild(h('span', { class: 'cam', role: 'button', 'aria-label': t('change_photo'), onclick: function (e) { e.stopPropagation(); RB.photoMenu(m); } }, RB.icon('cam')));
        g.appendChild(h('div', { class: 'oc b', role: 'button', tabindex: '0', style: 'animation-delay:' + Math.min(i, 8) * 40 + 'ms', onclick: function () { RB.feel('tap'); RB.memberDetail(m.id); } },
          av, h('b', null, RB.fullName(m)), RB.chip(RB.titleName(m.title), 'acc'), m.bike ? h('span', { class: 'sm', style: 'margin:0' }, m.bike) : null));
      });
      root.appendChild(g);
    });
    if (!any) root.appendChild(RB.empty('dir', t('no_org'), RB.isAdmin() ? t('no_org_admin') : ''));
  };

  /* ================= QUOTE ================= */
  RB.views.quote = function (root) {
    var info = payInfo(), me = RB.S.me, admin = RB.isAdmin(), year = RB.ui.year;
    var yr = h('div', { class: 'rb' }, RB.iconBtn('chev', '-', function () { RB.ui.year--; RB.refresh(); }), h('b', { style: 'align-self:center;min-width:44px;text-align:center' }, year), RB.iconBtn('chev', '+', function () { RB.ui.year++; RB.refresh(); }));
    yr.firstChild.querySelector('svg').style.transform = 'rotate(180deg)';
    root.appendChild(RB.title(t('tab_quote'), t('fee') + ' ' + year, yr));

    /* come pagare */
    root.appendChild(RB.secT(t('how_to_pay'), admin ? h('button', { type: 'button', class: 'btn ghost sm2', onclick: function () { RB.payInfoForm(); } }, t('edit')) : null));
    var methods = info.methods || [], c = h('div', { class: 'list' });
    if (info.annual_fee) c.appendChild(RB.row({ title: t('annual_fee'), value: RB.fmt.money(info.annual_fee), go: false }));
    if (info.deadline) c.appendChild(RB.row({ title: t('deadline'), value: RB.fmt.full(info.deadline), go: false }));
    if (methods.indexOf('contanti') >= 0) {
      c.appendChild(RB.row({ lead: RB.icon('quote'), title: t('m_contanti'), sub: [info.cash_contact ? t('cash_to') + ' ' + info.cash_contact : '', info.cash_note || ''].filter(Boolean).join(' · ') || t('cash_default'), go: false }));
    }
    if (methods.indexOf('bonifico') >= 0) {
      c.appendChild(RB.row({ lead: RB.icon('quote'), title: t('m_bonifico'), sub: info.holder ? t('holder') + ': ' + info.holder : '', go: false }));
      if (info.iban) c.appendChild(RB.row({ title: 'IBAN', sub: info.iban, cls: 'iban', go: false, right: h('button', { type: 'button', class: 'btn ghost sm2', onclick: function () { RB.copy(info.iban.replace(/\s/g, '')).then(function () { RB.toast(t('copied')); }); } }, RB.icon('copy')) }));
      if (info.causale) c.appendChild(RB.row({ title: t('causale'), sub: info.causale.replace('{anno}', year), go: false, right: h('button', { type: 'button', class: 'btn ghost sm2', onclick: function () { RB.copy(info.causale.replace('{anno}', year)).then(function () { RB.toast(t('copied')); }); } }, RB.icon('copy')) }));
    }
    if (!c.children.length) c.appendChild(h('div', { class: 'empty', style: 'padding:22px' }, t('pay_info_missing')));
    root.appendChild(c);

    /* il mio stato */
    var mine = paymentsOf(me.id, year);
    root.appendChild(RB.secT(t('my_fee')));
    root.appendChild(h('div', { class: 'list' }, RB.row({ title: mine.length ? t('paid') : t('unpaid'), go: false,
      sub: mine.length ? mine.map(function (p) { return RB.fmt.money(p.amount) + ' · ' + t('m_' + p.method) + (p.paid_on ? ' · ' + RB.fmt.full(p.paid_on) : ''); }).join(', ') : t('not_registered'),
      right: RB.chip(mine.length ? t('paid') : t('unpaid'), mine.length ? 'ok' : 'er') })));

    if (!admin) return;

    /* registro (officer) */
    var act = RB.members().filter(function (m) { return m.active; }), paid = act.filter(function (m) { return isPaid(m.id, year); });
    var all = (RB.S.d.payments || []).filter(function (p) { return p.year === year; });
    var cash = 0, bank = 0; all.forEach(function (p) { if (p.method === 'contanti') cash += Number(p.amount); else bank += Number(p.amount); });
    root.appendChild(RB.secT(t('register')));
    root.appendChild(h('div', { class: 'stat' }, h('div', null, h('b', null, paid.length + '/' + act.length), h('span', null, t('paid'))), h('div', null, h('b', null, RB.fmt.money(cash)), h('span', null, t('m_contanti'))), h('div', null, h('b', null, RB.fmt.money(bank)), h('span', null, t('m_bonifico')))));
    root.appendChild(RB.seg([{ v: 'all', label: t('f_all') }, { v: 'unpaid', label: t('unpaid') }, { v: 'paid', label: t('paid') }], RB.ui.payFilter, function (v) { RB.ui.payFilter = v; RB.refresh(); }));
    var box = h('div', { class: 'list', style: 'margin-top:12px' }), n = 0;
    act.forEach(function (m) {
      var p = isPaid(m.id, year);
      if ((RB.ui.payFilter === 'unpaid' && p) || (RB.ui.payFilter === 'paid' && !p)) return;
      n++;
      box.appendChild(RB.row({ lead: RB.av(m, 'sm'), title: RB.fullName(m), sub: p ? paymentsOf(m.id, year).map(function (x) { return RB.fmt.money(x.amount) + ' · ' + t('m_' + x.method); }).join(', ') : RB.titleName(m.title),
        right: RB.chip(p ? t('paid') : t('unpaid'), p ? 'ok' : 'er'), onclick: function () { RB.paymentSheet(m.id, year); } }));
    });
    if (!n) box.appendChild(h('div', { class: 'empty', style: 'padding:22px' }, t('no_results')));
    root.appendChild(box);
    root.appendChild(h('button', { type: 'button', class: 'btn ghost', onclick: function () { RB.xls.exportPayments(year).catch(function () { RB.toast(t('e_xls'), 'err'); }); } }, RB.icon('file'), t('export_fees')));
  };

  RB.paymentSheet = function (memberId, year) {
    var m = RB.mem(memberId), info = payInfo(), method = 'contanti', ctl;
    var box = h('div');
    function build() {
      RB.clear(box);
      var pays = paymentsOf(memberId, year);
      box.appendChild(h('div', { style: 'display:flex;align-items:center;gap:12px;margin:4px 0 8px' }, RB.av(m, ''), h('div', null, h('b', null, RB.fullName(m)), h('div', { class: 'sm', style: 'margin:0' }, t('fee') + ' ' + year))));
      if (pays.length) {
        var l = h('div', { class: 'list' });
        pays.forEach(function (p) {
          l.appendChild(RB.row({ title: RB.fmt.money(p.amount) + ' · ' + t('m_' + p.method), sub: (p.paid_on ? RB.fmt.full(p.paid_on) : '') + (p.note ? ' · ' + p.note : ''), go: false,
            right: h('button', { type: 'button', class: 'ib', 'aria-label': t('delete'), onclick: function () {
              RB.ask({ title: t('delete'), msg: t('delete_pay_msg'), ok: t('delete'), danger: true }).then(function (ok) { if (ok) RB.write('rc_payment_delete', { p_id: p.id }).then(function (x) { if (x.ok) build(); else RB.toast(RB.errMsg(x.error), 'err'); }); });
            } }, RB.icon('trash')) }));
        });
        box.appendChild(l);
      }
      box.appendChild(RB.secT(pays.length ? t('add_payment') : t('register_payment')));
      var today = new Date(); today = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
      box.appendChild(h('div', { class: 'list' }, RB.field(t('amount') + ' (€)', RB.input('pf-amt', info.annual_fee || '', { type: 'number', mode: 'decimal', step: '0.01', min: 0 })),
        RB.field(t('x_date'), RB.input('pf-date', today, { type: 'date' })), RB.field(t('f_notes'), RB.input('pf-note', '', { max: 120 }))));
      box.appendChild(h('div', { style: 'margin-top:12px' }, RB.seg([{ v: 'contanti', label: t('m_contanti') }, { v: 'bonifico', label: t('m_bonifico') }], method, function (v) { method = v; })));
      var b = h('button', { type: 'button', class: 'btn pri', onclick: function () {
        var amt = RB.val('pf-amt').replace(',', '.');
        if (!amt || isNaN(Number(amt)) || Number(amt) < 0) { RB.toast(t('e_importo'), 'err'); return; }
        RB.act(b, function () { return RB.write('rc_payment_save', { p: { member_id: memberId, year: year, amount: amt, method: method, paid_on: RB.val('pf-date'), note: RB.val('pf-note') } }); }, t('saved')).then(function (x) { if (x && x.ok) build(); });
      } }, t('save'));
      box.appendChild(b);
    }
    ctl = RB.sheet({ title: t('fee') + ' ' + year, content: box, full: true });
    ctl.refresh = null; build();
  };

  RB.payInfoForm = function () {
    var info = payInfo(), cash = (info.methods || []).indexOf('contanti') >= 0, bank = (info.methods || []).indexOf('bonifico') >= 0;
    var box = h('div', null, h('div', { class: 'list' },
      RB.field(t('annual_fee') + ' (€)', RB.input('pi-fee', info.annual_fee || '', { type: 'number', mode: 'decimal', step: '0.01', min: 0 })),
      RB.field(t('deadline'), RB.input('pi-dead', info.deadline || '', { type: 'date' }))),
      h('div', { class: 'list', style: 'margin-top:14px' }, h('div', { class: 'pass' }, h('span', null, t('m_contanti')), RB.toggle(cash, function (v) { cash = v; })), h('div', { class: 'pass' }, h('span', null, t('m_bonifico')), RB.toggle(bank, function (v) { bank = v; }))),
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
        var v = { annual_fee: RB.val('pi-fee'), deadline: RB.val('pi-dead'), methods: [cash ? 'contanti' : null, bank ? 'bonifico' : null].filter(Boolean), cash_contact: RB.val('pi-cc'), cash_note: RB.val('pi-cn'),
          holder: RB.val('pi-ho'), iban: iban.replace(/(.{4})/g, '$1 ').trim(), causale: RB.val('pi-ca') };
        RB.act(ctl.right, function () { return RB.write('rc_settings_save', { p_key: 'payment_info', p_value: v }); }, t('saved')).then(function (x) { if (x && x.ok) ctl.close(true); });
      } } });
  };
})();
