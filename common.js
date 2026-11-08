/* Roadbook · componenti condivisi tra le schermate */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h;
  RB.ui = { tab: 'run', runTab: 'next', q: '', memFilter: 'all', year: new Date().getFullYear(), payFilter: 'all' };
  RB.views = {};
  RB.counts = RBL.counts;

  RB.titleName = function (key) { var p = RB.profile(key); return p && !p.builtin ? p.name : (RB.has('title_' + key) ? RB.t('title_' + key) : (p ? p.name : key)); };
  RB.errMsg = function (code) { return RB.has('e_' + code) ? RB.t('e_' + code) : RB.t('e_generic'); };
  RB.refresh = function () { if (RB.render) RB.render(); };
  RB.isStaff = function () { return RB.can('runs_edit') || RB.can('formation_edit') || RB.can('signups_manage'); };
  RB.chapterName = function () { var s = RB.S.d && RB.S.d.settings && RB.S.d.settings.chapter; return (s && s.name) || 'Roma Chapter'; };
  RB.appUrl = function () { return location.origin + location.pathname.replace(/index\.html$/, ''); };

  RB.av = function (m, cls) {
    var el = h('div', { class: 'av ' + (cls || ''), style: '--ah:' + RB.hue(m ? m.id : '') });
    var ph = m && RB.S.photos[m.id];
    if (ph && /^data:image\//.test(ph)) el.appendChild(h('img', { src: ph, alt: '' }));
    else el.textContent = m ? ((m.first_name || '').charAt(0) + (m.last_name || '').charAt(0)).toUpperCase() : '?';
    return el;
  };

  RB.row = function (o) {
    var link = !!(o.onclick || o.href);
    var tag = o.href ? 'a' : (o.onclick ? 'button' : 'div');
    var at = { class: 'row' + (o.cls ? ' ' + o.cls : '') };
    if (o.id) at.id = o.id;
    if (tag === 'button') { at.type = 'button'; at.onclick = o.onclick; }
    if (tag === 'a') { at.href = o.href; at.target = '_blank'; at.rel = 'noopener'; }
    var chev = null;
    if (link && o.go !== false) { chev = RB.icon('chev'); chev.classList.add('go'); }
    return h(tag, at, o.lead || null,
      h('span', { class: 'rt' }, h('b', null, o.title), o.sub ? h('span', null, o.sub) : null),
      o.value != null && o.value !== '' ? h('span', { class: 'rv' }, o.value) : null, o.right || null, chev);
  };

  RB.field = function (label, ctrl) { return h('label', { class: 'field' }, h('span', null, label), ctrl); };
  RB.input = function (id, val, o) {
    o = o || {};
    return h('input', { id: id, type: o.type || 'text', '.value': val == null ? '' : String(val), placeholder: o.ph || '', autocomplete: 'off', inputmode: o.mode || null, maxlength: o.max || null, min: o.min || null, step: o.step || null });
  };
  RB.val = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };

  RB.seg = function (opts, cur, onpick, cls) {
    var box = h('div', { class: 'seg ' + (cls || '') });
    opts.forEach(function (o) {
      var b = h('button', { type: 'button', 'data-v': o.v, class: o.v === cur ? 'on' : '', onclick: function () {
        RB.feel('tap'); Array.prototype.forEach.call(box.children, function (c) { c.classList.toggle('on', c === b); }); onpick(o.v);
      } }, o.label);
      box.appendChild(b);
    });
    return box;
  };
  RB.toggle = function (on, onchange) {
    var s = h('button', { type: 'button', class: 'sw' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false' });
    s.addEventListener('click', function (e) {
      e.stopPropagation(); on = !on; s.classList.toggle('on', on); s.setAttribute('aria-checked', on ? 'true' : 'false'); RB.feel('tap'); onchange(on);
    });
    return s;
  };
  RB.title = function (txt, sub, right) {
    return h('div', { class: 'top' }, h('div', null, h('h1', null, txt), sub ? h('small', null, sub) : null), right ? h('div', { class: 'rb' }, right) : null);
  };
  RB.iconBtn = function (icon, label, fn, pri) {
    return h('button', { type: 'button', class: 'ib' + (pri ? ' pri' : ''), 'aria-label': label, title: label, onclick: function () { RB.feel('tap'); fn(); } }, RB.icon(icon));
  };
  RB.secT = function (txt, right) { return h('div', { class: 'sec-t' }, h('span', null, txt), right || null); };
  RB.empty = function (icon, title, sub) { return h('div', { class: 'empty' }, RB.icon(icon), h('b', null, title), sub ? h('div', null, sub) : null); };
  RB.chip = function (txt, cls, icon) { return h('span', { class: 'chip ' + (cls || '') }, icon ? RB.icon(icon) : null, txt); };

  /* esegue una scrittura mostrando errori e blocco del pulsante */
  RB.act = function (btn, fn, okMsg) {
    if (btn) btn.disabled = true;
    return fn().then(function (r) {
      if (btn) btn.disabled = false;
      if (r && r.ok === false) { RB.toast(RB.errMsg(r.error), 'err'); return r; }
      if (okMsg) RB.toast(okMsg);
      return r;
    });
  };

  /* selettore di persona con ricerca */
  RB.pickMember = function (o) {
    var q = '', list = h('div', { class: 'list' });
    var inp = h('input', { type: 'search', placeholder: RB.t('search'), autocomplete: 'off', oninput: function () { q = inp.value.trim().toLowerCase(); draw(); } });
    var box = h('div', null, h('div', { class: 'search' }, RB.icon('search'), inp), list);
    var ctl;
    function draw() {
      RB.clear(list);
      var src = o.list().filter(function (m) { return !q || RB.fullName(m).toLowerCase().indexOf(q) >= 0; });
      if (!src.length) { list.appendChild(h('div', { class: 'empty' }, RB.t('no_results'))); return; }
      src.forEach(function (m) {
        list.appendChild(RB.row({ lead: RB.av(m, 'sm'), title: RB.fullName(m), sub: RB.titleName(m.title), go: false,
          right: o.mark && o.mark(m) ? RB.icon('check') : null,
          onclick: function () { RB.feel('tap'); o.onPick(m, ctl); if (!o.multi) ctl.close(true); else draw(); } }));
      });
    }
    ctl = RB.sheet({ title: o.title, content: box, full: true });
    draw();
    return ctl;
  };
})();
