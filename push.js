/* Roadbook · notifiche push delle emergenze (per chi gestisce le emergenze) */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t;
  var VAPID = 'BBNPHpLbjwtvZnqOsHc-0zWfDRDXerku38I_tiQ_666qrh_3h98aZ892pqbsPTLFxVyz3ltw4Hr3EUnTvwGRcQY';
  function u8(b64) { var p = '='.repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  RB.pushSupported = function () { return !!(navigator.serviceWorker && window.PushManager && window.Notification); };
  /* su iPhone e iPad le notifiche funzionano solo se l'app è aggiunta alla schermata Home */
  RB.pushNeedsInstall = function () { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)); };
  RB.pushState = function () {
    if (!RB.pushSupported()) return Promise.resolve(RB.pushNeedsInstall() ? 'install' : 'unsupported');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) { return s && Notification.permission === 'granted' ? 'on' : 'off'; }, function () { return 'off'; });
  };
  RB.pushEnable = function () {
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') return { ok: false, error: 'denied' };
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(VAPID) }); });
      }).then(function (s) { return RB.rpc('rc_push_save', { p_code: RB.S.code, p_sub: s.toJSON() }); });
    }).catch(function () { return { ok: false, error: 'generic' }; });
  };
  RB.pushDisable = function () {
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) {
      if (!s) return { ok: true };
      var ep = s.endpoint; return s.unsubscribe().then(function () { return RB.rpc('rc_push_delete', { p_code: RB.S.code, p_endpoint: ep }); });
    }).catch(function () { return { ok: false, error: 'generic' }; });
  };
  /* notifica di prova a questo solo dispositivo: dimostra che arriva anche ad app chiusa */
  RB.pushTest = function () {
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) {
      return s ? RB.rpc('rc_push_test', { p_code: RB.S.code, p_endpoint: s.endpoint }) : { ok: false, error: 'not_found' };
    }).catch(function () { return { ok: false, error: 'generic' }; });
  };
  /* riga in Altro → Emergenze: attiva o disattiva */
  RB.pushRow = function () {
    var row = RB.row({ lead: RB.icon('alert'), title: t('push_title'), sub: t('push_checking'), go: false, cls: 'push-row' }), sub = row.querySelector('.rt span');
    var btn = h('button', { type: 'button', class: 'btn ghost sm2', id: 'push-btn', style: 'display:none' }, '');
    var tbtn = h('button', { type: 'button', class: 'btn ghost sm2', id: 'push-test', style: 'display:none' }, t('push_test'));
    tbtn.addEventListener('click', function () { RB.pushTest().then(function (r) { RB.toast(r && r.ok ? t('push_test_sent') : (r && r.error === 'not_found' ? t('push_test_none') : RB.errMsg(r && r.error)), r && r.ok ? '' : 'err'); }); });
    row.appendChild(btn); row.appendChild(tbtn);
    function paint() {
      RB.pushState().then(function (s) {
        sub.textContent = t('push_s_' + s); btn.style.display = (s === 'on' || s === 'off') ? '' : 'none'; btn.textContent = s === 'on' ? t('push_off') : t('push_on'); btn.setAttribute('data-s', s); tbtn.style.display = s === 'on' ? '' : 'none';
      });
    }
    btn.addEventListener('click', function () {
      var on = btn.getAttribute('data-s') === 'on'; btn.disabled = true;
      (on ? RB.pushDisable() : RB.pushEnable()).then(function (r) { btn.disabled = false; if (r && r.ok === false) RB.toast(r.error === 'denied' ? t('push_denied') : RB.errMsg(r.error), 'err'); else RB.toast(on ? t('push_removed') : t('push_added')); paint(); });
    });
    paint(); return row;
  };
})();
