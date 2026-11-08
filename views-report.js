/* Roadbook · dashboard e report: standard, personalizzati, esportazione */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t, L = window.RBL, R = L.report;
  var ANS = { si: 'yes_go', forse: 'maybe', no: 'no_go' };

  RB.reportCtx = function () {
    var d = RB.S.d, pi = (d.settings && d.settings.payment_info) || {};
    return { runs: d.runs || [], signups: d.signups || [], members: d.members || [], payments: RB.can('payments_view') ? (d.payments || []) : null, weather: d.weather || {},
      titleName: RB.titleName, fee: parseFloat(pi.annual_fee) || 0, now: Date.now() };
  };
  function colLabel(ds, k) { return t('col_' + (ds === 'socio' && k === 'title' ? 'role' : k)); }
  function dateTxt(v) { return v ? new Date(v + 'T12:00:00').toLocaleDateString(RB.loc(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; }
  /* testo mostrato (e esportato) per una cella */
  function cell(ds, c, v) {
    if (v === null || v === undefined || v === '') return '';
    if (c.ty === 'date') return dateTxt(v);
    var k = c.k;
    if (ds === 'run' && k === 'status') return t('st_' + v);
    if (ds === 'run' && k === 'difficulty') return t('diff_' + v);
    if (k === 'active' || (ds === 'presenza' && k === 'checked')) return t(v === 'yes' ? 'yes' : 'no');
    if (ds === 'presenza' && k === 'answer') return t(ANS[v] || 'no_go');
    if (k === 'method') return RB.has('m_' + v) ? t('m_' + v) : v;
    if (k === 'wx') return t('wx_lv_' + (v === 'crit' ? 2 : v === 'warn' ? 1 : 0));
    if (k === 'amount') return RB.fmt.money(v);
    if (k === 'fill') return v + '%';
    return String(v);
  }
  function build(def) {
    var cd = R.cleanDef(def); if (!cd) return null;
    var perms = RB.S.me.perms, cols = R.cols(cd.ds, perms).filter(function (c) { return cd.cols.indexOf(c.k) >= 0; });
    cols.sort(function (a, b) { return cd.cols.indexOf(a.k) - cd.cols.indexOf(b.k); });
    var rows = R.rows(RB.reportCtx(), cd);
    return { def: cd, cols: cols, rows: rows, totals: R.totals(cd.ds, cols.map(function (c) { return c.k; }), rows) };
  }
  function table(b, limit) {
    var th = h('tr'), tb = h('tbody'), rows = limit ? b.rows.slice(0, limit) : b.rows;
    b.cols.forEach(function (c) { th.appendChild(h('th', { class: c.ty === 'num' ? 'n' : '' }, colLabel(b.def.ds, c.k))); });
    rows.forEach(function (r) { var tr = h('tr'); b.cols.forEach(function (c) { tr.appendChild(h('td', { class: c.ty === 'num' ? 'n' : '' }, cell(b.def.ds, c, r[c.k]))); }); tb.appendChild(tr); });
    var foot = null;
    if (Object.keys(b.totals).length) {
      foot = h('tfoot', null, h('tr', null, b.cols.map(function (c, i) {
        var v = b.totals[c.k];
        return h('td', { class: c.ty === 'num' ? 'n' : '' }, i === 0 && v === undefined ? t('rep_total') : v === undefined ? '' : cell(b.def.ds, c, v));
      })));
    }
    if (!rows.length) return h('div', { class: 'empty', style: 'padding:22px' }, t('rep_empty'));
    return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, th), tb, foot));
  }
  function matrix(b) {
    return b.rows.map(function (r) { return b.cols.map(function (c) { return c.ty === 'num' && c.k !== 'amount' ? (typeof r[c.k] === 'number' ? r[c.k] : '') : (c.k === 'amount' ? (typeof r[c.k] === 'number' ? r[c.k] : '') : cell(b.def.ds, c, r[c.k])); }); });
  }
  function exportXlsx(b, name) {
    var head = b.cols.map(function (c) { return colLabel(b.def.ds, c.k); }), rows = matrix(b);
    if (Object.keys(b.totals).length) rows.push(b.cols.map(function (c, i) { return b.totals[c.k] !== undefined ? b.totals[c.k] : i === 0 ? t('rep_total') : ''; }));
    return RB.xls.exportTable(name, head, rows);
  }
  function exportCsv(b, name) {
    var q = function (v) { v = String(v === null || v === undefined ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [b.cols.map(function (c) { return q(colLabel(b.def.ds, c.k)); }).join(';')].concat(matrix(b).map(function (r) { return r.map(q).join(';'); }));
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), a = h('a', { href: URL.createObjectURL(blob), download: name.replace(/[^\w\-]+/g, '_') + '.csv' });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 500);
  }

  /* ---------- visualizzazione di un report ---------- */
  RB.reportView = function (def, title, saved, yearly) {
    var cur = R.cleanDef(def), years = L.yearsOf(RB.runs()), body = h('div'), ctl;
    if (yearly && !cur.filters.year) cur.filters.year = String(new Date().getFullYear());
    function draw() {
      RB.clear(body);
      var b = build(cur);
      var yr = h('select', { id: 'rv-year', onchange: function (e) { if (e.target.value) cur.filters.year = e.target.value; else delete cur.filters.year; draw(); } }, h('option', { value: '' }, t('ar_all_years')),
        years.map(function (y) { return h('option', { value: String(y), selected: cur.filters.year === String(y) ? true : null }, String(y)); }));
      body.appendChild(h('div', { class: 'rv-bar' }, yr, h('span', { class: 'sm', id: 'rv-count' }, t('rep_rows', b.rows.length))));
      body.appendChild(table(b));
      body.appendChild(h('div', { class: 'list', style: 'margin-top:12px' },
        RB.row({ lead: RB.icon('file'), title: t('rep_xlsx'), onclick: function () { exportXlsx(b, title).catch(function () { RB.toast(t('e_xls'), 'err'); }); } }),
        RB.row({ lead: RB.icon('file'), title: t('rep_csv'), onclick: function () { exportCsv(b, title); } }),
        RB.row({ lead: RB.icon('edit'), title: saved ? t('rep_edit') : t('rep_customize'), onclick: function () { RB.reportBuilder(cur, saved, saved ? saved.name : title); } })));
    }
    ctl = RB.sheet({ title: title, content: body, full: true });
    ctl.refresh = draw; draw();
    return ctl;
  };

  /* ---------- creazione / modifica di un report personalizzato ---------- */
  RB.reportBuilder = function (def, saved, name0) {
    var d = R.cleanDef(def) || { ds: 'run', cols: ['date', 'title', 'km', 'total'], filters: {}, sort: null }, perms = RB.S.me.perms, years = L.yearsOf(RB.runs());
    var box = h('div'), dyn = h('div'), prev = h('div'), ctl;
    function allowed(ds) { return !R.DS_PERM[ds] || perms.indexOf(R.DS_PERM[ds]) >= 0; }
    function sel(id, opts, cur, on) {
      return h('select', { id: id, onchange: function (e) { on(e.target.value); preview(); } }, opts.map(function (o) { return h('option', { value: o[0], selected: String(cur || '') === o[0] ? true : null }, o[1]); }));
    }
    function drawDyn() {
      RB.clear(dyn);
      var cols = R.cols(d.ds, perms), f = d.filters;
      dyn.appendChild(RB.secT(t('rep_cols')));
      var l = h('div', { class: 'list' });
      cols.forEach(function (c) {
        l.appendChild(h('div', { class: 'row' }, h('span', { class: 'rt' }, h('b', null, colLabel(d.ds, c.k))), RB.toggle(d.cols.indexOf(c.k) >= 0, function (on) {
          d.cols = on ? d.cols.concat([c.k]) : d.cols.filter(function (k) { return k !== c.k; });
          if (d.sort && d.cols.indexOf(d.sort.key) < 0 && !on && d.sort.key === c.k) d.sort = null;
          preview();
        })));
      });
      dyn.appendChild(l);
      dyn.appendChild(RB.secT(t('rep_filters')));
      var fl = h('div', { class: 'list' });
      fl.appendChild(RB.field(t('rep_year'), sel('rb-year', [['', t('ar_all_years')]].concat(years.map(function (y) { return [String(y), String(y)]; })), f.year, function (v) { if (v) f.year = v; else delete f.year; })));
      if (d.ds === 'run' || d.ds === 'presenza') fl.appendChild(RB.field(t('col_status'), sel('rb-status', [['', t('ar_all_status')], ['programmato', t('st_programmato')], ['concluso', t('st_concluso')], ['annullato', t('st_annullato')]], f.status, function (v) { if (v) f.status = v; else delete f.status; })));
      if (d.ds === 'socio') {
        fl.appendChild(RB.field(t('col_role'), sel('rb-role', [['', t('rep_any')]].concat(RB.profiles().map(function (p) { return [p.key, RB.titleName(p.key)]; })), f.role, function (v) { if (v) f.role = v; else delete f.role; })));
        fl.appendChild(RB.field(t('col_active'), sel('rb-active', [['', t('rep_any')], ['yes', t('yes')], ['no', t('no')]], f.active, function (v) { if (v) f.active = v; else delete f.active; })));
      }
      if (d.ds === 'quota') fl.appendChild(RB.field(t('col_method'), sel('rb-method', [['', t('rep_any')], ['contanti', t('m_contanti')], ['bonifico', t('m_bonifico')]], f.method, function (v) { if (v) f.method = v; else delete f.method; })));
      dyn.appendChild(fl);
      dyn.appendChild(RB.secT(t('rep_sort')));
      dyn.appendChild(h('div', { class: 'list' },
        RB.field(t('rep_sort_by'), sel('rb-sort', [['', '—']].concat(cols.map(function (c) { return [c.k, colLabel(d.ds, c.k)]; })), d.sort && d.sort.key, function (v) { d.sort = v ? { key: v, dir: d.sort ? d.sort.dir : 'asc' } : null; })),
        RB.field(t('rep_dir'), sel('rb-dir', [['asc', t('rep_asc')], ['desc', t('rep_desc')]], d.sort && d.sort.dir, function (v) { if (d.sort) d.sort.dir = v; }))));
    }
    function preview() {
      RB.clear(prev);
      var b = build(d);
      if (!b) { prev.appendChild(h('div', { class: 'sm', style: 'padding:8px' }, t('rep_pick_cols'))); return; }
      prev.appendChild(RB.secT(t('rep_preview'), h('span', { class: 'sm', id: 'rb-count' }, t('rep_rows', b.rows.length))));
      prev.appendChild(table(b, 30));
      prev.appendChild(h('div', { class: 'list', style: 'margin-top:10px' },
        RB.row({ lead: RB.icon('file'), title: t('rep_xlsx'), onclick: function () { exportXlsx(b, RB.val('rb-name') || t('rep_custom')).catch(function () { RB.toast(t('e_xls'), 'err'); }); } }),
        RB.row({ lead: RB.icon('file'), title: t('rep_csv'), onclick: function () { exportCsv(b, RB.val('rb-name') || t('rep_custom')); } })));
    }
    var dsOpts = ['run', 'socio', 'presenza', 'quota'].filter(allowed).map(function (k) { return { v: k, label: t('ds_' + k) }; });
    box.appendChild(h('div', { class: 'list' }, RB.field(t('rep_name'), RB.input('rb-name', name0 || '', { max: 60, ph: t('rep_name_ph') }))));
    box.appendChild(RB.secT(t('rep_data')));
    box.appendChild(RB.seg(dsOpts, d.ds, function (v) {
      if (v === d.ds) return;
      var first = R.cols(v, perms).slice(0, 4).map(function (c) { return c.k; });
      d = { ds: v, cols: first, filters: {}, sort: null }; drawDyn(); preview();
    }));
    box.appendChild(dyn); box.appendChild(prev);
    drawDyn(); preview();
    ctl = RB.sheet({ title: saved ? t('rep_edit') : t('rep_new'), content: box, full: true, leftLabel: t('cancel'),
      right: { label: t('save'), fn: function () {
        var nm = RB.val('rb-name'), cd = R.cleanDef(d);
        if (!nm) { RB.toast(t('rep_name_req'), 'err'); return; }
        if (!cd) { RB.toast(t('rep_pick_cols'), 'err'); return; }
        RB.act(ctl.right, function () { return RB.write('rc_report_save', { p: { id: saved ? saved.id : null, name: nm, def: cd } }); }, t('saved')).then(function (x) { if (x && x.ok) { ctl.close(true); RB.render(); } });
      } } });
    return ctl;
  };

  /* ---------- dashboard ---------- */
  function bars(series, onpick) {
    var max = Math.max.apply(null, series.map(function (s) { return s.value; }).concat([1])), box = h('div', { class: 'bars' });
    series.forEach(function (s) {
      box.appendChild(h('button', { type: 'button', class: 'bar-r', onclick: function () { onpick(s.id); } },
        h('span', { class: 'bl' }, s.label), h('span', { class: 'bt' }, h('i', { style: 'width:' + Math.max(3, Math.round(s.value * 100 / max)) + '%' })), h('b', null, String(s.value))));
    });
    return box;
  }
  function dashboard(root) {
    var ctx = RB.reportCtx(), D = R.dashboard(ctx, ctx.now), l;
    var kp = h('div', { class: 'kpis' });
    [[D.members, t('kpi_members')], [D.runs, t('kpi_runs', D.year)], [D.km, t('kpi_km', D.year)], [D.avg, t('kpi_avg')]].forEach(function (k) {
      kp.appendChild(h('div', { class: 'kpi' }, h('b', null, k[0].toLocaleString(RB.loc())), h('span', null, k[1])));
    });
    root.appendChild(kp);
    if (D.next) {
      var r = D.next, dt = new Date(r.run_date), c = RB.counts(RB.signupsOf(r.id)), dd = Math.ceil((dt.getTime() - ctx.now) / 86400000), s = RB.wxSum(r);
      var nx = h('div', { class: 'card', role: 'button', tabindex: '0', style: 'cursor:pointer', onclick: function () { RB.openRun(r.id); } },
        h('div', { class: 'sm' }, t('dash_next')), h('h3', { style: 'margin:2px 0' }, r.title),
        h('div', { class: 'sm' }, RB.fmt.day(dt) + ' · ' + RB.fmt.time(dt) + ' · ' + (dd > 0 ? t('dash_in_days', dd) : t('dash_today'))),
        h('div', { class: 'chips', style: 'margin-top:8px' }, RB.chip(c.total + ' ' + t('persons') + (r.max_participants ? ' / ' + r.max_participants : ''), c.total ? 'ok' : '', 'soci'), RB.wxChip(r)));
      root.appendChild(nx);
      if (s && s.covered) RB.wxAlerts(r, s).slice(0, 2).forEach(function (a) { root.appendChild(h('div', { class: 'banner ' + (a.level === 2 ? 'er' : 'wa') }, a.text)); });
    } else root.appendChild(h('div', { class: 'card sm' }, t('dash_no_next')));
    if (D.series.length) {
      root.appendChild(RB.secT(t('dash_participation')));
      root.appendChild(h('div', { class: 'card', style: 'margin-top:0' }, bars(D.series, RB.openRun)));
    }
    if (D.top.length) {
      root.appendChild(RB.secT(t('dash_top', D.year)));
      l = h('div', { class: 'list' });
      D.top.forEach(function (x, i) { var m = RB.mem(x.id); if (m) l.appendChild(RB.row({ lead: RB.av(m, 'sm'), title: (i + 1) + '. ' + RB.fullName(m), value: String(x.n), go: false })); });
      root.appendChild(l);
    }
    if (D.paid !== null) {
      var pct = D.expected ? Math.min(100, Math.round(D.paid * 100 / D.expected)) : 0;
      root.appendChild(RB.secT(t('dash_fees', D.year)));
      root.appendChild(h('div', { class: 'card', style: 'margin-top:0' }, h('div', { style: 'display:flex;justify-content:space-between' }, h('b', null, RB.fmt.money(D.paid)), h('span', { class: 'sm' }, t('dash_of', RB.fmt.money(D.expected)))),
        h('div', { class: 'bt', style: 'margin:8px 0' }, h('i', { style: 'width:' + pct + '%' })), h('div', { class: 'sm' }, t('dash_payers', D.payers, D.members))));
    }
    if (D.cancelled) root.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('dash_cancelled', D.cancelled)));
  }

  /* ---------- scheda Report ---------- */
  RB.views.report = function (root) {
    root.appendChild(RB.title(t('tab_report'), RB.chapterName()));
    root.appendChild(RB.seg([{ v: 'dash', label: t('rep_dash') }, { v: 'reports', label: t('rep_reports') }], RB.ui.repTab || 'dash', function (v) { RB.ui.repTab = v; RB.refresh(); }));
    if ((RB.ui.repTab || 'dash') === 'dash') { dashboard(root); return; }
    root.appendChild(RB.secT(t('rep_standard')));
    var l = h('div', { class: 'list' }), perms = RB.S.me.perms;
    R.STANDARD.forEach(function (s) {
      if (s.perm && perms.indexOf(s.perm) < 0) return;
      l.appendChild(RB.row({ lead: RB.icon('file'), title: t('rs_' + s.id), sub: t('rsd_' + s.id), onclick: function () { RB.reportView(s.def, t('rs_' + s.id), null, !!s.yearly); } }));
    });
    root.appendChild(l);
    root.appendChild(RB.secT(t('rep_custom'), h('button', { type: 'button', class: 'btn ghost sm2', id: 'rep-new', onclick: function () { RB.reportBuilder(null, null, ''); } }, RB.icon('plus'), t('rep_new_short'))));
    var rs = (RB.S.d.reports || []).filter(function (x) { return R.cleanDef(x.def); }), cl = h('div', { class: 'list' });
    if (!rs.length) cl.appendChild(h('div', { class: 'sm', style: 'padding:14px' }, t('rep_none_saved')));
    rs.forEach(function (x) {
      var cd = R.cleanDef(x.def), can = x.created_by === RB.S.me.id || RB.can('settings_edit');
      cl.appendChild(RB.row({ lead: RB.icon('file'), title: x.name, sub: t('ds_' + cd.ds) + ' · ' + t('rep_ncols', cd.cols.length), onclick: function () { RB.reportView(cd, x.name, x, false); },
        right: can ? h('button', { type: 'button', class: 'ib', 'aria-label': t('delete'), onclick: function (e) {
          e.stopPropagation();
          RB.ask({ title: t('rep_delete'), msg: x.name, ok: t('delete'), danger: true }).then(function (ok) { if (ok) RB.write('rc_report_delete', { p_id: x.id }).then(function (z) { if (!z.ok) RB.toast(RB.errMsg(z.error), 'err'); else RB.render(); }); });
        } }, RB.icon('trash')) : null }));
    });
    root.appendChild(cl);
  };
})();
