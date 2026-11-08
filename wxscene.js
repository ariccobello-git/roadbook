/* Roadbook · scena meteo animata (pioggia, vento, temporale, sole forte, neve, nebbia) */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h;

  /* posizione "casuale" ma stabile: la scena non cambia a ogni disegno */
  function rnd(i, k) { var x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }
  function layer(cls) { return h('div', { class: 'wxl ' + cls }); }

  RB.wxScene = function (sc, compact) {
    var root = h('div', { class: 'wxs sky-' + sc.sky + (compact ? ' cmp' : ''), 'data-sky': sc.sky, 'data-rain': sc.rain, 'data-wind': sc.wind, 'data-sun': sc.sun, role: 'img', 'aria-hidden': 'true' }), i, n, el;
    if (sc.night) { var st = layer('wx-stars'); for (i = 0; i < 14; i++) st.appendChild(h('i', { style: 'left:' + Math.round(rnd(i, 1) * 96) + '%;top:' + Math.round(rnd(i, 2) * 55) + '%;animation-delay:' + (rnd(i, 3) * 3).toFixed(1) + 's' })); root.appendChild(st); root.appendChild(layer('wx-moon')); }
    if (sc.sun) {
      var sun = layer('wx-sun s' + sc.sun); sun.appendChild(h('div', { class: 'wx-rays' })); sun.appendChild(h('div', { class: 'wx-disc' })); root.appendChild(sun);
      if (sc.sun >= 2) root.appendChild(layer('wx-haze'));
    }
    if (sc.cloud) { n = sc.cloud + 1; for (i = 0; i < n; i++) root.appendChild(h('div', { class: 'wxl wx-cloud c' + sc.cloud, style: 'top:' + (6 + i * 14 + Math.round(rnd(i, 4) * 8)) + 'px;left:' + (-10 + Math.round(rnd(i, 5) * 60)) + '%;animation-duration:' + (38 - sc.wind * 7 + i * 6) + 's;animation-delay:-' + Math.round(rnd(i, 6) * 30) + 's' })); }
    if (sc.fog) { for (i = 0; i < 3; i++) root.appendChild(h('div', { class: 'wxl wx-fogb', style: 'top:' + (30 + i * 28) + '%;animation-duration:' + (16 + i * 5) + 's;animation-delay:-' + (i * 4) + 's' })); }
    if (sc.rain || sc.snow) {
      var cnt = sc.snow ? 26 : [0, 22, 38, 60][sc.rain], drops = layer(sc.snow ? 'wx-snow' : 'wx-rain r' + sc.rain + (sc.wind >= 1 ? ' slant' + Math.min(sc.wind, 3) : ''));
      for (i = 0; i < cnt; i++) drops.appendChild(h('i', { style: 'left:' + (rnd(i, 7) * 104 - 2).toFixed(1) + '%;animation-delay:-' + (rnd(i, 8) * 2).toFixed(2) + 's;animation-duration:' + (sc.snow ? (3 + rnd(i, 9) * 3).toFixed(1) : (0.55 + rnd(i, 9) * 0.4 - sc.rain * 0.06).toFixed(2)) + 's' }));
      root.appendChild(drops);
    }
    if (sc.wind) {
      var wl = layer('wx-wind w' + sc.wind); n = 4 + sc.wind * 3;
      for (i = 0; i < n; i++) wl.appendChild(h('b', { style: 'top:' + (8 + Math.round(rnd(i, 10) * 80)) + '%;width:' + (36 + Math.round(rnd(i, 11) * 60)) + 'px;animation-delay:-' + (rnd(i, 12) * 3).toFixed(2) + 's;animation-duration:' + (2.4 - sc.wind * 0.45 + rnd(i, 13) * 0.6).toFixed(2) + 's' }));
      root.appendChild(wl);
    }
    if (sc.storm) {
      root.appendChild(layer('wx-flash'));
      el = layer('wx-bolt'); el.innerHTML = '<svg viewBox="0 0 60 120" preserveAspectRatio="xMidYMin meet"><polygon points="38,0 14,58 30,58 20,120 50,40 33,40 46,0" /></svg>'; root.appendChild(el);
    }
    return root;
  };
})();
