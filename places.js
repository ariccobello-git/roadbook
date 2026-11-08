/* Roadbook · scelta dei luoghi (ritrovo, tappe, destinazione): predefiniti, elenco a scalare, indirizzo, mappa */
(function () {
  'use strict';
  var RB = window.RB = window.RB || {}, h = RB.h, t = RB.t, L = window.RBL;
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  var NOMINATIM = 'https://nominatim.openstreetmap.org';
  var LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
  var cache = {};

  /* ---------- rete ---------- */
  function getJson(url, ms) {
    return new Promise(function (resolve, reject) {
      var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); reject(new Error('timeout')); }, ms || 25000);
      fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }).then(function (j) { clearTimeout(to); resolve(j); }, function (e) { clearTimeout(to); reject(e); });
    });
  }
  function overpass(q) {
    var i = 0;
    function next() {
      if (i >= OVERPASS.length) return Promise.reject(new Error('overpass'));
      return getJson(OVERPASS[i++] + '?data=' + encodeURIComponent(q), 30000).catch(next);
    }
    return next();
  }
  function lang() { return (RB.pref && RB.pref.lang) || 'it'; }
  RB.geo = {
    search: function (q) {
      return getJson(NOMINATIM + '/search?format=jsonv2&addressdetails=1&limit=8&accept-language=' + lang() + '&q=' + encodeURIComponent(q), 15000).then(L.parseNominatim);
    },
    reverse: function (lat, lng) {
      return getJson(NOMINATIM + '/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=' + lang() + '&lat=' + lat + '&lon=' + lng, 15000)
        .then(function (j) { return L.parseReverse(j, lat, lng); }, function () { return L.parseReverse(null, lat, lng); });
    },
    pois: function (kind, lat, lng, r) {
      var key = [kind, lat.toFixed(3), lng.toFixed(3), r].join('|');
      if (cache[key]) return Promise.resolve(cache[key]);
      return overpass(L.overpassQuery(kind, lat, lng, r * 1000)).then(function (j) { var o = L.parseOverpass(j, kind, lat, lng); cache[key] = o; return o; });
    },
    zones: function (lat, lng) {
      var key = 'z|' + lat.toFixed(2) + '|' + lng.toFixed(2);
      if (cache[key]) return Promise.resolve(cache[key]);
      return overpass(L.zonesQuery(lat, lng)).then(function (j) { var o = L.parseZones(j); cache[key] = o; return o; });
    },
    /* km su strada (OSRM); se non disponibile si usa la stima in linea d'aria */
    route: function (places) {
      var u = L.osrmUrl(places);
      if (!u) return Promise.resolve(null);
      return getJson(u, 15000).then(L.parseOsrm, function () { return null; });
    },
    /* aggiunge a meeting/tappe/destinazione i minuti di percorso dal navigatore (tm); in caso di errore lascia invariato */
    withTimes: function (p) {
      var days = p.days || 1, jobs = [], d;
      function clear(x) { if (x) delete x.tm; }
      clear(p.meeting); clear(p.dest); (p.stops || []).forEach(clear);
      for (d = 1; d <= days; d++) (function (day) {
        var pl = L.dayPlaces(p, days > 1 ? day : undefined), u = L.osrmUrl(pl);
        if (u) jobs.push(getJson(u, 6000).then(function (j) { L.applyTimes(pl, L.parseOsrmLegs(j), day); }, function () {}));
      })(d);
      return Promise.all(jobs).then(function () { return p; });
    }
  };

  var leafletP = null;
  RB.loadLeaflet = function () {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    leafletP = new Promise(function (res, rej) {
      var base = RB.LEAFLET_BASE || LEAFLET;
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + 'leaflet.css'; document.head.appendChild(css);
      var s = document.createElement('script'); s.src = base + 'leaflet.js';
      s.onload = function () { res(window.L); }; s.onerror = function () { leafletP = null; rej(new Error('leaflet')); };
      document.head.appendChild(s);
    });
    return leafletP;
  };

  /* ---------- etichette ---------- */
  var KIND_ICON = { area: 'route', hotel: 'pin', ristorante: 'pin', hd: 'moto', bar: 'pin', agri: 'pin', altro: 'pin' };
  RB.kindLabel = function (k) { return t('pk_' + (L.PLACE_KINDS.indexOf(k) >= 0 ? k : 'altro')); };
  RB.placeLabel = function (p) { return p ? (p.name || p.addr || '') : ''; };
  function clean(p) {
    return { name: (p.name || '').trim(), addr: (p.addr || '').trim(), kind: p.kind || 'altro', lat: L.hasCoords(p) ? +p.lat : undefined, lng: L.hasCoords(p) ? +p.lng : undefined };
  }

  /* ---------- selettore ---------- */
  /* o: {title, kinds, withFungo, value, onpick} */
  RB.placePicker = function (o) {
    var kinds = o.kinds || L.PLACE_KINDS, sel = o.value ? clean(o.value) : null, kind = (sel && kinds.indexOf(sel.kind) >= 0 ? sel.kind : kinds[0]);
    var mode = kind === 'altro' ? 'addr' : 'list';
    var drill = { city: null, zone: null, radius: 15 }, map = null, ctl;
    var box = h('div', { class: 'pp' }), top = h('div'), pane = h('div', { class: 'pp-pane' }), sum = h('div', { class: 'pp-sum' });

    function select(p) { sel = clean(p); sel.kind = p.kind || kind; drawSum(); }
    function kindBar() {
      var bar = h('div', { class: 'kbar' });
      kinds.forEach(function (k) {
        bar.appendChild(h('button', { type: 'button', class: 'kchip' + (k === kind ? ' on' : ''), onclick: function () {
          RB.feel('tap'); kind = k; if (k === 'altro' && mode === 'list') mode = 'addr'; drill.zone = null; drawTop(); drawPane();
        } }, RB.icon(KIND_ICON[k]), RB.kindLabel(k)));
      });
      return bar;
    }
    function drawTop() {
      RB.clear(top);
      if (o.withFungo) {
        top.appendChild(h('div', { class: 'pp-def' },
          h('button', { type: 'button', class: 'btn sec', onclick: function () { RB.feel('ok'); finish(Object.assign({}, L.FUNGO)); } }, RB.icon('pin'), L.FUNGO.name),
          h('button', { type: 'button', class: 'btn sec', onclick: function () { RB.feel('tap'); kind = 'area'; mode = 'list'; drill.zone = null; drawTop(); drawPane(); } }, RB.icon('route'), t('pk_area'))));
      }
      if (kinds.length > 1) top.appendChild(kindBar());
      var modes = [{ v: 'list', label: t('pp_list') }, { v: 'addr', label: t('pp_addr') }, { v: 'map', label: t('pp_map') }];
      if (kind === 'altro') modes.shift();
      top.appendChild(RB.seg(modes, mode, function (v) { mode = v; drawPane(); }));
    }
    function status(txt, cls) { return h('div', { class: 'pp-st ' + (cls || '') }, txt); }
    function placeRow(p, extra) {
      var on = sel && sel.lat === p.lat && sel.lng === p.lng && sel.name === (p.name || '');
      return h('button', { type: 'button', class: 'row pp-r' + (on ? ' on' : ''), onclick: function () {
        RB.feel('tap'); select(p); Array.prototype.forEach.call(pane.querySelectorAll('.pp-r'), function (e) { e.classList.remove('on'); }); this.classList.add('on');
      } }, h('span', { class: 'rt' }, h('b', null, p.name || t('pk_area')), (p.addr || p.info) ? h('span', null, [p.addr, p.info].filter(Boolean).join(' · ')) : null),
      extra != null ? h('span', { class: 'rv' }, extra) : null);
    }

    /* --- Elenco a scalare: città > zona > tabella --- */
    function paneList() {
      var d = h('div');
      if (!drill.city) {
        d.appendChild(h('div', { class: 'sm', style: 'padding:0 4px 8px' }, t('pp_pick_city')));
        var row = h('div', { class: 'kbar' });
        L.CITIES.forEach(function (c) { row.appendChild(h('button', { type: 'button', class: 'kchip', onclick: function () { RB.feel('tap'); drill.city = c; drill.zone = null; drawPane(); } }, c.name)); });
        d.appendChild(row);
        var inp = h('input', { id: 'pp-city', type: 'search', placeholder: t('pp_other_city'), autocomplete: 'off', maxlength: 60 }), res = h('div', { class: 'list', style: 'margin-top:10px' });
        d.appendChild(h('form', { class: 'pp-sf', onsubmit: function (e) {
          e.preventDefault(); var q = inp.value.trim(); if (!q) return;
          RB.clear(res); res.appendChild(status(t('pp_loading')));
          RB.geo.search(q).then(function (r) {
            RB.clear(res);
            if (!r.length) { res.appendChild(status(t('pp_none'))); return; }
            r.slice(0, 5).forEach(function (c) {
              res.appendChild(RB.row({ lead: RB.icon('pin'), title: (c.name || c.addr.split(',')[0]), sub: c.addr, onclick: function () { drill.city = { name: c.name || c.addr.split(',')[0], lat: c.lat, lng: c.lng }; drill.zone = null; drawPane(); } }));
            });
          }, function () { RB.clear(res); res.appendChild(status(t('pp_offline'), 'er')); });
        } }, inp, h('button', { type: 'submit', class: 'btn pri sm2' }, RB.icon('search'), t('pp_search'))));
        d.appendChild(res);
        return d;
      }
      var crumb = h('div', { class: 'pp-cr' },
        h('button', { type: 'button', class: 'lnk', onclick: function () { drill.city = null; drill.zone = null; drawPane(); } }, drill.city.name),
        drill.zone ? h('span', null, ' › ') : null,
        drill.zone ? h('button', { type: 'button', class: 'lnk', onclick: function () { drill.zone = null; drawPane(); } }, drill.zone.name) : null);
      d.appendChild(crumb);
      if (!drill.zone) {
        d.appendChild(h('div', { class: 'sm', style: 'padding:0 4px 8px' }, t('pp_pick_zone')));
        var zl = h('div', { class: 'list' });
        zl.appendChild(RB.row({ lead: RB.icon('pin'), title: t('pp_whole_city'), onclick: function () { drill.zone = { name: t('pp_whole_city'), lat: drill.city.lat, lng: drill.city.lng }; drawPane(); } }));
        d.appendChild(zl);
        var addZones = function (zs) {
          zs.forEach(function (z) { zl.appendChild(RB.row({ title: z.name, onclick: function () { drill.zone = z; drawPane(); } })); });
        };
        if (drill.city.name === 'Roma') addZones(L.ROME_ZONES);
        else {
          var st = status(t('pp_loading')); d.appendChild(st);
          RB.geo.zones(drill.city.lat, drill.city.lng).then(function (zs) { if (st.parentNode) st.parentNode.removeChild(st); addZones(zs); }, function () { st.textContent = t('pp_offline'); st.className = 'pp-st er'; });
        }
        return d;
      }
      var kk = kind === 'altro' ? 'area' : kind;
      d.appendChild(RB.seg([{ v: '10', label: '10 km' }, { v: '25', label: '25 km' }, { v: '50', label: '50 km' }], String(drill.radius), function (v) { drill.radius = +v; drawPane(); }));
      var tab = h('div', { class: 'list', style: 'margin-top:10px' }), st2 = status(t('pp_loading')); d.appendChild(st2); d.appendChild(tab);
      RB.geo.pois(kk, drill.zone.lat, drill.zone.lng, drill.radius).then(function (r) {
        st2.textContent = r.length ? t('pp_found', r.length) : t('pp_none'); st2.className = 'pp-st';
        r.forEach(function (p) { tab.appendChild(placeRow(p, p.dist != null ? p.dist + ' km' : null)); });
        if (kk === 'hd' && r.length) d.appendChild(h('p', { class: 'sm', style: 'padding:6px' }, t('pp_hd_note')));
      }, function () { st2.textContent = t('pp_offline'); st2.className = 'pp-st er'; });
      return d;
    }

    /* --- Indirizzo --- */
    function paneAddr() {
      var d = h('div'), inp = h('input', { id: 'pp-q', type: 'search', placeholder: t('pp_addr_ph'), autocomplete: 'off', maxlength: 120 }), res = h('div', { class: 'list', style: 'margin-top:10px' });
      d.appendChild(h('form', { class: 'pp-sf', onsubmit: function (e) {
        e.preventDefault(); var q = inp.value.trim(); if (!q) return;
        RB.clear(res); res.appendChild(status(t('pp_loading')));
        RB.geo.search(q).then(function (r) {
          RB.clear(res);
          r.forEach(function (p) { p.kind = kind; res.appendChild(placeRow(p)); });
          if (!r.length) res.appendChild(status(t('pp_none')));
          res.appendChild(RB.row({ lead: RB.icon('edit'), title: t('pp_use_text'), sub: q, onclick: function () { select({ name: '', addr: q, kind: kind }); } }));
        }, function () {
          RB.clear(res); res.appendChild(status(t('pp_offline'), 'er'));
          res.appendChild(RB.row({ lead: RB.icon('edit'), title: t('pp_use_text'), sub: q, onclick: function () { select({ name: '', addr: q, kind: kind }); } }));
        });
      } }, inp, h('button', { type: 'submit', class: 'btn pri sm2' }, RB.icon('search'), t('pp_search'))));
      d.appendChild(res);
      d.appendChild(h('p', { class: 'sm', style: 'padding:6px' }, t('pp_addr_help')));
      return d;
    }

    /* --- Mappa --- */
    function paneMap() {
      var d = h('div'), mapEl = h('div', { class: 'pp-map' }), cross = h('div', { class: 'pp-x', 'aria-hidden': 'true' }), wrap = h('div', { class: 'pp-mw' }, mapEl, cross), msg = status(t('pp_map_help'));
      d.appendChild(wrap); d.appendChild(msg);
      d.appendChild(h('div', { class: 'pp-def', style: 'margin-top:10px' },
        h('button', { type: 'button', class: 'btn pri', id: 'pp-here', onclick: function () {
          if (!map) return; var c = map.getCenter(); msg.textContent = t('pp_loading');
          RB.geo.reverse(c.lat, c.lng).then(function (p) { p.kind = kind; select(p); msg.textContent = t('pp_map_set'); });
        } }, RB.icon('pin'), t('pp_use_point')),
        h('button', { type: 'button', class: 'btn sec', onclick: function () {
          if (!navigator.geolocation || !map) { msg.textContent = t('pp_no_gps'); return; }
          navigator.geolocation.getCurrentPosition(function (g) { map.setView([g.coords.latitude, g.coords.longitude], 15); }, function () { msg.textContent = t('pp_no_gps'); }, { timeout: 10000 });
        } }, RB.icon('route'), t('pp_my_pos'))));
      RB.loadLeaflet().then(function (Lf) {
        if (!mapEl.parentNode) return;
        var c = sel && L.hasCoords(sel) ? [sel.lat, sel.lng] : (RB.lastMap || [L.FUNGO.lat, L.FUNGO.lng]);
        map = Lf.map(mapEl, { zoomControl: true, attributionControl: true }).setView(c, sel && L.hasCoords(sel) ? 15 : (RB.lastMap ? 11 : 13));
        Lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
        map.on('moveend', function () { var m = map.getCenter(); RB.lastMap = [m.lat, m.lng]; });
        window.rbMap = map;
        setTimeout(function () { if (map) map.invalidateSize(); }, 400);
      }, function () { msg.textContent = t('pp_offline'); msg.className = 'pp-st er'; });
      return d;
    }

    function drawPane() {
      if (map) { try { map.remove(); } catch (e) {} map = null; }
      RB.clear(pane);
      pane.appendChild(mode === 'list' && kind !== 'altro' ? paneList() : mode === 'map' ? paneMap() : paneAddr());
    }
    function drawSum() {
      RB.clear(sum);
      if (!sel) { sum.appendChild(h('p', { class: 'sm' }, t('pp_nothing'))); return; }
      sum.appendChild(h('div', { class: 'list' },
        RB.field(t('pp_name'), h('input', { id: 'pp-name', type: 'text', value: sel.name, maxlength: 80, oninput: function (e) { sel.name = e.target.value; } })),
        RB.field(t('stop_addr'), h('input', { id: 'pp-addr', type: 'text', value: sel.addr, maxlength: 200, oninput: function (e) { sel.addr = e.target.value; sel.lat = sel.lng = undefined; var c = document.getElementById('pp-co'); if (c) c.textContent = t('pp_no_coords'); } }))));
      sum.appendChild(h('div', { class: 'sm', id: 'pp-co', style: 'padding:4px 8px' }, L.hasCoords(sel) ? sel.lat.toFixed(5) + ', ' + sel.lng.toFixed(5) : t('pp_no_coords')));
    }
    function finish(p) {
      p = clean(p);
      if (!p.name && !p.addr) { RB.toast(t('pp_nothing'), 'err'); return; }
      o.onpick(p); ctl.close(true);
    }
    box.appendChild(top); box.appendChild(pane); box.appendChild(h('div', { class: 'sec-t' }, h('span', null, t('pp_selected')))); box.appendChild(sum);
    ctl = RB.sheet({ title: o.title, content: box, full: true, leftLabel: t('cancel'), onclose: function () { if (map) { try { map.remove(); } catch (e) {} map = null; } },
      right: { label: t('pp_confirm'), fn: function () { if (sel) finish(sel); else RB.toast(t('pp_nothing'), 'err'); } } });
    drawTop(); drawPane(); drawSum();
    return ctl;
  };

  /* riga con il luogo scelto: toccando si apre il selettore */
  RB.placeRow = function (o) {
    var holder = h('div', { class: 'list' });
    function draw() {
      RB.clear(holder);
      var p = o.get();
      holder.appendChild(RB.row({
        lead: RB.icon(p ? KIND_ICON[p.kind] || 'pin' : 'plus'), title: o.label, sub: p ? RB.placeLabel(p) + (p.name && p.addr ? ' · ' + p.addr : '') : t('pp_choose'),
        value: p && !L.hasCoords(p) ? '⚠︎' : '',
        onclick: function () { RB.placePicker({ title: o.label, kinds: o.kinds, withFungo: o.withFungo, value: p, onpick: function (np) { o.set(np); draw(); if (o.changed) o.changed(); } }); }
      }));
    }
    draw();
    holder.redraw = draw;
    return holder;
  };
})();
