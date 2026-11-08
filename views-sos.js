/* Roadbook · emergenza: dati personali per i soccorsi (cifrati sul server, consenso esplicito) */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t;
  var BLOOD = ['', '0+', '0-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
  var ROADSIDE = [['', 'sos_rs_none'], ['aci', 'sos_rs_aci'], ['assicura', 'sos_rs_assicura'], ['altro', 'sos_rs_altro']];

  /* stato per la riga in Altro: null = sconosciuto, 'none' | 'ok' */
  RB.emg = { state: null };
  RB.emgLoad = function () {
    if (!RB.S.code) return Promise.resolve(null);
    return RB.rpc('rc_emergency_get', { p_code: RB.S.code }).then(function (r) {
      if (r && r.ok) { RB.emg.state = r.profile ? 'ok' : 'none'; RB.emg.profile = r.profile || null; return r; }
      return null;
    });
  };
  RB.emgStatusText = function () { return RB.emg.state === 'ok' ? t('sos_status_ok') : RB.emg.state === 'none' ? t('sos_status_none') : t('sos_sub'); };

  RB.emergencyForm = function () {
    var me = RB.S.me, m = RB.mem(me.id) || me, bike = m.bike || '';
    var body = h('div', null, h('div', { class: 'empty' }, RB.icon('clock'), h('b', null, t('loading'))));
    var ctl = RB.sheet({ title: t('sos_title'), content: body, full: true, leftLabel: t('close'), right: null });
    RB.emgLoad().then(function (r) { if (!r) { RB.clear(body); body.appendChild(h('div', { class: 'empty' }, h('b', null, t('e_network')))); return; } draw(r.profile || {}, !!r.profile); });

    function draw(p, had) {
      var consent = had, road = p.roadside || '', blood = p.blood || '';
      RB.clear(body);
      body.appendChild(h('div', { class: 'sos-note' }, RB.icon('alert'), h('span', null, t('sos_intro'))));
      body.appendChild(RB.secT(t('sos_known')));
      body.appendChild(h('div', { class: 'list' },
        RB.row({ title: t('first_name') + ' / ' + t('last_name'), value: RB.fullName(m), go: false }),
        RB.row({ title: t('phone'), value: m.phone || '—', go: false }),
        RB.row({ title: t('bike'), value: bike || '—', go: false })));
      body.appendChild(RB.secT(t('sos_contact') + ' *'));
      body.appendChild(h('div', { class: 'list' },
        RB.field(t('sos_contact_name') + ' *', RB.input('em-cn', p.contact_name || '', { max: 80 })),
        RB.field(t('sos_contact_phone') + ' *', RB.input('em-cp', p.contact_phone || '', { type: 'tel', max: 30, mode: 'tel' })),
        RB.field(t('sos_contact_rel'), RB.input('em-cr', p.contact_rel || '', { max: 40 }))));
      var opt = h('div', { id: 'em-opt', style: had ? '' : 'display:none' });
      opt.appendChild(RB.secT(t('sos_moto')));
      opt.appendChild(h('div', { class: 'list' },
        RB.field(t('sos_plate'), RB.input('em-pl', p.plate || '', { max: 12 })),
        h('div', { class: 'field' }, h('span', null, t('sos_roadside')), RB.seg(ROADSIDE.map(function (x) { return { v: x[0], label: t(x[1]) }; }), road, function (v) { road = v; }, 'sos-seg'))));
      opt.appendChild(RB.secT(t('sos_health')));
      opt.appendChild(h('div', { class: 'list' },
        h('div', { class: 'field' }, h('span', null, t('sos_blood')), RB.seg(BLOOD.map(function (b) { return { v: b, label: b || '—' }; }), blood, function (v) { blood = v; }, 'sos-blood')),
        RB.field(t('sos_allergies'), RB.input('em-al', p.allergies || '', { max: 200 })),
        RB.field(t('sos_meds'), RB.input('em-me', p.meds || '', { max: 200 })),
        RB.field(t('sos_conditions'), RB.input('em-co', p.conditions || '', { max: 200 })),
        RB.field(t('sos_notes'), RB.input('em-no', p.notes || '', { max: 300 }))));
      body.appendChild(opt);
      if (!had) body.appendChild(h('button', { type: 'button', class: 'btn sec', id: 'em-more', style: 'margin:12px 0', onclick: function (e) { var o = document.getElementById('em-opt'), show = o.style.display === 'none'; o.style.display = show ? '' : 'none'; e.currentTarget.textContent = show ? t('em_less') : t('em_more'); } }, t('em_more')));
      body.appendChild(RB.secT(t('sos_consent_t')));
      body.appendChild(h('div', { class: 'list' }, h('div', { class: 'pass' }, h('span', null, t('sos_consent')), RB.toggle(consent, function (v) { consent = v; }))));
      body.appendChild(h('p', { class: 'sm' }, t('sos_privacy')));
      var save = h('button', { type: 'button', class: 'btn sos-btn', id: 'em-save', onclick: function () {
        var v = { contact_name: RB.val('em-cn'), contact_phone: RB.val('em-cp'), contact_rel: RB.val('em-cr'), plate: RB.val('em-pl'), roadside: road, blood: blood,
          allergies: RB.val('em-al'), meds: RB.val('em-me'), conditions: RB.val('em-co'), notes: RB.val('em-no') };
        if (!v.contact_name || !v.contact_phone) { RB.toast(t('sos_req'), 'err'); RB.feel('err'); return; }
        if (!/^[0-9+ ().-]{6,30}$/.test(v.contact_phone) || v.contact_phone.replace(/\D/g, '').length < 6) { RB.toast(t('e_dati_non_validi'), 'err'); return; }
        if (!consent) { RB.toast(t('e_consenso_mancante'), 'err'); RB.feel('err'); return; }
        RB.act(save, function () { return RB.rpc('rc_emergency_save', { p_code: RB.S.code, p_data: v, p_consent: true }); }, t('saved')).then(function (x) { if (x && x.ok) { RB.emg.state = 'ok'; ctl.close(true); RB.render(); } });
      } }, t('save'));
      body.appendChild(save);
      if (had) body.appendChild(h('div', { class: 'list', style: 'margin-top:18px' }, RB.row({ title: t('sos_delete'), cls: 'act dng', go: false, onclick: function () {
        RB.ask({ title: t('sos_delete'), msg: t('sos_delete_msg'), ok: t('delete'), danger: true }).then(function (ok) {
          if (ok) RB.act(null, function () { return RB.rpc('rc_emergency_delete', { p_code: RB.S.code }); }, t('deleted')).then(function (x) { if (x && x.ok) { RB.emg.state = 'none'; ctl.close(true); RB.render(); } });
        });
      } })));
    }
  };
})();
