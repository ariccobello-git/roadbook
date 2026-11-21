/* Roadbook · revisione di percorso e formazione: autori (Head Road Captain, Safety) -> apicali del direttivo -> rilascio a direttivo e operativo. I soci non vedono mai il percorso. */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t, RBL = window.RBL;
  var SECT = [['route', 'rv_route', 'route_author'], ['formation', 'rv_formation', 'formation_edit']];

  /* chi partecipa alla revisione vede la scheda; i soci non la vedono */
  RB.reviewVisible = function () { return RB.can('route_author') || RB.can('formation_edit') || RB.can('review_approve'); };

  function who(id) { var m = id && RB.mem(id); return m ? RB.fullName(m) : ''; }
  function stCls(st) { return st === 'approvato' ? 'ok' : st === 'rivedere' ? 'er' : st === 'inviato' ? 'acc' : ''; }

  function act(btn, fn) { return RB.act(btn, fn, t('saved')); }

  RB.reviewCard = function (f, r) {
    if (!RB.reviewVisible() || r.status !== 'programmato') return;
    var rv = RBL.reviewOf(r), box = h('div', { class: 'card', id: 'rv-card' });
    f.appendChild(RB.secT(t('rv_title')));
    SECT.forEach(function (s) {
      var st = rv[s[0]], row = h('div', { class: 'rv-row', id: 'rv-' + s[0] }, h('div', { class: 'rv-h' }, h('b', null, t(s[1])), RB.chip(t('rv_st_' + st), stCls(st))));
      var meta = (r.review || {})[s[0]] || {};
      if (meta.by && st !== 'bozza') row.appendChild(h('div', { class: 'sm' }, t('rv_by', who(meta.by))));
      if (meta.note) row.appendChild(h('div', { class: 'sm', style: 'white-space:pre-wrap' }, meta.note));
      var acts = h('div', { class: 'rv-acts' });
      if (RB.can(s[2]) && (st === 'bozza' || st === 'rivedere') && !rv.released) {
        var b = h('button', { type: 'button', class: 'btn pri', id: 'rv-submit-' + s[0] }, t('rv_submit'));
        b.onclick = function () { act(b, function () { return RB.write('rc_review_submit', { p_run: r.id, p_section: s[0] }); }); };
        acts.appendChild(b);
      }
      if (RB.can('review_approve') && st === 'inviato') {
        var ok = h('button', { type: 'button', class: 'btn pri', id: 'rv-ok-' + s[0] }, t('rv_approve')), no = h('button', { type: 'button', class: 'btn ghost', id: 'rv-no-' + s[0] }, t('rv_redo'));
        var note = h('input', { type: 'text', id: 'rv-note-' + s[0], placeholder: t('rv_note'), maxlength: '300', autocomplete: 'off' });
        ok.onclick = function () { act(ok, function () { return RB.write('rc_review_decide', { p_run: r.id, p_section: s[0], p_decision: 'approvato', p_note: note.value || null }); }); };
        no.onclick = function () { act(no, function () { return RB.write('rc_review_decide', { p_run: r.id, p_section: s[0], p_decision: 'rivedere', p_note: note.value || null }); }); };
        row.appendChild(note); acts.appendChild(ok); acts.appendChild(no);
      }
      row.appendChild(acts); box.appendChild(row);
    });
    if (rv.released) box.appendChild(h('div', { class: 'banner acc', id: 'rv-released' }, t('rv_released')));
    else if (rv.ready && RB.can('review_approve')) {
      var rel = h('button', { type: 'button', class: 'btn pri', id: 'rv-release' }, t('rv_release'));
      rel.onclick = function () { act(rel, function () { return RB.write('rc_review_release', { p_run: r.id }); }); };
      box.appendChild(rel);
    }
    box.appendChild(h('div', { class: 'sm', style: 'margin-top:8px' }, t('rv_nomembers')));
    f.appendChild(box);
  };

  /* avvisi per chi deve approvare (elenco Run e dashboard) */
  RB.reviewAlerts = function () {
    if (!RB.can('review_approve')) return [];
    var out = [];
    (RB.S.d.runs || []).filter(function (r) { return r.status === 'programmato'; }).forEach(function (r) {
      var rv = RBL.reviewOf(r);
      if (rv.released) return;
      SECT.forEach(function (s) { if (rv[s[0]] === 'inviato') out.push({ run: r, text: t('rv_alert', r.title, t(s[1])) }); });
      if (rv.ready) out.push({ run: r, text: t('rv_alert_ready', r.title), ready: true });
    });
    return out;
  };
  RB.reviewBanners = function (root) {
    RB.reviewAlerts().forEach(function (a) { root.appendChild(h('div', { class: 'banner ' + (a.ready ? 'acc' : 'wa'), role: 'button', tabindex: '0', style: 'cursor:pointer', 'data-rv-alert': a.run.id, onclick: function () { RB.openRun(a.run.id); } }, a.text)); });
  };
})();
