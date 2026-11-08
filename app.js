/* Roadbook · avvio, accesso, struttura a schede, sezione "Altro" */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t, app = document.getElementById('app');
  var TABS = [['run', 'run', 'tab_run'], ['meteo', 'sun', 'tab_meteo'], ['soci', 'soci', 'tab_soci'], ['dir', 'dir', 'tab_dir'], ['quote', 'quote', 'tab_quote'], ['report', 'chart', 'tab_report'], ['altro', 'altro', 'tab_altro']];
  var lastSig = '', pending = false, installEvt = null, shellKey = '';
  /* Soci e Direttivo servono solo a chi può vedere l'elenco dei soci */
  function visibleTabs() { return TABS.filter(function (x) { return x[0] === 'report' ? RB.can('reports_view') : ((x[0] !== 'soci' && x[0] !== 'dir') || RB.can('members_view')); }); }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; if (RB.S.code) RB.render(); });

  RB.logoSrc = function () {
    var c = RB.S.d && RB.S.d.settings && RB.S.d.settings.chapter, l = c && c.logo;
    if (!l) { try { l = localStorage.getItem('rb.logo'); } catch (e) {} }
    return l && /^data:image\//.test(l) ? l : 'icon-180.png';
  };

  function activeInput(scope) {
    var a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && (!scope || scope.contains(a)));
  }
  RB.refreshSheets = function () {
    RB.sheets.slice().forEach(function (s) { if (s.refresh && !activeInput(s.el)) { try { s.refresh(); } catch (e) { if (window.console) console.error(e); } } });
  };

  /* ---------- accesso ---------- */
  function loginScreen(msg, resume) {
    RB.stopSync(); RB.clear(app); RB.sheets.slice().forEach(function (s) { s.close(true); });
    var err = h('p', { class: 'err-t', role: 'alert' }, msg || '');
    var code = h('input', { id: 'code', class: 'code', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: 12, placeholder: 'XXXX-XXXX', 'aria-label': t('access_code'),
      oninput: function () { var v = RB.normCode(code.value).slice(0, 8); code.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v; }, onkeydown: function (e) { if (e.key === 'Enter') go(); } });
    var btn = h('button', { type: 'button', class: 'btn pri', onclick: go }, t('enter'));
    var resumeBtn = null;
    if (resume) resumeBtn = h('button', { type: 'button', class: 'btn ghost', id: 'resume', style: 'margin-top:10px', onclick: function () { if (RB.restore()) start(); } },
      t('continue_as') + ' ' + ((resume.first_name || '') + ' ' + (resume.last_name || '')).trim());
    function go() {
      if (RB.normCode(code.value).length < 8) { err.textContent = t('e_auth'); RB.feel('err'); return; }
      btn.disabled = true; err.textContent = '';
      RB.login(code.value).then(function (r) {
        btn.disabled = false;
        if (r.ok) { start(); } else { err.textContent = r.error === 'auth' ? t('e_auth') : RB.errMsg(r.error); RB.feel('err'); }
      });
    }
    var langs = RB.seg([{ v: 'it', label: 'Italiano' }, { v: 'en', label: 'English' }, { v: 'fr', label: 'Français' }], RB.pref.lang, function (v) { RB.pref.lang = v; RB.savePref(); RB.applyPref(); loginScreen('', resume); });
    app.appendChild(h('div', { class: 'login' },
      h('img', { class: 'logo' + (RB.logoSrc() === 'icon-180.png' ? '' : ' logo-img'), src: RB.logoSrc(), alt: '' }),
      h('h1', null, 'Roadbook'), h('p', { class: 'sub' }, t('login_sub')),
      h('div', { class: 'list' }, h('label', { class: 'field' }, h('span', null, t('access_code')), code)),
      err, btn, resumeBtn, h('p', { class: 'sm', style: 'text-align:center' }, t('login_help')), h('div', { class: 'lg' }, langs), h('p', { class: 'sm', style: 'text-align:center;opacity:.45;font-size:11px;margin-top:14px', id: 'rel' }, 'Release ' + RB.RELEASE)));
    setTimeout(function () { try { code.focus(); } catch (e) {} }, 300);
  }

  function start() {
    RB.render();
    RB.sync().then(function () { if (RB.S.code) { RB.render(); RB.startSync(); } });
  }

  /* ---------- struttura ---------- */
  function shell() {
    RB.clear(app);
    var tabs = h('nav', { class: 'tabs', 'aria-label': 'Roadbook' }, h('div', { class: 'brand' }, h('img', { id: 'brand-logo', src: RB.logoSrc(), alt: '' }), 'Roadbook'));
    var vt = visibleTabs(); shellKey = vt.map(function (x) { return x[0]; }).join();
    vt.forEach(function (x) {
      tabs.appendChild(h('button', { type: 'button', class: 'tab', 'data-tab': x[0], onclick: function () {
        if (RB.ui.tab !== x[0]) { RB.ui.tab = x[0]; RB.feel('tap'); } window.scrollTo(0, 0); RB.render();
      } }, RB.icon(x[1]), h('span', null, t(x[2]))));
    });
    app.appendChild(h('div', { class: 'shell' }, tabs, h('main', { class: 'view', id: 'view' })));
  }

  function hint(root) {
    var standalone = (window.navigator && navigator.standalone) || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    var dismissed = false; try { dismissed = localStorage.getItem('rb.hint') === '1'; } catch (e) {}
    if (standalone || dismissed) return;
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!ios && !installEvt) return;
    var card = h('div', { class: 'card' }, h('h3', null, t('install_title')), h('p', { class: 'sm' }, ios ? t('install_ios') : t('install_other')),
      !ios ? h('button', { type: 'button', class: 'btn pri', onclick: function () { installEvt.prompt(); installEvt = null; RB.render(); } }, t('install')) : null,
      h('button', { type: 'button', class: 'btn sec', onclick: function () { try { localStorage.setItem('rb.hint', '1'); } catch (e) {} RB.render(); } }, t('later')));
    root.appendChild(card);
  }

  function askLogout() {
    RB.ask({ title: t('logout'), msg: t('logout_msg'), ok: t('logout'), danger: true }).then(function (ok) { if (ok) RB.logout(''); });
  }

  RB.render = function () {
    if (!RB.S.code) { return; }
    if (!document.getElementById('view') || shellKey !== visibleTabs().map(function (x) { return x[0]; }).join()) shell();
    if (!visibleTabs().some(function (x) { return x[0] === RB.ui.tab; })) RB.ui.tab = 'run';
    var main = document.getElementById('view'), y = window.scrollY;
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === RB.ui.tab); var s = b.querySelector('span'); var x = TABS.filter(function (q) { return q[0] === b.getAttribute('data-tab'); })[0]; if (s && x) s.textContent = t(x[2]); });
    var bl = document.getElementById('brand-logo'); if (bl) bl.src = RB.logoSrc();
    RB.clear(main);
    if (!RB.S.d) { main.appendChild(h('div', { class: 'empty' }, RB.icon('clock'), h('b', null, t('loading')))); return; }
    if (RB.S.me) main.appendChild(h('div', { class: 'whobar' }, h('button', { type: 'button', class: 'who', id: 'who', 'aria-label': t('profile_in_use'), onclick: function () { if (RB.ui.tab !== 'altro') { RB.ui.tab = 'altro'; RB.feel('tap'); window.scrollTo(0, 0); RB.render(); } } },
      h('span', { class: 'who-dot' }, ((RB.S.me.first_name || '?')[0] + (RB.S.me.last_name || '')[0]).toUpperCase()), h('span', { class: 'who-n' }, (RB.S.me.first_name + ' ' + RB.S.me.last_name).trim()), h('span', { class: 'who-p' }, RB.titleName(RB.S.me.title))),
      h('button', { type: 'button', class: 'who-out', id: 'who-out', 'aria-label': t('logout'), title: t('logout'), onclick: askLogout }, RB.icon('out'))));
    if (!RB.S.online) main.appendChild(h('div', { class: 'off-bar' }, t('offline')));
    if (RB.ui.tab === 'run') hint(main);
    try { RB.views[RB.ui.tab](main); } catch (e) { if (window.console) console.error(e); main.appendChild(h('div', { class: 'empty' }, h('b', null, t('e_generic')))); }
    window.scrollTo(0, y);
  };

  /* ---------- eventi dati ---------- */
  RB.on('data', function (r) {
    var sig = JSON.stringify([r.me, r.profiles, r.members, r.runs, r.signups, r.payments, r.settings, r.weather, r.reports]);
    try { var c = r.settings && r.settings.chapter; if (c && c.logo) localStorage.setItem('rb.logo', c.logo); else localStorage.removeItem('rb.logo'); } catch (e) {}
    if (sig === lastSig) return;
    lastSig = sig;
    if (activeInput(document.getElementById('view'))) pending = true; else RB.render();
    RB.refreshSheets();
  });
  RB.on('photos', function () { if (!activeInput(document.getElementById('view'))) RB.render(); RB.refreshSheets(); });
  RB.on('online', function () { RB.render(); });
  RB.on('logout', function (why) { lastSig = ''; loginScreen(why === 'expired' ? t('e_session') : ''); });
  document.addEventListener('focusout', function () { if (pending) { pending = false; setTimeout(RB.render, 150); } });

  /* ---------- sezione Altro ---------- */
  RB.views.altro = function (root) {
    var me = RB.S.me, m = RB.mem(me.id) || me, staff = RB.isStaff(), anyTool = staff || RB.can('members_edit') || RB.can('settings_edit') || RB.can('profiles_manage');
    root.appendChild(RB.title(t('tab_altro')));

    var av = RB.av(RB.mem(me.id), 'lg');
    root.appendChild(h('div', { class: 'card', style: 'display:flex;align-items:center;gap:14px' },
      h('button', { type: 'button', 'aria-label': t('change_photo'), onclick: function () { if (RB.mem(me.id)) RB.photoMenu(RB.mem(me.id)); } }, av),
      h('div', { style: 'min-width:0' }, h('b', { style: 'font-size:19px' }, RB.fullName(m)), h('div', { class: 'chips', style: 'margin-top:4px' }, RB.chip(RB.titleName(me.title), 'acc'), RB.chip(anyTool ? t('area_staff') : t('area_member'), '')))));

    var shown = false, codeRow = RB.row({ lead: RB.icon('user'), title: t('my_code'), sub: '••••-••••', go: false });
    var csub = codeRow.querySelector('.rt span');
    codeRow.appendChild(h('button', { type: 'button', class: 'btn ghost sm2', onclick: function () {
      shown = !shown; var c = RB.S.code; csub.textContent = shown ? c.slice(0, 4) + '-' + c.slice(4) : '••••-••••'; csub.className = shown ? 'iban' : ''; this.textContent = shown ? t('hide') : t('show');
    } }, t('show')));
    root.appendChild(h('div', { class: 'list' }, codeRow));
    root.appendChild(RB.secT(t('sos_title')));
    var emgRow = RB.row({ lead: h('span', { class: 'sos-ic' }, RB.icon('alert')), title: t('sos_title'), sub: RB.emgStatusText(), onclick: function () { RB.emergencyForm(); } });
    root.appendChild(h('div', { class: 'list', id: 'emg-list' }, emgRow));
    if (RB.emg.state === null) RB.emgLoad().then(function (r) { var sb = emgRow.querySelector('.rt span'); if (r && sb) sb.textContent = RB.emgStatusText(); });
    root.appendChild(RB.secT(t('dealer')));
    root.appendChild(h('div', { class: 'list', id: 'dealer-list' }, RB.row({ lead: RB.icon('store'), title: RB.dealerName(), sub: t('dealer_sub'), onclick: function () { RB.dealerSheet(); } })));

    if (anyTool) {
      root.appendChild(RB.secT(t('area_staff')));
      var sl = h('div', { class: 'list' });
      if (RB.can('runs_edit')) sl.appendChild(RB.row({ lead: RB.icon('plus'), title: t('new_run'), onclick: function () { RB.newRun(); } }));
      var nx = RB.runs().filter(function (r) { return r.status === 'programmato' && new Date(r.run_date) > Date.now() - 6 * 3600 * 1000; }).sort(function (a, b) { return new Date(a.run_date) - new Date(b.run_date); })[0];
      if (nx && RB.can('formation_edit')) sl.appendChild(RB.row({ lead: RB.icon('moto'), title: t('formation'), sub: nx.title, onclick: function () { RB.formationEditor(nx.id); } }));
      if (nx && RB.can('signups_manage')) sl.appendChild(RB.row({ lead: RB.icon('check'), title: t('checkin'), sub: nx.title, onclick: function () { RB.openRun(nx.id); } }));
      if (RB.can('members_edit')) {
        sl.appendChild(RB.row({ lead: RB.icon('soci'), title: t('add_member'), onclick: function () { RB.memberForm(null); } }));
        sl.appendChild(RB.row({ lead: RB.icon('file'), title: t('import_xls'), onclick: function () { RB.importSheet(); } }));
        sl.appendChild(RB.row({ lead: RB.icon('file'), title: t('export_xls'), go: false, onclick: function () { RB.xls.exportMembers().catch(function () { RB.toast(t('e_xls'), 'err'); }); } }));
        sl.appendChild(RB.row({ lead: RB.icon('file'), title: t('export_codes'), go: false, onclick: function () { RB.xls.exportCodes().catch(function () { RB.toast(t('e_xls'), 'err'); }); } }));
      }
      if (RB.can('profiles_manage')) sl.appendChild(RB.row({ lead: RB.icon('dir'), title: t('profiles'), sub: t('profiles_sub'), onclick: function () { RB.profilesSheet(); } }));
      if (RB.can('settings_edit')) {
        sl.appendChild(RB.row({ lead: RB.icon('quote'), title: t('how_to_pay'), onclick: function () { RB.payInfoForm(); } }));
        sl.appendChild(RB.row({ lead: RB.icon('edit'), title: t('chapter_settings'), onclick: function () { chapterForm(); } }));
        sl.appendChild(RB.row({ lead: RB.icon('clock'), title: t('wx_every'), sub: t('wx_every_n', RB.wxInterval()), onclick: function () { wxIntervalForm(); } }));
      }
      sl.appendChild(RB.row({ lead: RB.icon('share'), title: t('share_app'), go: false, onclick: function () {
        var txt = t('share_app_text', RB.chapterName(), RB.appUrl());
        if (navigator.share) navigator.share({ text: txt }).catch(function () {}); else RB.copy(txt).then(function () { RB.toast(t('copied')); });
      } }));
      root.appendChild(sl);
    }

    /* impostazioni */
    root.appendChild(RB.secT(t('settings')));
    root.appendChild(h('div', { class: 'list' }, h('div', { class: 'field' }, h('span', null, t('language')),
      RB.seg([{ v: 'it', label: 'Italiano' }, { v: 'en', label: 'English' }, { v: 'fr', label: 'Français' }], RB.pref.lang, function (v) { RB.pref.lang = v; RB.savePref(); RB.applyPref(); RB.render(); }))));
    var sw = h('div', { class: 'sw8 nine' });
    RB.THEMES.forEach(function (th) {
      var col = { arancio: 'hsl(26 100% 46%)', rosso: 'hsl(3 80% 50%)', rosa: 'hsl(335 78% 54%)', viola: 'hsl(278 58% 52%)', indaco: 'hsl(240 68% 58%)', blu: 'hsl(211 100% 46%)', verde: 'hsl(142 62% 34%)', grafite: 'hsl(220 9% 36%)' }[th];
      sw.appendChild(h('button', { type: 'button', 'data-t': th, class: RB.pref.theme === th ? 'on' : '', 'aria-label': t('th_' + th), title: t('th_' + th), style: col ? 'background:' + col : null,
        onclick: function () { RB.pref.theme = th; RB.savePref(); RB.applyPref(); RB.feel('ok'); RB.render(); } }));
    });
    root.appendChild(h('div', { class: 'list', style: 'margin-top:12px' }, h('div', { class: 'field' }, h('span', null, t('color') + ' · ' + t('th_' + RB.pref.theme))), sw));
    root.appendChild(h('div', { class: 'list', style: 'margin-top:12px' }, h('div', { class: 'field' }, h('span', null, t('appearance')),
      RB.seg([{ v: 'auto', label: t('ap_auto') }, { v: 'light', label: t('ap_light') }, { v: 'dark', label: t('ap_dark') }], RB.pref.ap, function (v) { RB.pref.ap = v; RB.savePref(); RB.applyPref(); })),
      h('div', { class: 'pass' }, h('span', null, t('sounds')), RB.toggle(RB.pref.sound, function (on) { RB.pref.sound = on; RB.savePref(); if (on) RB.sound('ok'); }))));
    root.appendChild(h('div', { class: 'list', style: 'margin-top:22px' }, RB.row({ title: t('logout'), cls: 'act dng', go: false, onclick: askLogout })));
    root.appendChild(h('p', { class: 'sm', style: 'text-align:center;margin-top:18px' }, 'Roadbook · ' + RB.chapterName()));
  };

  function chapterForm() {
    var c = (RB.S.d.settings && RB.S.d.settings.chapter) || {}, logo = c.logo || '';
    var prev = h('img', { class: 'logo logo-img', src: logo || 'icon-180.png', alt: '', style: 'width:84px;height:84px;border-radius:20px;margin:6px auto 12px;display:block;box-shadow:var(--sh)' });
    var box = h('div', null, prev,
      h('div', { style: 'display:flex;gap:8px' },
        h('button', { type: 'button', class: 'btn ghost', style: 'margin-top:0', onclick: function () {
          RB.pickImage(function (file) {
            RB.resizeImage(file, 192, 0.85).then(function (d) { return d.length > 60000 ? RB.resizeImage(file, 128, 0.7) : d; }).then(function (d) {
              if (d.length > 60000) { RB.toast(t('e_foto_non_valida'), 'err'); return; } logo = d; prev.src = d;
            }, function () { RB.toast(t('e_foto_non_valida'), 'err'); });
          });
        } }, RB.icon('cam'), t('upload_logo')),
        h('button', { type: 'button', class: 'btn sec', style: 'margin-top:0', onclick: function () { logo = ''; prev.src = 'icon-180.png'; } }, t('remove_logo'))),
      h('p', { class: 'sm' }, t('logo_help')),
      h('div', { class: 'list', style: 'margin-top:8px' }, RB.field(t('chapter_name'), RB.input('ch-name', c.name || 'Roma Chapter', { max: 60 }))));
    var ctl = RB.sheet({ title: t('chapter_settings'), content: box, full: true, leftLabel: t('cancel'),
      right: { label: t('save'), fn: function () {
        var name = RB.val('ch-name'); if (!name) { RB.toast(t('e_dati_mancanti'), 'err'); return; }
        var v = { name: name }; if (logo) v.logo = logo;
        RB.act(ctl.right, function () { return RB.write('rc_settings_save', { p_key: 'chapter', p_value: v }); }, t('saved')).then(function (x) { if (x && x.ok) ctl.close(true); });
      } } });
  }

  RB.wxInterval = function () {
    var w = RB.S.d && RB.S.d.settings && RB.S.d.settings.weather;
    return w && +w.interval === 30 ? 30 : 60;
  };
  function wxIntervalForm() {
    var v = RB.wxInterval();
    var box = h('div', null, RB.seg([{ v: 30, label: t('min_n', 30) }, { v: 60, label: t('min_n', 60) }], v, function (x) { v = x; }), h('p', { class: 'sm', style: 'padding:8px 6px' }, t('wx_every_help')));
    var ctl = RB.sheet({ title: t('wx_every'), content: box, leftLabel: t('cancel'),
      right: { label: t('save'), fn: function () {
        RB.act(ctl.right, function () { return RB.write('rc_settings_save', { p_key: 'weather', p_value: { interval: v } }); }, t('saved')).then(function (x) { if (x && x.ok) { ctl.close(true); RB.sync(); } });
      } } });
  }

  /* ---------- ritorno dallo sfondo (iOS può scartare la memoria grafica: schermo bianco) ---------- */
  function resumed() {
    var root = document.documentElement; root.classList.remove('bg');
    if (!app.firstChild || !document.body.clientHeight) { location.reload(); return; }
    app.style.display = 'none'; void app.offsetHeight; app.style.display = '';
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) document.documentElement.classList.add('bg'); else resumed(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) resumed(); });

  /* ---------- avvio ---------- */
  RB.applyPref();
  if ('serviceWorker' in navigator && /^https:|^http:\/\/localhost/.test(location.href)) { window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); }); }
  var qs = new URLSearchParams(location.search), inv = qs.get('c');
  if (inv) {
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    RB.login(inv).then(function (r) { if (r.ok) start(); else loginScreen(t('e_auth')); });
  } else {
    /* la schermata di accesso è sempre la pagina iniziale; con una sessione salvata si può riprenderla con un tocco */
    var saved = null;
    try { if (localStorage.getItem('rb.code')) { var cd = JSON.parse(localStorage.getItem('rb.cache') || 'null'); saved = (cd && cd.ok && cd.me) ? cd.me : { first_name: '', last_name: '' }; } } catch (e) {}
    loginScreen('', saved);
  }
})();
