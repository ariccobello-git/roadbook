/* Roadbook · helper UI: DOM sicuro, suoni, sheet, toast, immagini, formati */
(function () {
  'use strict';
  var RB = window.RB = window.RB || {};
  RB.RELEASE = '3.2.4';

  /* ---------- DOM sicuro: i testi sono sempre nodi di testo, mai HTML ---------- */
  function add(el, kids) {
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) add(el, c);
      else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
  }
  RB.h = function (tag, attrs) {
    var el = document.createElement(tag), k, v;
    if (attrs) for (k in attrs) {
      v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.charAt(0) === '.') el[k.slice(1)] = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    add(el, Array.prototype.slice.call(arguments, 2));
    return el;
  };
  var h = RB.h;
  RB.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* ---------- preferenze ---------- */
  var DEF = { lang: '', theme: 'blu', ap: 'auto', sound: true };
  RB.pref = (function () {
    var p = {}, k;
    try { p = JSON.parse(localStorage.getItem('rb.pref') || '{}') || {}; } catch (e) { p = {}; }
    for (k in DEF) if (p[k] === undefined) p[k] = DEF[k];
    if (!p.lang) { var n = (navigator.language || 'it').slice(0, 2); p.lang = (n === 'en' || n === 'fr') ? n : 'it'; }
    return p;
  })();
  RB.THEMES = ['arancio', 'rosso', 'rosa', 'viola', 'indaco', 'blu', 'verde', 'grafite', 'garage'];
  RB.savePref = function () { try { localStorage.setItem('rb.pref', JSON.stringify(RB.pref)); } catch (e) {} };
  RB.applyPref = function () {
    var r = document.documentElement;
    r.setAttribute('data-th', RB.pref.theme);
    r.setAttribute('data-ap', RB.pref.ap);
    r.setAttribute('lang', RB.pref.lang);
    var dark = RB.pref.theme === 'garage' || RB.pref.ap === 'dark' || (RB.pref.ap === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', dark ? '#000000' : '#f2f2f7');
  };

  /* ---------- suoni e vibrazione (leggeri, WebAudio) ---------- */
  var ctx = null;
  function tone(f, d, type, g, at) {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      var o = ctx.createOscillator(), a = ctx.createGain(), t0 = ctx.currentTime + (at || 0);
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
      a.gain.setValueAtTime(0.0001, t0);
      a.gain.exponentialRampToValueAtTime(g || 0.05, t0 + 0.01);
      a.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(a); a.connect(ctx.destination); o.start(t0); o.stop(t0 + d + 0.02);
    } catch (e) {}
  }
  RB.sound = function (kind) {
    if (!RB.pref.sound) return;
    if (kind === 'tap') tone(660, 0.05, 'sine', 0.035);
    else if (kind === 'ok') { tone(523, 0.09, 'sine', 0.05); tone(784, 0.14, 'sine', 0.05, 0.08); }
    else if (kind === 'err') { tone(220, 0.16, 'triangle', 0.06); }
    else if (kind === 'open') tone(440, 0.07, 'sine', 0.03);
    else if (kind === 'close') tone(330, 0.07, 'sine', 0.03);
  };
  RB.haptic = function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {} };
  RB.feel = function (kind) { RB.sound(kind); RB.haptic(kind === 'err' ? 30 : 8); };

  /* ---------- toast ---------- */
  RB.toast = function (msg, kind) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var el = h('div', { class: 'toast ' + (kind || ''), role: 'status' }, msg);
    host.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('in'); });
    RB.feel(kind === 'err' ? 'err' : 'ok');
    setTimeout(function () { el.classList.remove('in'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300); }, kind === 'err' ? 4200 : 2200);
  };

  /* ---------- sheet (finestre a scorrimento dal basso; modali su PC) ---------- */
  var stack = [];
  RB.sheets = stack;
  RB.sheet = function (o) {
    var host = document.getElementById('sheets');
    var back = h('div', { class: 'back' });
    var ctl = { opts: o, closed: false };
    var left = h('button', { class: 'sb l', type: 'button', onclick: function () { ctl.close(); } }, o.leftLabel || RB.t('close'));
    var right = o.right ? h('button', { class: 'sb r' + (o.right.danger ? ' dng' : ''), type: 'button', onclick: function () { o.right.fn(ctl); } }, o.right.label) : h('span', { class: 'sb r' });
    var title = h('b', { class: 'stt' }, o.title || '');
    var body = h('div', { class: 'sbody' });
    var box = h('div', { class: 'sheet' + (o.full ? ' full' : '') + (o.cls ? ' ' + o.cls : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'grab' }), h('div', { class: 'sbar' }, left, title, right), body);
    ctl.el = box; ctl.body = body; ctl.right = right;
    ctl.setTitle = function (s) { title.textContent = s; };
    ctl.set = function (node) { RB.clear(body); body.appendChild(node); };
    ctl.close = function (silent) {
      if (ctl.closed) return; ctl.closed = true;
      var i = stack.indexOf(ctl); if (i >= 0) stack.splice(i, 1);
      box.classList.remove('in'); back.classList.remove('in');
      if (!silent) RB.sound('close');
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); if (back.parentNode) back.parentNode.removeChild(back); }, 280);
      if (!stack.length) document.body.classList.remove('lock');
      if (o.onclose) o.onclose();
    };
    back.addEventListener('click', function () { if (stack[stack.length - 1] === ctl) ctl.close(); });
    host.appendChild(back); host.appendChild(box);
    stack.push(ctl);
    document.body.classList.add('lock');
    if (o.content) body.appendChild(o.content);
    requestAnimationFrame(function () { requestAnimationFrame(function () { back.classList.add('in'); box.classList.add('in'); }); });
    RB.sound('open');
    return ctl;
  };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close();
  });

  /* menu di azioni (action sheet) */
  RB.menu = function (title, items) {
    var box = h('div', { class: 'list' });
    var ctl;
    items.forEach(function (it) {
      if (!it) return;
      box.appendChild(h('button', { type: 'button', class: 'row act' + (it.danger ? ' dng' : ''), onclick: function () { RB.feel('tap'); ctl.close(true); if (it.fn) setTimeout(it.fn, 60); } },
        h('span', { class: 'rt' }, it.label)));
    });
    ctl = RB.sheet({ title: title, content: box, cls: 'menu' });
    return ctl;
  };

  /* conferma */
  RB.ask = function (o) {
    return new Promise(function (res) {
      var done = false, ctl;
      function fin(v) { if (done) return; done = true; res(v); }
      var box = h('div', { class: 'ask' },
        o.msg ? h('p', { class: 'sm' }, o.msg) : null,
        h('button', { type: 'button', class: 'btn ' + (o.danger ? 'dng' : 'pri'), onclick: function () { fin(true); ctl.close(true); } }, o.ok || RB.t('ok')),
        h('button', { type: 'button', class: 'btn sec', onclick: function () { fin(false); ctl.close(); } }, o.no || RB.t('cancel')));
      ctl = RB.sheet({ title: o.title, content: box, cls: 'menu', onclose: function () { fin(false); } });
    });
  };

  /* ---------- formati ---------- */
  var LOC = { it: 'it-IT', en: 'en-GB', fr: 'fr-FR' };
  RB.loc = function () { return LOC[RB.pref.lang] || 'it-IT'; };
  RB.fmt = {
    day: function (d) { return new Date(d).toLocaleDateString(RB.loc(), { weekday: 'long', day: 'numeric', month: 'long' }); },
    dayShort: function (d) { return new Date(d).toLocaleDateString(RB.loc(), { weekday: 'short', day: 'numeric', month: 'short' }); },
    full: function (d) { return new Date(d).toLocaleDateString(RB.loc(), { day: 'numeric', month: 'long', year: 'numeric' }); },
    time: function (d) { return new Date(d).toLocaleTimeString(RB.loc(), { hour: '2-digit', minute: '2-digit' }); },
    month: function (d) { return new Date(d).toLocaleDateString(RB.loc(), { month: 'short' }).replace('.', ''); },
    money: function (n) { return Number(n || 0).toLocaleString(RB.loc(), { style: 'currency', currency: 'EUR' }); }
  };
  RB.localInput = function (iso) { // ISO -> valore per <input type=datetime-local>
    var d = new Date(iso), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  /* ---------- immagini: ritaglio e compressione sul dispositivo ---------- */
  RB.resizeImage = function (file, max, quality, square) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('not-image'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, hh = img.naturalHeight, sx = 0, sy = 0, sw = w, sh = hh, cw, ch;
        if (square) { var s = Math.min(w, hh); sx = (w - s) / 2; sy = (hh - s) / 2; sw = sh = s; cw = ch = Math.min(max, s); }
        else { var k = Math.min(1, max / Math.max(w, hh)); cw = Math.round(w * k); ch = Math.round(hh * k); }
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch);
        g.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('bad-image')); };
      img.src = url;
    });
  };
  /* foto tipo tessera: ritaglio verticale 3:4 (leggermente verso l'alto, dove sta il viso), 240x320, JPEG leggero (circa 10-25 KB) */
  RB.tessera = function (file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('not-image'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, hh = img.naturalHeight, sw = w, sh = Math.round(w * 4 / 3), sx = 0, sy;
        if (sh > hh) { sh = hh; sw = Math.round(hh * 3 / 4); sx = Math.round((w - sw) / 2); sy = 0; }
        else sy = Math.round((hh - sh) * 0.3);
        var c = document.createElement('canvas'); c.width = 240; c.height = 320;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 240, 320); g.drawImage(img, sx, sy, sw, sh, 0, 0, 240, 320);
        URL.revokeObjectURL(url);
        var q = 0.78, d = c.toDataURL('image/jpeg', q);
        while (d.length > 36000 && q > 0.4) { q -= 0.08; d = c.toDataURL('image/jpeg', q); }
        d.length > 60000 ? rej(new Error('too-big')) : res(d);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('bad-image')); };
      img.src = url;
    });
  };
  RB.pickImage = function (cb, camera) {
    var inp = h('input', { type: 'file', accept: 'image/*', capture: camera ? 'user' : null, style: 'display:none', onchange: function () { var f = inp.files && inp.files[0]; if (inp.parentNode) inp.parentNode.removeChild(inp); if (f) cb(f); } });
    document.body.appendChild(inp); inp.click();
  };

  /* ---------- varie ---------- */
  RB.copy = function (text) {
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    return Promise.resolve(fallback());
  };
  RB.isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document || /iPad|iPhone|iPod/.test(navigator.userAgent);
  RB.mapsUrl = function (q) {
    return (RB.isApple ? 'https://maps.apple.com/?q=' : 'https://www.google.com/maps/search/?api=1&query=') + encodeURIComponent(q);
  };
  RB.safeUrl = function (u) { return /^https?:\/\//i.test(u || '') ? u : null; };
  RB.hue = function (s) { var x = 0, i; s = String(s || ''); for (i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 360; return x; };
  RB.icon = function (name) {
    var P = {
      sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4', run: 'M3 17l4-8 3 5 3-9 4 12M3 21h18', soci: 'M16 11a4 4 0 10-8 0M4 21a8 8 0 0116 0', dir: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.3 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z',
      quote: 'M3 7h18v10H3zM3 11h18M7 15h3', altro: 'M5 12h.01M12 12h.01M19 12h.01', plus: 'M12 5v14M5 12h14', chev: 'M9 6l6 6-6 6', up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6',
      pin: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z', route: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h6a3 3 0 000-6h-4a3 3 0 010-6h6',
      phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z', cam: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
      check: 'M5 12l5 5 9-10', out: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9', x: 'M6 6l12 12M18 6L6 18', share: 'M12 15V3M8 7l4-4 4 4M5 12v8h14v-8', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', edit: 'M4 20h4L19 9l-4-4L4 16z',
      search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5', file: 'M7 3h7l5 5v13H7zM14 3v5h5', copy: 'M9 9h11v11H9zM5 15V4h11', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
      clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', moto: 'M5 17a3 3 0 100-6 3 3 0 000 6zM19 17a3 3 0 100-6 3 3 0 000 6zM8 14h5l3-5h3M10 9h3'
    };
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', P[name] || ''); s.appendChild(p); return s;
  };
})();
