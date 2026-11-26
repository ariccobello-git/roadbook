/* Roadbook · amministrazione: profili di accesso personalizzati */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t;

  function usedBy(key) { return RB.members().filter(function (m) { return m.title === key; }).length; }

  /* elenco profili: predefiniti (sola lettura) e personalizzati (modificabili) */
  RB.profilesSheet = function () {
    var box = h('div'), ctl;
    function build() {
      RB.clear(box);
      box.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('profiles_help')));
      var l = h('div', { class: 'list' });
      RB.profiles().forEach(function (p) {
        var n = usedBy(p.key);
        l.appendChild(RB.row({ title: RB.titleName(p.key), sub: t('profile_sub', n, p.perms.length),
          right: p.builtin ? RB.chip(t('profile_builtin'), '') : RB.chip(t('profile_custom'), 'acc'),
          onclick: function () { RB.profileForm(p.key); } }));
      });
      box.appendChild(l);
      box.appendChild(h('button', { type: 'button', class: 'btn pri', onclick: function () { RB.profileForm(null); } }, RB.icon('plus'), t('profile_new')));
    }
    ctl = RB.sheet({ title: t('profiles'), content: box, full: true });
    ctl.refresh = build; build();
    return ctl;
  };

  /* modulo profilo: key = modifica/consultazione, null = nuovo, from = nuovo a partire da un profilo esistente */
  RB.profileForm = function (key, from) {
    var p = key ? RB.profile(key) : null, base = p || (from ? RB.profile(from) : null);
    if (key && !p) return;
    var readonly = !!(p && (p.builtin || !RB.covers(p.key)));
    var perms = RBL.closePerms((base ? base.perms : ['members_view', 'route_view']).filter(function (k) { return p || RB.can(k); }));
    var dir = base ? !!base.in_direttivo : false, name = p ? (p.builtin ? RB.titleName(p.key) : p.name) : '';
    var box = h('div'), permBox = h('div', { class: 'list' });

    function drawPerms() {
      RB.clear(permBox);
      RBL.PERMS.forEach(function (k) {
        var on = perms.indexOf(k) >= 0, mine = RB.can(k);
        var ctrl;
        if (readonly || !mine) ctrl = on ? RB.chip(t('yes'), 'ok') : RB.chip(t('no'), '');
        else ctrl = RB.toggle(on, function (v) { perms = RBL.setPerm(perms, k, v); drawPerms(); });
        permBox.appendChild(h('div', { class: 'pass perm' }, h('span', { style: 'min-width:0' }, h('b', { style: 'display:block;font-weight:600' }, t('perm_' + k)), h('small', { class: 'sm', style: 'display:block;margin:2px 0 0' }, t('permd_' + k))), ctrl));
      });
    }

    if (!readonly) box.appendChild(h('div', { class: 'list' }, RB.field(t('profile_name'), RB.input('pr-name', name, { max: 40, ph: t('profile_name_ph') }))));
    else box.appendChild(h('div', { class: 'list' }, RB.row({ title: name, go: false, right: RB.chip(p.builtin ? t('profile_builtin') : t('profile_custom'), p.builtin ? '' : 'acc') })));
    box.appendChild(h('div', { class: 'list', style: 'margin-top:14px' }, h('div', { class: 'pass' }, h('span', null, t('profile_in_dir')),
      readonly ? RB.chip(dir ? t('yes') : t('no'), dir ? 'ok' : '') : RB.toggle(dir, function (v) { dir = v; }))));
    box.appendChild(RB.secT(t('profile_perms')));
    drawPerms();
    box.appendChild(permBox);
    if (!readonly) box.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('profile_deps')));

    if (p) {
      box.appendChild(h('button', { type: 'button', class: 'btn ghost', onclick: function () { ctl.close(true); RB.profileForm(null, p.key); } }, RB.icon('copy'), t('profile_duplicate')));
      if (!p.builtin && !readonly) {
        box.appendChild(h('button', { type: 'button', class: 'btn dng', onclick: function () {
          if (usedBy(p.key)) { RB.toast(t('e_profilo_in_uso'), 'err'); return; }
          RB.ask({ title: t('profile_delete'), msg: t('profile_delete_msg'), ok: t('delete'), danger: true }).then(function (ok) {
            if (ok) RB.write('rc_profile_delete', { p_key: p.key }).then(function (x) { if (x.ok) { ctl.close(true); RB.toast(t('deleted')); } else RB.toast(RB.errMsg(x.error), 'err'); });
          });
        } }, RB.icon('trash'), t('profile_delete')));
      }
    }

    var ctl = RB.sheet({ title: p ? (readonly ? name : t('edit')) : t('profile_new'), content: box, full: true, leftLabel: readonly ? t('close') : t('cancel'),
      right: readonly ? null : { label: t('save'), fn: function () {
        var nm = RB.val('pr-name');
        if (!nm) { RB.toast(t('e_nome_non_valido'), 'err'); return; }
        RB.act(ctl.right, function () { return RB.write('rc_profile_save', { p: { key: p ? p.key : null, name: nm, perms: perms, in_direttivo: dir } }); }, t('saved')).then(function (x) { if (x && x.ok) ctl.close(true); });
      } } });
    return ctl;
  };

  /* ---------- reset contenuti (solo amministratore) ---------- */
  var PARTS = ['runs', 'payments', 'photos', 'notices', 'weather', 'sos', 'reports', 'members'];
  RB.resetSheet = function () {
    if (!RB.S.me || RB.S.me.title !== 'admin') return;
    var box = h('div', { id: 'reset-box' }), sel = {}, counts = null, copied = false, typed = '', ctl;
    function draw() {
      RB.clear(box);
      box.appendChild(h('div', { class: 'sos-note' }, RB.icon('alert'), h('span', null, t('rz_warn'))));
      box.appendChild(RB.secT(t('rz_what')));
      var l = h('div', { class: 'list' });
      PARTS.forEach(function (k) {
        var n = counts ? counts[k] : null;
        l.appendChild(h('div', { class: 'pass', 'data-part': k },
          h('span', null, h('b', { style: 'display:block;font-weight:600' }, t('rz_' + k)), h('small', { class: 'sm', style: 'margin:0' }, (n === null ? '…' : t('rz_items', n)) + (k === 'runs' ? ' · ' + t('rz_runs_d') : k === 'members' ? ' · ' + t('rz_members_d') : ''))),
          RB.toggle(!!sel[k], function (on) { sel[k] = on; if (k === 'runs' && on) sel.payments = sel.weather = true; draw(); })));
      });
      box.appendChild(l);
      box.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('rz_keep')));
      box.appendChild(RB.secT(t('rz_step1')));
      box.appendChild(h('button', { type: 'button', class: 'btn ' + (copied ? 'sec' : 'pri'), id: 'rs-copy', onclick: function () {
        RB.xls.exportAll().then(function () { copied = true; RB.toast(t('exported')); draw(); }, function () { RB.toast(t('e_xls'), 'err'); });
      } }, RB.icon('file'), copied ? t('rz_copied') : t('rz_copy')));
      box.appendChild(RB.secT(t('rz_step2')));
      var inp = RB.input('rs-confirm', typed, { max: 10, ph: 'RESET' }); inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('autocorrect', 'off'); inp.setAttribute('spellcheck', 'false'); inp.addEventListener('input', function () { typed = inp.value; });
      box.appendChild(h('div', { class: 'list' }, RB.field(t('rz_type'), inp)));
      var n = PARTS.filter(function (k) { return sel[k]; }).length;
      var go = h('button', { type: 'button', class: 'btn sos-btn big', id: 'rs-go', disabled: n ? null : true, onclick: function () {
        if (String(RB.val('rs-confirm')).trim().toUpperCase() !== 'RESET') { RB.toast(t('rz_e_type'), 'err'); RB.feel('err'); return; }
        var parts = PARTS.filter(function (k) { return sel[k]; });
        /* senza copia Excel prima l'avviso dedicato; poi sempre l'ultima domanda "Sei sicuro?" */
        var ready = copied ? Promise.resolve(true) : RB.ask({ title: t('rz_nocopy'), msg: t('rz_nocopy_msg'), ok: t('rz_go_anyway'), danger: true });
        ready.then(function (ok) { return ok && RB.ask({ title: t('rz_sure'), msg: t('rz_sure_msg'), ok: t('rz_go_n', parts.length), no: t('cancel'), danger: true }); }).then(function (ok) {
          if (!ok) return;
          RB.act(go, function () { return RB.rpc('rc_reset', { p_code: RB.S.code, p_parts: parts, p_confirm: 'RESET' }); }, t('rz_done')).then(function (x) {
            if (x && x.ok) { sel = {}; typed = ''; RB.sync(); if (RB.payLoad) RB.payLoad(); load(); }
          });
        });
      } }, RB.icon('alert'), n ? t('rz_go_n', n) : t('rz_go'));
      box.appendChild(go);
    }
    function load() { RB.rpc('rc_reset_counts', { p_code: RB.S.code }).then(function (x) { if (x && x.ok) { counts = x.counts; draw(); } }); }
    ctl = RB.sheet({ title: t('rz_title'), content: box, full: true, leftLabel: t('close') });
    draw(); load();
    return ctl;
  };
})();
