/* Roadbook · meteo per motociclisti: previsioni lungo il percorso, ultimo salvataggio orario, avvisi */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t, L = window.RBL;
  var LV = ['ok', 'wa', 'er'];

  RB.wxOf = function (id) {
    var d = RB.S.d, w = d && d.weather && d.weather[id];
    return w || (RB.S.wxx && RB.S.wxx[id]) || null;
  };
  RB.wxSum = function (r) {
    var W = RB.wxOf(r.id);
    return W ? L.wxSummary(r, W, Date.now()) : null;
  };
  function hhmm(ms) { return RB.fmt.time(new Date(ms)); }
  function flagsText(fl) { return fl.map(function (k) { return t('wxf_' + k); }).join(', '); }
  function ago(h0) { return h0 < 1 ? t('wx_just') : t('wx_ago', Math.round(h0)); }

  /* sigla per l'elenco dei Run */
  RB.wxChip = function (r) {
    if (r.status !== 'programmato') return null;
    var s = RB.wxSum(r);
    if (!s || !s.covered) return null;
    var worst = s.pts.filter(function (p) { return p.rec; }).sort(function (a, b) { return b.level - a.level; })[0];
    return RB.chip((s.level ? (s.level === 2 ? '⛔ ' : '⚠️ ') : L.WX_ICON[L.wxKind(worst.rec.code)] + ' ') + t('wx_lv_' + s.level), LV[s.level]);
  };

  /* avvisi: righe di testo (livello 2 = critico) per un Run */
  RB.wxAlerts = function (r, s) {
    var out = [];
    s.alerts.forEach(function (a) { out.push({ level: 2, text: t('wx_a_crit', a.label || t('stops'), hhmm(a.eta), flagsText(a.flags)) }); });
    if (s.firstRain && !(s.alerts.length && s.alerts.some(function (a) { return a.label === s.firstRain.label; }))) out.push({ level: 1, text: t('wx_a_rain', s.firstRain.label || t('stops'), hhmm(s.firstRain.eta)) });
    if (s.dark) out.push({ level: 1, text: t('wx_a_dark', s.dark.label || t('destination'), hhmm(s.dark.eta), s.dark.sunset || '') });
    return out;
  };

  function metric(rec) {
    if (!rec) return t('wx_nodata');
    var kind = L.wxKind(rec.code), parts = [L.WX_ICON[kind] + ' ' + (rec.temp !== null ? Math.round(rec.temp) + '°' : '—') + (rec.feels !== null && Math.abs(rec.feels - rec.temp) >= 2 ? ' (' + t('wx_feels') + ' ' + Math.round(rec.feels) + '°)' : '')];
    parts.push('💧 ' + (rec.pop !== null ? rec.pop + '%' : '—') + (rec.precip ? ' · ' + (Math.round(rec.precip * 10) / 10) + ' mm' : ''));
    parts.push('💨 ' + (rec.wind !== null ? Math.round(rec.wind) : '—') + (rec.gust !== null ? ' (' + t('wx_gust') + ' ' + Math.round(rec.gust) + ')' : '') + ' km/h');
    if (rec.vis !== null) parts.push('👁 ' + (rec.vis >= 10000 ? '10+' : (Math.round(rec.vis / 100) / 10)) + ' km');
    return parts.join('  ');
  }

  /* sezione meteo del dettaglio Run */
  RB.weatherSection = function (r, f, ctl) {
    var win = L.wxWindow(r, Date.now()), W = RB.wxOf(r.id), past = r.status !== 'programmato' || win.after;
    if (r.status === 'annullato') return;
    if (!W && past && !(RB.S.wxx && RB.S.wxx[r.id]) && !(RB.S.wxTried && RB.S.wxTried[r.id])) {
      RB.S.wxTried = RB.S.wxTried || {}; RB.S.wxTried[r.id] = 1;
      RB.rpc('rc_weather_get', { p_code: RB.S.code, p_run: r.id }).then(function (x) {
        if (x.ok && x.weather) { RB.S.wxx = RB.S.wxx || {}; RB.S.wxx[r.id] = x.weather; if (ctl && ctl.refresh) ctl.refresh(); }
      });
    }
    var s = W ? L.wxSummary(r, W, Date.now()) : null, box = h('div');
    f.appendChild(RB.secT(past ? t('wx_final') : t('wx_title'),
      !past ? h('button', { type: 'button', class: 'btn ghost sm2', id: 'wx-refresh', onclick: function () {
        var b = this; b.disabled = true; RB.rpc('rc_weather_refresh', { p_code: RB.S.code, p_run: r.id });
        RB.toast(t('wx_refreshing'));
        setTimeout(function () { RB.sync(); }, 9000); setTimeout(function () { RB.sync(); b.disabled = false; }, 25000);
      } }, t('wx_refresh')) : null));
    if (!s || !s.covered) {
      var hasCoords = L.dayPlaces(r).some(L.hasCoords);
      var msg = !hasCoords && !(r.route_public || RB.can('route_view')) ? t('wx_wait') : !hasCoords ? t('wx_nocoords') : win.daysTo > 15 ? t('wx_beyond') : t('wx_wait');
      f.appendChild(h('div', { class: 'card sm', id: 'wx-none' }, msg));
      return;
    }
    var stale = s.stale || !RB.S.online;
    box.appendChild(h('div', { class: 'wx-head' }, RB.chip(t('wx_lv_' + s.level), LV[s.level]),
      h('span', { class: 'sm', id: 'wx-upd' }, t('wx_upd', hhmm(new Date(s.fetched_at).getTime()), ago(s.ageH)))));
    if (stale && !past) box.appendChild(h('div', { class: 'banner wa', id: 'wx-stale' }, t('wx_stale', hhmm(new Date(s.fetched_at).getTime()))));
    if (!past) RB.wxAlerts(r, s).forEach(function (a) { box.appendChild(h('div', { class: 'banner ' + (a.level === 2 ? 'er' : 'wa'), role: a.level === 2 ? 'alert' : null }, a.text)); });
    if (!past && s.level === 0 && !s.dark) box.appendChild(h('div', { class: 'banner acc' }, t('wx_all_ok')));
    var card = h('div', { class: 'card wxc', style: 'margin-top:8px' }), day = 0;
    s.pts.forEach(function (p) {
      if (L.runDays(r) > 1 && p.day !== day) { day = p.day; card.appendChild(h('div', { class: 'sec-t', style: 'margin:6px 0' }, h('span', null, t('day_n', day)))); }
      var fl = p.flags.length ? h('div', { class: 'chips' }, p.flags.map(function (k) { return RB.chip(t('wxf_' + k), (k === 'rain' || k === 'cold' || k === 'heat' || k === 'lowvis' || (k === 'gust' && p.level === 1) || (k === 'wind' && p.level === 1)) ? 'wa' : 'er'); })) : null;
      card.appendChild(h('div', { class: 'wx-pt' }, h('div', { class: 'wx-l' }, h('b', null, hhmm(p.eta)), h('span', null, ' ' + (p.label || t(p.role === 'dest' ? 'destination' : p.role === 'meeting' ? 'meeting' : 'stops'))),
        p.dark ? h('span', { class: 'sm' }, ' 🌙') : null), h('div', { class: 'wx-m' }, metric(p.rec)), fl));
    });
    box.appendChild(card);
    box.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('wx_note')));
    f.appendChild(box);
  };

  /* barra degli avvisi in cima all'elenco Run: Run entro 72 ore o in corso */
  RB.wxBanners = function (root, runs) {
    var now = Date.now(), n = 0;
    runs.forEach(function (r) {
      if (r.status !== 'programmato') return;
      var w = L.wxWindow(r, now);
      if (w.after || w.daysTo > 3) return;
      var s = RB.wxSum(r);
      if (!s || !s.covered) return;
      var al = RB.wxAlerts(r, s).filter(function (a) { return a.level === 2 || a.text.indexOf('🌙') < 0; });
      if (!al.length) return;
      n++;
      root.appendChild(h('div', { class: 'banner ' + (s.level === 2 ? 'er' : 'wa'), role: 'button', tabindex: '0', style: 'cursor:pointer', onclick: function () { RB.openRun(r.id); } },
        h('b', null, '⛅ ' + r.title), h('div', { class: 'sm', style: 'color:inherit;margin-top:2px' }, al[0].text), al.length > 1 ? h('div', { class: 'sm', style: 'color:inherit' }, '+' + (al.length - 1)) : null));
    });
    return n;
  };

  /* avvisi quando il livello peggiora (solo Run imminenti) */
  RB.on('data', function (d) {
    if (!d || !d.weather) return;
    var prev = {}, now = Date.now();
    try { prev = JSON.parse(localStorage.getItem('rb.wxlv') || '{}'); } catch (e) {}
    var next = {};
    (d.runs || []).forEach(function (r) {
      if (r.status !== 'programmato' || !d.weather[r.id]) return;
      var w = L.wxWindow(r, now); if (w.after) return;
      var s = L.wxSummary(r, d.weather[r.id], now); if (!s || !s.covered) return;
      next[r.id] = s.level;
      if (w.daysTo <= 3 && s.level > (prev[r.id] || 0) && s.level >= 1) {
        var a = RB.wxAlerts(r, s)[0];
        if (a) {
          RB.toast('⛅ ' + r.title + ': ' + a.text, s.level === 2 ? 'err' : '');
          try { if (window.Notification && Notification.permission === 'granted' && document.hidden) new Notification(r.title, { body: a.text }); } catch (e) {}
        }
      }
    });
    try { localStorage.setItem('rb.wxlv', JSON.stringify(next)); } catch (e) {}
  });
})();
