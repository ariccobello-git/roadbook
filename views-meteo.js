/* Roadbook · scheda Meteo: dove sono, tappe dei Run in programma, luoghi cercati e salvati */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t, L = window.RBL;
  var KEY = 'rb.wxplaces';

  function saved() { try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(function (p) { return p && isFinite(p.lat) && isFinite(p.lng); }) : []; } catch (e) { return []; } }
  function store(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  function isSaved(p) { return saved().some(function (x) { return Math.abs(x.lat - p.lat) < 0.01 && Math.abs(x.lng - p.lng) < 0.01; }); }
  function shortName(p) { return (p.name || (p.addr || '').split(',')[0] || '').trim() || t('mt_here'); }

  /* scena animata + testi: luogo, temperatura, condizione */
  function sceneKey(sc) {
    if (sc.storm) return 'sc_storm'; if (sc.snow) return 'sc_snow'; if (sc.rain) return 'sc_rain' + sc.rain; if (sc.fog) return 'sc_fog';
    if (sc.sun >= 3) return 'sc_sun3'; if (sc.sun === 2) return 'sc_sun2'; if (sc.wind >= 2) return 'sc_wind' + sc.wind;
    if (sc.night) return 'sc_night'; return sc.sun === 1 ? 'sc_clear' : 'sc_cloud';
  }
  function heroBox(name, d, cur, compact) {
    var sc = L.wxScene(cur.rec, L.wxIsNight(d, cur.ms)), el = RB.wxScene(sc, compact), rec = cur.rec, lab = t(sceneKey(sc)) + (sc.wind >= 2 && (sc.rain || sc.storm) ? ' · ' + t('sc_windy') : '');
    el.id = compact ? null : 'mt-hero'; if (!compact) el.setAttribute('data-label', lab);
    el.appendChild(h('div', { class: 'wxs-in' }, h('div', { class: 'wxs-s' }, name),
      h('div', { class: 'wxs-row' }, h('div', null, h('div', { class: 'wxs-t' }, (rec.temp !== null ? Math.round(rec.temp) : '—') + '°'), h('div', { class: 'wxs-d' }, lab)),
        h('div', { class: 'wxs-s', style: 'text-align:right' }, rec.feels !== null && rec.temp !== null && Math.abs(rec.feels - rec.temp) >= 2 ? h('div', null, t('wx_feels') + ' ' + Math.round(rec.feels) + '°') : null,
          h('div', null, '💨 ' + (rec.wind !== null ? Math.round(rec.wind) : '—') + (rec.gust !== null ? ' · ' + Math.round(rec.gust) : '') + ' km/h'), h('div', null, '💧 ' + (rec.pop !== null ? rec.pop + '%' : '—'))))));
    return el;
  }
  /* verdetto per chi va in moto */
  function rideCard(rd, next) {
    var c = h('div', { class: 'ride l' + rd.level, id: 'mt-ride' }, h('div', { class: 'rd-dot' }, ['🏍️', '⚠️', '⛔'][rd.level]),
      h('div', null, h('b', null, t('ride_' + rd.level)), h('span', null, rd.best ? t('ride_best', RB.wxHm(rd.best.from), RB.wxHm(rd.best.to + 3600000)) : t('ride_nobest'))));
    var tips = h('ul', { class: 'tips' });
    rd.tips.forEach(function (k) { tips.appendChild(h('li', null, t('tip_' + k))); });
    if (rd.dress) tips.appendChild(h('li', null, '🧥 ' + t('dress_' + rd.dress)));
    return h('div', null, c, h('div', { class: 'card wxc', style: 'margin-top:8px' }, h('div', { class: 'sec-t', style: 'margin:0 0 4px' }, h('span', null, t('ride_title'))), tips));
  }

  /* scheda con le previsioni di un luogo */
  RB.placeWeather = function (pl) {
    var box = h('div'), ctl, star = null;
    try { localStorage.setItem('rb.wxlast', JSON.stringify({ n: pl.n, lat: pl.lat, lng: pl.lng })); } catch (e) {}
    function drawStar() {
      if (!star) return;
      var on = isSaved(pl);
      star.textContent = on ? t('mt_unsave') : t('mt_save');
      star.className = 'btn ' + (on ? 'sec' : 'pri');
    }
    star = h('button', { type: 'button', id: 'mt-star', style: 'margin-top:0', onclick: function () {
      if (isSaved(pl)) store(saved().filter(function (x) { return !(Math.abs(x.lat - pl.lat) < 0.01 && Math.abs(x.lng - pl.lng) < 0.01); }));
      else store(L.addPlace(saved(), pl));
      RB.feel('tap'); drawStar(); if (RB.ui.tab === 'meteo') RB.render();
    } });
    drawStar();
    box.appendChild(h('p', { class: 'sm', id: 'mt-load' }, t('loading')));
    ctl = RB.sheet({ title: pl.n, content: box, full: true, leftLabel: t('close') });
    RB.geo.forecast(pl.lat, pl.lng).then(function (r) {
      RB.clear(box);
      var d = r.data, now = Date.now(), next = L.wxNext(d, now, 12), days = L.wxDays(d), cur = next[0];
      if (!cur) { box.appendChild(h('div', { class: 'card sm' }, t('wx_nodata'))); return; }
      var rd = L.wxRide(next, d);
      box.appendChild(heroBox(pl.n, d, cur, false));
      box.appendChild(h('div', { class: 'wx-head', style: 'margin-bottom:0' }, h('span', { class: 'sm', id: 'mt-upd' }, t('mt_upd', RB.wxHm(new Date(d.at || now).getTime())))));
      if (r.cached || !RB.S.online) box.appendChild(h('div', { class: 'banner wa', id: 'mt-stale' }, t('wx_stale', RB.wxHm(new Date(d.at || now).getTime()))));
      box.appendChild(rideCard(rd, next));
      var worst = next.slice(0, 6).filter(function (x) { return x.level > 0; }).sort(function (a, b) { return b.level - a.level || a.ms - b.ms; })[0];
      if (worst) box.appendChild(h('div', { class: 'banner ' + (worst.level === 2 ? 'er' : 'wa'), role: worst.level === 2 ? 'alert' : null, style: 'margin-top:10px' }, t('mt_alert', RB.wxHm(worst.ms), RB.wxFlagsText(worst.flags))));
      box.appendChild(h('div', { class: 'card wxc', style: 'margin-top:10px' }, h('div', { class: 'sec-t', style: 'margin:0 0 6px' }, h('span', null, t('mt_now'))), h('div', { class: 'wx-m', id: 'mt-cur', style: 'font-size:17px' }, RB.wxMetric(cur.rec))));
      box.appendChild(h('div', { class: 'sec-t' }, h('span', null, t('mt_hours'))));
      var strip = h('div', { class: 'hstrip', id: 'mt-hours' });
      next.forEach(function (x) {
        strip.appendChild(h('div', { class: 'hcell l' + x.level }, h('small', null, RB.wxHm(x.ms)), h('div', { class: 'hi' }, L.WX_ICON[L.wxKind(x.rec.code)]), h('b', null, (x.rec.temp !== null ? Math.round(x.rec.temp) : '—') + '°'),
          h('small', null, '💧' + (x.rec.pop !== null ? x.rec.pop + '%' : '—')), h('small', null, '💨' + (x.rec.wind !== null ? Math.round(x.rec.wind) : '—'))));
      });
      box.appendChild(strip);
      var dc = h('div', { class: 'card wxc', style: 'margin-top:8px' }, h('div', { class: 'sec-t', style: 'margin:0 0 6px' }, h('span', null, t('mt_days'))));
      days.forEach(function (x) {
        var dt = new Date(x.date + 'T12:00:00');
        dc.appendChild(h('div', { class: 'wx-pt' }, h('div', { class: 'wx-l' }, h('b', null, dt.toLocaleDateString(RB.pref.lang || 'it', { weekday: 'short', day: 'numeric', month: 'short' }))),
          h('div', { class: 'wx-m' }, L.WX_ICON[L.wxKind(x.code)] + ' ' + (x.min !== null ? Math.round(x.min) : '—') + '° / ' + (x.max !== null ? Math.round(x.max) : '—') + '°  💧 ' + (x.pop !== null ? x.pop + '%' : '—') + (x.precip ? ' · ' + (Math.round(x.precip * 10) / 10) + ' mm' : '') + '  💨 ' + (x.gust !== null ? Math.round(x.gust) : '—') + ' km/h')));
      });
      box.appendChild(dc);
      box.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('mt_note')));
      box.appendChild(h('div', { style: 'margin-top:12px' }, star));
    }, function () {
      RB.clear(box); box.appendChild(h('div', { class: 'card sm', id: 'mt-err' }, t('mt_offline')));
    });
    return ctl;
  };

  function placeRow(p, onRemove) {
    var row = RB.row({ lead: RB.icon('pin'), title: p.n || shortName(p), sub: t('mt_tap'), onclick: function () { RB.placeWeather(p); } });
    var sub = row.querySelector('.rt span');
    RB.geo.forecast(p.lat, p.lng).then(function (r) {
      var cur = L.wxNext(r.data, Date.now(), 1)[0];
      if (cur && sub) sub.textContent = RB.wxMetric(cur.rec) + (r.cached ? ' · ' + t('mt_cached') : '');
    }, function () {});
    if (onRemove) row.appendChild(h('button', { type: 'button', class: 'btn ghost sm2', 'aria-label': t('delete'), onclick: function (e) { e.stopPropagation(); onRemove(); } }, RB.icon('x')));
    return row;
  }

  RB.views.meteo = function (root) {
    root.appendChild(RB.title(t('tab_meteo'), t('mt_sub')));
    var lastP = null; try { lastP = JSON.parse(localStorage.getItem('rb.wxlast') || 'null'); } catch (e) {}
    if (lastP && isFinite(lastP.lat) && isFinite(lastP.lng)) {
      var hh = h('div', { id: 'mt-last', style: 'margin-top:8px;cursor:pointer', role: 'button', tabindex: '0', onclick: function () { RB.placeWeather(lastP); } });
      root.appendChild(hh);
      RB.geo.forecast(lastP.lat, lastP.lng).then(function (r) {
        var cur = L.wxNext(r.data, Date.now(), 1)[0]; if (cur && hh.isConnected !== false) hh.appendChild(heroBox(lastP.n, r.data, cur, true));
      }, function () {});
    }
    var res = h('div', { id: 'mt-res', style: 'margin-top:8px' });
    var q = RB.input('mt-q', '', { ph: t('mt_ph'), max: 80 });
    function search() {
      var v = (q.value || '').trim(); if (v.length < 2) return;
      RB.clear(res); res.appendChild(h('p', { class: 'sm' }, t('loading')));
      RB.geo.search(v).then(function (list) {
        RB.clear(res);
        if (!list.length) { res.appendChild(h('div', { class: 'card sm' }, t('mt_none'))); return; }
        var l = h('div', { class: 'list' });
        list.slice(0, 6).forEach(function (p) { l.appendChild(RB.row({ lead: RB.icon('pin'), title: shortName(p), sub: p.addr, onclick: function () { RB.placeWeather({ n: shortName(p) + (p.addr && p.addr.split(',')[0] !== shortName(p) ? ', ' + p.addr.split(',')[0] : ''), lat: p.lat, lng: p.lng }); } })); });
        res.appendChild(l);
      }, function () { RB.clear(res); res.appendChild(h('div', { class: 'card sm', id: 'mt-err' }, t('mt_offline'))); });
    }
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });
    root.appendChild(h('div', { class: 'list' }, RB.field(t('mt_search'), q)));
    root.appendChild(h('div', { style: 'display:flex;gap:8px;margin-top:8px' },
      h('button', { type: 'button', class: 'btn pri', id: 'mt-go', style: 'margin-top:0', onclick: search }, t('mt_find')),
      h('button', { type: 'button', class: 'btn sec', id: 'mt-here', style: 'margin-top:0;white-space:nowrap;padding-left:10px;padding-right:10px', onclick: here }, '📍 ' + t('mt_here'))));
    root.appendChild(res);

    /* Run in programma */
    var runs = RB.runs().filter(function (r) { var w = L.wxWindow(r, Date.now()); return r.status === 'programmato' && !w.after && w.daysTo <= 15; }).sort(function (a, b) { return new Date(a.run_date) - new Date(b.run_date); }).slice(0, 3);
    if (runs.length) {
      root.appendChild(RB.secT(t('mt_runs')));
      runs.forEach(function (r) {
        var s = RB.wxSum(r), card = h('div', { class: 'card wxc', style: 'margin-bottom:10px' });
        card.appendChild(h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer', role: 'button', tabindex: '0', onclick: function () { RB.openRun(r.id); } },
          h('b', null, r.title), s && s.covered ? RB.wxChip(r) : null));
        if (!s || !s.covered) card.appendChild(h('p', { class: 'sm' }, t('wx_wait')));
        else {
          var day = 0;
          s.pts.forEach(function (p) {
            if (L.runDays(r) > 1 && p.day !== day) { day = p.day; card.appendChild(h('div', { class: 'sec-t', style: 'margin:6px 0' }, h('span', null, t('day_n', day)))); }
            card.appendChild(h('div', { class: 'wx-pt' }, h('div', { class: 'wx-l' }, h('b', null, RB.wxHm(p.eta)), h('span', null, ' ' + (p.label || t(p.role === 'dest' ? 'destination' : p.role === 'meeting' ? 'meeting' : 'stops')))), h('div', { class: 'wx-m' }, RB.wxMetric(p.rec)),
              p.flags.length ? h('div', { class: 'chips' }, p.flags.map(function (k) { return RB.chip(t('wxf_' + k), p.level === 2 ? 'er' : 'wa'); })) : null));
          });
        }
        root.appendChild(card);
      });
    }

    /* luoghi salvati */
    var sv = saved();
    root.appendChild(RB.secT(t('mt_places')));
    if (!sv.length) root.appendChild(h('div', { class: 'card sm', id: 'mt-empty' }, t('mt_places_empty')));
    else {
      var pl = h('div', { class: 'list' });
      sv.forEach(function (p) { pl.appendChild(placeRow(p, function () { store(saved().filter(function (x) { return !(x.lat === p.lat && x.lng === p.lng); })); RB.render(); })); });
      root.appendChild(pl);
    }
  };

  function here() {
    if (!navigator.geolocation) { RB.toast(t('mt_noloc'), 'err'); return; }
    var b = document.getElementById('mt-here'); if (b) b.disabled = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      if (b) b.disabled = false;
      var la = pos.coords.latitude, lo = pos.coords.longitude;
      RB.geo.reverse(la, lo).then(function (p) { return shortName(p) + (p.addr && p.addr.split(',')[0] !== shortName(p) ? ', ' + p.addr.split(',')[0] : ''); }, function () { return t('mt_here'); })
        .then(function (n) { RB.placeWeather({ n: n, lat: +la.toFixed(5), lng: +lo.toFixed(5) }); });
    }, function () { if (b) b.disabled = false; RB.toast(t('mt_noloc'), 'err'); }, { timeout: 12000, maximumAge: 300000 });
  }
})();
