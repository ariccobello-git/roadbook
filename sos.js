/* Roadbook · SOS: segnalazione di emergenza (anche senza accesso), gestione e report */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t;
  var NUM_112 = '112', NUM_ACI = '803116', NUM_ASSICURA = '+39800427539';
  var KINDS = ['moto', 'salute_mia', 'salute_altro'];
  var QKEY = 'rb.sosq';

  function telRow(num, title, sub, strong) {
    var r = RB.row({ lead: RB.icon('phone'), title: title, sub: sub, href: 'tel:' + num, go: false, cls: strong ? 'sos-call strong' : 'sos-call' });
    r.removeAttribute('target'); r.removeAttribute('rel'); return r;
  }
  function fmtDate(ms) { try { return new Date(ms).toLocaleString(RB.pref.lang === 'en' ? 'en-GB' : RB.pref.lang === 'fr' ? 'fr-FR' : 'it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function kindLabel(k) { return t('sosk_' + k); }

  /* ---------- posizione e vocale ---------- */
  function getPos(done) {
    if (!navigator.geolocation) { done(null); return; }
    navigator.geolocation.getCurrentPosition(function (p) { done({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); }, function () { done(null); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 });
  }
  function recorderSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); }
  function pickMime() { var c = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']; for (var i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {} } return ''; }
  function blobToB64(blob) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1] || ''); }; fr.onerror = rej; fr.readAsDataURL(blob); }); }

  /* ---------- invio con coda se manca la rete ---------- */
  function sendArgs(st) {
    return { p_code: st.code || null, p_name: st.name || null, p_member: st.memberId || null, p_kind: st.kind, p_run: null, p_subject: st.subjectId || null,
      p_lat: st.pos ? st.pos.lat : null, p_lng: st.pos ? st.pos.lng : null, p_acc: st.pos ? Math.round(st.pos.acc) : null,
      p_note: [st.subjectName && !st.subjectId ? t('sos_who') + ': ' + st.subjectName : '', st.note || ''].filter(Boolean).join(' · ') || null,
      p_voice: st.voice ? st.voice.b64 : null, p_mime: st.voice ? st.voice.mime : null, p_ms: st.voice ? st.voice.ms : null };
  }
  RB.sosFlush = function () {
    var q = []; try { q = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) {}
    if (!q.length) return;
    var a = q[0];
    RB.rpc('rc_sos_send', a).then(function (r) {
      if (r && (r.ok || (r.error && r.error !== 'network' && r.error !== 'server'))) { q.shift(); try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) {} if (q.length) RB.sosFlush(); else RB.toast(t('sos_queue_sent')); }
    });
  };
  window.addEventListener('online', function () { RB.sosFlush(); });

  /* ---------- flusso di segnalazione ---------- */
  /* mode: 'in' (con accesso) | 'public' (senza) */
  RB.sosOpen = function (mode) {
    var pub = mode === 'public', me = RB.S && RB.S.me;
    var st = { kind: null, code: pub ? null : RB.S.code, name: pub ? '' : RB.fullName(me), memberId: null, pos: null, note: '', voice: null, subjectId: null, subjectName: '', posState: 'wait' };
    var body = h('div', { id: 'sos-body' });
    var ctl = RB.sheet({ title: t('sos_btn'), content: body, full: true, keep: pub, leftLabel: t('close'), right: null });
    ctl.el.classList.add('sos-sheet');

    function nameBox(label, onpick, initial) {
      var inp = RB.input('sos-nm', initial || '', { max: 80, ph: t('sos_name_ph') }), sug = h('div', { class: 'list', id: 'sos-sug', style: 'margin-top:8px' }), timer = null, token = 0;
      inp.addEventListener('input', function () {
        onpick(inp.value, null); clearTimeout(timer); var q = inp.value.trim(); RB.clear(sug);
        if (q.length < 3) return;
        timer = setTimeout(function () { var my = ++token; RB.rpc('rc_sos_suggest', { p_q: q }).then(function (r) {
          if (my !== token || !r || !r.ok) return; RB.clear(sug);
          (r.items || []).forEach(function (it) { sug.appendChild(RB.row({ lead: RB.icon('user'), title: it.name, sub: t('sos_this_me'), go: false, onclick: function () { inp.value = it.name; RB.clear(sug); onpick(it.name, it.id); } })); });
        }); }, 350);
      });
      return h('div', null, h('div', { class: 'list' }, RB.field(label, inp)), sug);
    }

    function head(txt) { return h('div', { class: 'sos-note' }, RB.icon('alert'), h('span', null, txt)); }

    function stepWho() {
      RB.clear(body); body.appendChild(head(t('sos_public_intro')));
      body.appendChild(nameBox(t('sos_your_name'), function (n, id) { st.name = n; st.memberId = id; }, st.name));
      body.appendChild(h('button', { type: 'button', class: 'btn sos-btn', id: 'sos-next', onclick: function () {
        if ((st.name || '').trim().length < 3) { RB.toast(t('sos_name_req'), 'err'); RB.feel('err'); return; } stepKind();
      } }, t('sos_continue')));
      body.appendChild(callBlock(null));
    }

    function callBlock(kind) {
      var l = h('div', { class: 'list', id: 'sos-calls' });
      l.appendChild(telRow(NUM_112, t('sos_call_112'), t('sos_call_112_sub'), true));
      if (kind === 'moto') {
        l.appendChild(telRow(NUM_ACI, t('sos_call_aci'), '803.116', false));
        l.appendChild(telRow(NUM_ASSICURA, t('sos_call_assicura'), '+39 800 427 539', false));
      }
      return h('div', null, RB.secT(t('sos_call_t')), l, h('p', { class: 'sm' }, t('sos_call_note')));
    }

    function stepKind() {
      RB.clear(body); body.appendChild(head(t('sos_kind_q')));
      var l = h('div', { class: 'sos-kinds' });
      KINDS.forEach(function (k) {
        l.appendChild(h('button', { type: 'button', class: 'sos-kind', 'data-k': k, onclick: function () { st.kind = k; if (k === 'salute_altro') stepSubject(); else stepMain(); } },
          h('span', { class: 'sk-i' }, RB.icon(k === 'moto' ? 'moto' : 'alert')), h('span', { class: 'sk-t' }, h('b', null, kindLabel(k)), h('span', null, t('sosk_' + k + '_d'))), RB.icon('chev')));
      });
      body.appendChild(l); body.appendChild(callBlock(null));
    }

    function stepSubject() {
      RB.clear(body); body.appendChild(head(t('sos_subject_q')));
      if (pub) {
        body.appendChild(nameBox(t('sos_who'), function (n, id) { st.subjectName = n; st.subjectId = id; }, st.subjectName));
      } else {
        var run = activeRun(), list = h('div', { class: 'list', id: 'sos-parts' }), filter = RB.input('sos-flt', '', { max: 40, ph: t('search') });
        var people = run ? RB.signupsOf(run.id).filter(function (s) { return s.status === 'si' && s.member_id !== RB.S.me.id; }).map(function (s) { return RB.mem(s.member_id); }).filter(Boolean) : [];
        function draw() {
          RB.clear(list); var q = filter.value.trim().toLowerCase();
          people.filter(function (m) { return !q || RB.fullName(m).toLowerCase().indexOf(q) >= 0; }).slice(0, 40).forEach(function (m) {
            list.appendChild(RB.row({ lead: RB.icon('user'), title: RB.fullName(m), go: false, cls: st.subjectId === m.id ? 'sel' : '', onclick: function () { st.subjectId = m.id; st.subjectName = RB.fullName(m); stepMain(); } }));
          });
          if (!list.children.length) list.appendChild(h('div', { class: 'empty', style: 'padding:16px' }, t('sos_none_found')));
        }
        filter.addEventListener('input', draw); draw();
        body.appendChild(h('div', { class: 'list' }, RB.field(t('search'), filter))); body.appendChild(list);
        body.appendChild(h('p', { class: 'sm' }, t('sos_not_listed')));
        body.appendChild(nameBox(t('sos_who'), function (n, id) { st.subjectName = n; st.subjectId = id; }, ''));
      }
      body.appendChild(h('button', { type: 'button', class: 'btn sos-btn', id: 'sos-next2', onclick: function () {
        if (!st.subjectId && (st.subjectName || '').trim().length < 2) { RB.toast(t('sos_who_req'), 'err'); RB.feel('err'); return; } stepMain();
      } }, t('sos_continue')));
    }

    function activeRun() {
      var now = Date.now(), best = null;
      RB.runs().forEach(function (r) { var s = new Date(r.run_date).getTime(), e = s + Math.max(r.days || 1, 1) * 86400000; if (r.status !== 'annullato' && s - 86400000 <= now && e + 86400000 >= now) { if (!best || Math.abs(s - now) < Math.abs(new Date(best.run_date) - now)) best = r; } });
      return best;
    }

    function posText() { return st.pos ? t('sos_pos_ok', Math.round(st.pos.acc)) : st.posState === 'wait' ? t('sos_pos_wait') : t('sos_pos_none'); }

    function stepMain() {
      RB.clear(body);
      body.appendChild(h('div', { class: 'sos-chip' }, RB.icon('alert'), h('b', null, kindLabel(st.kind)), st.subjectName ? h('span', null, ' · ' + st.subjectName) : null));
      body.appendChild(callBlock(st.kind));
      body.appendChild(RB.secT(t('sos_pos_t')));
      var pl = h('div', { class: 'list' }), prow = RB.row({ lead: RB.icon('pin'), title: t('sos_pos_t'), sub: posText(), go: false, right: h('button', { type: 'button', class: 'btn ghost sm2', id: 'sos-retry', onclick: function () { st.posState = 'wait'; prow.querySelector('.rt span').textContent = posText(); getPos(function (p) { st.pos = p; st.posState = p ? 'ok' : 'none'; prow.querySelector('.rt span').textContent = posText(); }); } }, t('sos_pos_retry')) });
      pl.appendChild(prow); body.appendChild(pl);
      if (!st.pos && st.posState === 'wait') getPos(function (p) { st.pos = p; st.posState = p ? 'ok' : 'none'; var s = prow.querySelector('.rt span'); if (s) s.textContent = posText(); });
      body.appendChild(RB.secT(t('sos_more')));
      var note = RB.input('sos-note', st.note, { max: 250, ph: t('sos_note_ph') }); note.addEventListener('input', function () { st.note = note.value; });
      body.appendChild(h('div', { class: 'list' }, RB.field(t('sos_note'), note)));
      if (recorderSupported()) body.appendChild(voiceBox());
      body.appendChild(h('button', { type: 'button', class: 'btn sos-btn big', id: 'sos-send', onclick: send }, t('sos_send')));
      body.appendChild(h('p', { class: 'sm' }, pub ? t('sos_public_note') : t('sos_auto_note')));
    }

    function voiceBox() {
      var box = h('div', { class: 'list sos-voice', id: 'sos-voice' }), stream = null, rec = null, chunks = [], tick = null, left = 30;
      var status = h('span', { id: 'sos-vs' }, st.voice ? t('sos_voice_ready', Math.round(st.voice.ms / 1000)) : t('sos_voice_sub'));
      var btn = h('button', { type: 'button', class: 'btn sec', id: 'sos-rec', style: 'margin-top:0' }, st.voice ? t('sos_voice_again') : t('sos_voice_rec'));
      var del = h('button', { type: 'button', class: 'btn ghost sm2', id: 'sos-vdel', style: st.voice ? '' : 'display:none', onclick: function () { st.voice = null; status.textContent = t('sos_voice_sub'); btn.textContent = t('sos_voice_rec'); del.style.display = 'none'; if (aud) aud.remove(); } }, t('delete'));
      var aud = null;
      function stop() { if (rec && rec.state !== 'inactive') rec.stop(); clearInterval(tick); }
      btn.addEventListener('click', function () {
        if (rec && rec.state === 'recording') { stop(); return; }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
          stream = s; chunks = []; var mime = pickMime(); rec = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s); var t0 = Date.now(); left = 30;
          rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          rec.onstop = function () {
            clearInterval(tick); stream.getTracks().forEach(function (x) { x.stop(); });
            var blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/mp4' }), ms = Math.min(Date.now() - t0, 30000);
            blobToB64(blob).then(function (b64) {
              if (!b64 || b64.length > 600000) { RB.toast(t('e_generic'), 'err'); return; }
              st.voice = { b64: b64, mime: (blob.type || mime || 'audio/mp4').split(';')[0], ms: ms };
              status.textContent = t('sos_voice_ready', Math.round(ms / 1000)); btn.textContent = t('sos_voice_again'); del.style.display = '';
              if (aud) aud.remove(); aud = h('audio', { controls: true, src: URL.createObjectURL(blob), style: 'width:100%;margin-top:8px' }); box.appendChild(aud);
            });
          };
          rec.start(); btn.textContent = t('sos_voice_stop'); status.textContent = t('sos_voice_left', left);
          tick = setInterval(function () { left--; status.textContent = t('sos_voice_left', Math.max(left, 0)); if (left <= 0) stop(); }, 1000);
        }, function () { RB.toast(t('sos_mic_denied'), 'err'); });
      });
      box.appendChild(h('div', { class: 'pass' }, h('span', { class: 'rt' }, h('b', null, t('sos_voice')), status), h('span', { style: 'display:flex;gap:6px;align-items:center' }, btn, del)));
      return box;
    }

    function send() {
      var btn = document.getElementById('sos-send'); if (btn) btn.disabled = true;
      var a = sendArgs(st);
      RB.rpc('rc_sos_send', a).then(function (r) {
        if (btn) btn.disabled = false;
        if (r && r.ok) { st.sentId = r.id; done(r); return; }
        if (r && r.error && r.error !== 'network' && r.error !== 'server') { RB.toast(RB.errMsg(r.error), 'err'); RB.feel('err'); return; }
        var q = []; try { q = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) {} q.push(a); try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-3))); } catch (e) {}
        done({ queued: true });
      });
    }

    function shareText() {
      var u = st.pos ? RB.mapsUrl(st.pos.lat.toFixed(6) + ',' + st.pos.lng.toFixed(6)) : '';
      return ['🚨 SOS Roadbook', kindLabel(st.kind), st.subjectName ? t('sos_who') + ': ' + st.subjectName : '', st.name, u].filter(Boolean).join('\n');
    }

    function done(r) {
      RB.clear(body); RB.feel(r.queued ? 'err' : 'ok');
      body.appendChild(h('div', { class: 'sos-done' + (r.queued ? ' q' : ''), id: 'sos-done' }, RB.icon(r.queued ? 'clock' : 'check'), h('b', null, r.queued ? t('sos_queued') : t('sos_sent')), h('span', null, r.queued ? t('sos_queued_d') : (r.verified ? t('sos_sent_d') : t('sos_sent_d_pub')))));
      body.appendChild(callBlock(st.kind));
      body.appendChild(h('div', { class: 'list', style: 'margin-top:12px' }, RB.row({ lead: RB.icon('share'), title: t('sos_share'), sub: t('sos_share_d'), go: false, onclick: function () {
        var txt = shareText(); if (navigator.share) navigator.share({ text: txt }).catch(function () {}); else RB.copy(txt).then(function () { RB.toast(t('copied')); });
      } })));
    }

    if (pub) stepWho(); else stepKind();
    return ctl;
  };

  /* ---------- gestione (permesso emergenze) ---------- */
  RB.sosPoll = function () {
    if (!RB.S.code || !RB.can('emergency_manage')) return;
    RB.rpc('rc_sos_poll', { p_code: RB.S.code }).then(function (r) {
      if (!r || !r.ok) return;
      var prev = RB.sosCount || 0; RB.sosCount = r.open || 0;
      var seen = 0; try { seen = +localStorage.getItem('rb.sosseen') || 0; } catch (e) {}
      var lastAt = r.last_at ? new Date(r.last_at).getTime() : 0;
      if (RB.sosCount > 0 && lastAt > seen) { RB.feel('err'); try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) {} }
      if (RB.sosCount !== prev || lastAt > seen) RB.render();
    });
  };
  var pollT = null;
  RB.sosStartPoll = function () { if (pollT || !RB.can('emergency_manage')) return; RB.sosPoll(); pollT = setInterval(RB.sosPoll, 20000); };
  RB.sosStopPoll = function () { clearInterval(pollT); pollT = null; RB.sosCount = 0; };
  RB.sosBanner = function () {
    if (!RB.can('emergency_manage') || !RB.sosCount) return null;
    return h('button', { type: 'button', class: 'sos-banner', id: 'sos-alert', onclick: function () { try { localStorage.setItem('rb.sosseen', String(Date.now())); } catch (e) {} RB.sosList(); RB.render(); } },
      RB.icon('alert'), h('b', null, t('sos_open_n', RB.sosCount)), h('span', null, t('sos_open_tap')));
  };

  var STAT = { open: 'sos_st_open', handling: 'sos_st_handling', closed: 'sos_st_closed' };
  function statChip(s) { return RB.chip(t(STAT[s]), s === 'open' ? 'er' : s === 'handling' ? 'wa' : 'ok'); }

  RB.sosList = function () {
    var body = h('div', null, h('div', { class: 'empty' }, RB.icon('clock'), h('b', null, t('loading'))));
    var ctl = RB.sheet({ title: t('sos_manage'), content: body, full: true, leftLabel: t('close'), right: null });
    function load() {
      RB.rpc('rc_sos_list', { p_code: RB.S.code }).then(function (r) {
        RB.clear(body);
        if (!r || !r.ok) { body.appendChild(h('div', { class: 'empty' }, h('b', null, RB.errMsg(r && r.error)))); return; }
        if (!r.items.length) { body.appendChild(h('div', { class: 'empty' }, RB.icon('check'), h('b', null, t('sos_none')))); return; }
        var groups = [['open', 'sos_g_open'], ['handling', 'sos_g_handling'], ['closed', 'sos_g_closed']];
        groups.forEach(function (g) {
          var items = r.items.filter(function (x) { return x.status === g[0]; }); if (!items.length) return;
          body.appendChild(RB.secT(t(g[1]) + ' · ' + items.length));
          var l = h('div', { class: 'list' });
          items.forEach(function (x) {
            var row = RB.row({ lead: h('span', { class: 'sos-ic' + (x.status === 'closed' ? ' off' : '') }, RB.icon('alert')), title: (x.name || '—'), sub: kindLabel(x.kind) + ' · ' + fmtDate(new Date(x.created_at).getTime()) + (x.run ? ' · ' + x.run : '') + (x.verified ? '' : ' · ' + t('sos_unverified')), right: statChip(x.status),
              onclick: function () { RB.sosDetail(x.id, load); } });
            /* scorri a sinistra: Chiudi (se non già chiusa) ed Elimina, sempre con "Sei sicuro?" */
            var acts = [];
            if (x.status !== 'closed') acts.push({ label: t('sos_close_s'), icon: 'check', cls: 'rsw-edit', fn: function () { RB.sosClose(x.id, load); } });
            acts.push({ label: t('delete'), icon: 'trash', cls: 'rsw-del', fn: function () { RB.sosDelete(x.id, load); } });
            l.appendChild(RB.swipe(row, acts, 'in-list'));
          });
          body.appendChild(l);
        });
      });
    }
    load(); return ctl;
  };

  /* modello del report: poche informazioni essenziali + scheda completa */
  function yn(v) { return v ? v : '—'; }
  RB.sosModel = function (g) {
    var d = g.data || {}, rep = (d.reporter || {}), m = rep.member || {}, prof = rep.emergency || {}, run = rep.run, su = rep.signup, sub = d.subject, sm = sub && sub.member;
    var who = g.kind === 'salute_altro' && sm ? sm : m, whoProf = g.kind === 'salute_altro' && sub ? (sub.emergency || {}) : prof;
    var pos = d.lat != null ? d.lat.toFixed(6) + ', ' + d.lng.toFixed(6) : null, link = d.lat != null ? RB.mapsUrl(d.lat.toFixed(6) + ',' + d.lng.toFixed(6)) : null;
    var brief = [
      [t('sos_r_type'), kindLabel(g.kind)], [t('sos_r_when'), fmtDate(new Date(g.created_at).getTime())],
      [t('sos_r_person'), (who.name || rep.member && rep.member.name || '—') + (who.phone ? ' · ' + who.phone : '')],
      [t('sos_r_pos'), pos ? pos + (d.acc ? ' (±' + d.acc + ' m)' : '') : t('sos_pos_none')],
      [t('sos_blood'), yn(whoProf.blood)], [t('sos_allergies'), yn(whoProf.allergies)], [t('sos_meds'), yn(whoProf.meds)], [t('sos_conditions'), yn(whoProf.conditions)],
      [t('sos_r_contact'), whoProf.contact_name ? whoProf.contact_name + (whoProf.contact_rel ? ' (' + whoProf.contact_rel + ')' : '') + ' · ' + whoProf.contact_phone : '—'],
      [t('sos_r_bike'), [who.bike, whoProf.plate].filter(Boolean).join(' · ') || '—'], [t('sos_r_roadside'), whoProf.roadside ? t('sos_rs_' + whoProf.roadside) : '—'],
      [t('sos_r_run'), run ? run.title + ' · ' + fmtDate(new Date(run.date).getTime()) : '—']
    ];
    if (d.note) brief.push([t('sos_note'), d.note]);
    var full = [
      { title: t('sos_r_reporter'), rows: [[t('first_name') + ' / ' + t('last_name'), m.name || '—'], [t('phone'), m.phone || '—'], [t('bike'), m.bike || '—'], [t('tessera'), m.tessera || '—'], [t('sos_r_ident'), g.verified ? t('sos_verified') : t('sos_unverified')]] },
      { title: t('sos_r_signup'), rows: [[t('sos_r_run'), run ? run.title : '—'], [t('sos_r_meeting'), run && run.meeting || '—'], [t('sos_r_dest'), run && run.destination || '—'], [t('sos_r_status'), su ? su.status + (su.passengers ? ' · +' + su.passengers : '') + (su.room ? ' · ' + su.room : '') + (su.checked_in ? ' · check-in' : '') : '—']] }
    ];
    if (sm) full.push({ title: t('sosk_salute_altro'), rows: [[t('first_name') + ' / ' + t('last_name'), sm.name], [t('phone'), sm.phone || '—'], [t('sos_blood'), yn((sub.emergency || {}).blood)], [t('sos_allergies'), yn((sub.emergency || {}).allergies)], [t('sos_meds'), yn((sub.emergency || {}).meds)], [t('sos_conditions'), yn((sub.emergency || {}).conditions)], [t('sos_r_contact'), (sub.emergency || {}).contact_name ? sub.emergency.contact_name + ' · ' + sub.emergency.contact_phone : '—']] });
    if (g.kind !== 'salute_altro' && prof.notes) full.push({ title: t('sos_notes'), rows: [[t('sos_notes'), prof.notes]] });
    var tl = (d.notes || []).map(function (n) { return [fmtDate(new Date(n.at).getTime()) + ' · ' + n.by, t(STAT[n.status]) + (n.text ? ' — ' + n.text : '')]; });
    if (tl.length) full.push({ title: t('sos_r_timeline'), rows: tl });
    return { title: t('sos_r_title'), brief: brief, full: full, link: link, voice: !!g.voice, status: g.status };
  };
  RB.sosBriefText = function (g) { var mdl = RB.sosModel(g); return '🚨 ' + mdl.title + '\n' + mdl.brief.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + (mdl.link ? '\n' + mdl.link : ''); };

  function loadScript(src, test) { return new Promise(function (res, rej) { if (test()) { res(); return; } var s = document.createElement('script'); s.src = src; s.onload = function () { res(); }; s.onerror = function () { rej(new Error('load')); }; document.head.appendChild(s); }); }
  function fname(g, ext) { var n = (((g.data || {}).reporter || {}).member || {}).name || 'emergenza'; return 'Emergenza_' + n.replace(/[^A-Za-z0-9]+/g, '_') + '_' + new Date(g.created_at).toISOString().slice(0, 10) + '.' + ext; }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }

  RB.sosExportPdf = function (g) {
    return loadScript('vendor/jspdf.umd.min.js', function () { return window.jspdf && window.jspdf.jsPDF; }).then(function () {
      var mdl = RB.sosModel(g), doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 14, y = 0;
      function page() { if (y > 280) { doc.addPage(); y = 16; } }
      doc.setFillColor(214, 40, 30); doc.rect(0, 0, W, 22, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(17); doc.setFont('helvetica', 'bold'); doc.text(mdl.title + ' · ' + RB.chapterName(), M, 14); y = 32;
      doc.setTextColor(0, 0, 0); doc.setFontSize(12); doc.text(t('sos_r_brief'), M, y); y += 7; doc.setFontSize(10.5);
      function rows(list) { list.forEach(function (r) { page(); doc.setFont('helvetica', 'bold'); doc.text(String(r[0]), M, y); doc.setFont('helvetica', 'normal'); var lines = doc.splitTextToSize(String(r[1]), W - M * 2 - 52); doc.text(lines, M + 52, y); y += Math.max(6, lines.length * 5 + 1); }); }
      rows(mdl.brief); if (mdl.link) { page(); doc.setFont('helvetica', 'bold'); doc.text(t('sos_r_map'), M, y); doc.setTextColor(0, 80, 200); doc.textWithLink(mdl.link.length > 70 ? mdl.link.slice(0, 70) + '…' : mdl.link, M + 52, y, { url: mdl.link }); doc.setTextColor(0, 0, 0); y += 8; }
      y += 3; mdl.full.forEach(function (s) { page(); doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(214, 40, 30); doc.text(s.title, M, y); doc.setTextColor(0, 0, 0); y += 6.5; doc.setFontSize(10.5); rows(s.rows); y += 3; });
      doc.setFontSize(8.5); doc.setTextColor(110, 110, 110); doc.text(t('sos_r_foot') + ' · ' + new Date().toLocaleString(), M, 290);
      download(doc.output('blob'), fname(g, 'pdf')); return true;
    });
  };
  RB.sosExportDoc = function (g) {
    var mdl = RB.sosModel(g); function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
    function tbl(rows) { return '<table border="0" cellpadding="4" style="border-collapse:collapse;width:100%">' + rows.map(function (r) { return '<tr><td style="width:32%;font-weight:bold;border-bottom:1px solid #ddd">' + esc(r[0]) + '</td><td style="border-bottom:1px solid #ddd">' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>'; }
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>' + esc(mdl.title) + '</title></head><body style="font-family:Calibri,Arial,sans-serif">' +
      '<h1 style="color:#d6281e">' + esc(mdl.title) + ' · ' + esc(RB.chapterName()) + '</h1><h2>' + esc(t('sos_r_brief')) + '</h2>' + tbl(mdl.brief) + (mdl.link ? '<p><a href="' + esc(mdl.link) + '">' + esc(t('sos_r_map')) + '</a></p>' : '') +
      mdl.full.map(function (s) { return '<h2 style="color:#d6281e">' + esc(s.title) + '</h2>' + tbl(s.rows); }).join('') + '<p style="color:#777;font-size:9pt">' + esc(t('sos_r_foot')) + ' · ' + esc(new Date().toLocaleString()) + '</p></body></html>';
    download(new Blob(['﻿', html], { type: 'application/msword' }), fname(g, 'doc')); return Promise.resolve(true);
  };

  /* chiudi un'emergenza: conferma, poi nota facoltativa */
  RB.sosClose = function (id, done) {
    return RB.ask({ title: t('sos_close_q'), msg: t('sos_close_q_msg'), ok: t('sos_close'), no: t('cancel') }).then(function (ok) {
      if (!ok) return false;
      var inp = RB.input('sos-cn', '', { max: 250, ph: t('sos_close_ph') });
      RB.sheet({ title: t('sos_close_t'), content: h('div', null, h('div', { class: 'list' }, RB.field(t('sos_note'), inp)), h('p', { class: 'sm' }, t('sos_close_help'))), leftLabel: t('cancel'),
        right: { label: t('sos_close'), fn: function (c) { var note = RB.val('sos-cn'); c.close(true);
          RB.act(null, function () { return RB.rpc('rc_sos_set', { p_code: RB.S.code, p_id: id, p_status: 'closed', p_note: note || null }); }, t('saved')).then(function (x) { if (x && x.ok && done) done(); }); } } });
      return true;
    });
  };
  /* elimina definitivamente un'emergenza: conferma rossa, i dati non si recuperano */
  RB.sosDelete = function (id, done) {
    return RB.ask({ title: t('sos_del_q'), msg: t('sos_del_msg'), ok: t('delete'), no: t('cancel'), danger: true }).then(function (ok) {
      if (!ok) return false;
      return RB.act(null, function () { return RB.rpc('rc_sos_delete', { p_code: RB.S.code, p_id: id }); }, t('deleted')).then(function (x) { if (x && x.ok && done) done(); return !!(x && x.ok); });
    });
  };

  RB.sosDetail = function (id, onchange) {
    var body = h('div', null, h('div', { class: 'empty' }, RB.icon('clock'), h('b', null, t('loading'))));
    var ctl = RB.sheet({ title: t('sos_r_title'), content: body, full: true, leftLabel: t('close'), right: null });
    var cur = null;
    function setStatus(s) {
      RB.act(null, function () { return RB.rpc('rc_sos_set', { p_code: RB.S.code, p_id: id, p_status: s, p_note: null }); }, t('saved')).then(function (x) { if (x && x.ok) { if (onchange) onchange(); load(); } });
    }
    function load() {
      RB.rpc('rc_sos_get', { p_code: RB.S.code, p_id: id, p_export: false }).then(function (g) {
        RB.clear(body);
        if (!g || !g.ok) { body.appendChild(h('div', { class: 'empty' }, h('b', null, RB.errMsg(g && g.error)))); return; }
        cur = g; var mdl = RB.sosModel(g);
        body.appendChild(h('div', { class: 'sos-hd' }, statChip(g.status), h('b', null, kindLabel(g.kind)), h('span', null, g.verified ? t('sos_verified') : t('sos_unverified'))));
        body.appendChild(h('div', { class: 'sos-brief', id: 'sos-brief' }, h('div', { class: 'sos-brief-t' }, RB.icon('alert'), t('sos_r_brief')), mdl.brief.map(function (r) { return h('div', { class: 'sb-r' }, h('span', null, r[0]), h('b', null, r[1])); })));
        var acts = h('div', { class: 'list', style: 'margin-top:10px' });
        var d = g.data || {}, rp = ((d.reporter || {}).member || {}), sp = ((d.subject || {}).member || {});
        var ph = (g.kind === 'salute_altro' ? sp.phone : rp.phone) || rp.phone;
        if (ph) acts.appendChild(telRow(ph.replace(/[^\d+]/g, ''), t('sos_call_person'), ph, false));
        var prof = (g.kind === 'salute_altro' && d.subject ? d.subject.emergency : (d.reporter || {}).emergency) || {};
        if (prof.contact_phone) acts.appendChild(telRow(prof.contact_phone.replace(/[^\d+]/g, ''), t('sos_call_contact'), prof.contact_name + ' · ' + prof.contact_phone, false));
        if (mdl.link) { var mr = RB.row({ lead: RB.icon('pin'), title: t('sos_open_map'), sub: mdl.link.replace(/^https?:\/\//, '').slice(0, 48), href: mdl.link }); acts.appendChild(mr); }
        body.appendChild(acts);
        if (g.voice) body.appendChild(h('div', { class: 'card', style: 'margin-top:10px' }, h('b', null, t('sos_voice')), h('audio', { controls: true, style: 'width:100%;margin-top:8px', src: 'data:' + (g.voice_mime || 'audio/mp4') + ';base64,' + g.voice })));
        mdl.full.forEach(function (s) { body.appendChild(RB.secT(s.title)); body.appendChild(h('div', { class: 'list' }, s.rows.map(function (r) { return RB.row({ title: r[0], value: r[1], go: false }); }))); });
        body.appendChild(RB.secT(t('sos_r_actions')));
        var al = h('div', { class: 'list', id: 'sos-actions' });
        if (g.status === 'open') al.appendChild(RB.row({ lead: RB.icon('check'), title: t('sos_take'), go: false, onclick: function () { setStatus('handling'); } }));
        if (g.status !== 'closed') al.appendChild(RB.row({ lead: RB.icon('check'), title: t('sos_close'), go: false, onclick: function () { RB.sosClose(id, function () { if (onchange) onchange(); load(); }); } }));
        if (g.status === 'closed') al.appendChild(RB.row({ lead: RB.icon('clock'), title: t('sos_reopen'), go: false, onclick: function () { setStatus('open'); } }));
        al.appendChild(RB.row({ lead: RB.icon('trash'), title: t('sos_del_btn'), go: false, cls: 'dng', onclick: function () { RB.sosDelete(id, function () { if (onchange) onchange(); ctl.close(true); }); } }));
        al.appendChild(RB.row({ lead: RB.icon('share'), title: t('sos_share_brief'), go: false, onclick: function () { var txt = RB.sosBriefText(g); if (navigator.share) navigator.share({ text: txt }).catch(function () {}); else RB.copy(txt).then(function () { RB.toast(t('copied')); }); } }));
        function exp(kind) { return RB.rpc('rc_sos_get', { p_code: RB.S.code, p_id: id, p_export: true }).then(function (gg) { if (!gg || !gg.ok) throw new Error('x'); return kind === 'pdf' ? RB.sosExportPdf(gg) : RB.sosExportDoc(gg); }).then(function () { RB.toast(t('exported')); }, function () { RB.toast(t('e_generic'), 'err'); }); }
        al.appendChild(RB.row({ lead: RB.icon('file'), title: t('sos_export_pdf'), go: false, onclick: function () { exp('pdf'); } }));
        al.appendChild(RB.row({ lead: RB.icon('file'), title: t('sos_export_doc'), go: false, onclick: function () { exp('doc'); } }));
        body.appendChild(al);
      });
    }
    load(); return ctl;
  };
})();
