/* Roadbook · pagamenti: stato per socio, incassi del tesoriere, distinta PDF facoltativa */
(function () {
  'use strict';
  var RB = window.RB, RBL = window.RBL, h = RB.h, t = RB.t;
  var MAX_PDF = 1400000;
  RB.S.pay = { payments: [], receipts: [], expenses: [], claims: [], at: 0 };

  RB.payLoad = function () {
    if (!RB.S.code) return Promise.resolve(false);
    return RB.rpc('rc_pay_list', { p_code: RB.S.code }).then(function (r) {
      RB.S.pay.at = Date.now();
      if (r && r.ok) { RB.S.pay = { payments: r.payments || [], receipts: r.receipts || [], expenses: r.expenses || [], claims: r.claims || [], at: Date.now() }; return true; }
      return false;
    });
  };
  var loading = false;
  /* ridisegna solo se si sta guardando Quote o Report e nessuna finestra è aperta */
  function softRender() { if ((RB.ui.tab === 'quote' || RB.ui.tab === 'report') && !document.querySelector('.sheet.in')) RB.render(); }
  RB.paySoftRender = softRender;
  /* aggiorna i pagamenti se i dati sono vecchi di più di 30 secondi */
  RB.payFresh = function () {
    if (loading || !RB.S.code || Date.now() - RB.S.pay.at < 30000) return;
    loading = true; RB.payLoad().then(function (ok) { loading = false; if (ok) softRender(); }, function () { loading = false; });
  };
  function pays() { return RB.S.pay.payments; }
  function claimsOf(runId, memId) { return (RB.S.pay.claims || []).filter(function (x) { return x.run_id === runId && (!memId || x.member_id === memId); }); }
  /* "dichiarato": distinta PDF caricata oppure "Ho pagato" in attesa di conferma */
  function hasRc(runId, memId) { return RB.S.pay.receipts.some(function (x) { return x.run_id === runId && x.member_id === memId; }) || claimsOf(runId, memId).length > 0; }
  function state(r, sg) { return RBL.payState(r, sg, pays(), hasRc(r.id, sg.member_id), Date.now()); }
  RB.payState = state;
  function money(x) { return RB.fmt.money(x); }
  function chipFor(st) {
    if (st.state === 'paid') return RB.chip(t('pay_s_paid'), 'ok');
    if (st.late) return RB.chip(t('pay_late'), 'er');
    if (st.state === 'declared') return RB.chip(t('pay_s_declared'), 'wa');
    if (st.state === 'partial') return RB.chip(t('pay_s_partial'), 'wa');
    return RB.chip(t('pay_s_unpaid'), '');
  }
  function chipText(st) { return st.state === 'declared' ? t('pay_s_declared') : st.state === 'partial' ? t('pay_s_partial') : t('pay_s_unpaid'); }
  function pdfErr(c) { return c === 'pay_e_type' ? t('pay_e_type') : c === 'pay_e_size' ? t('pay_e_size') : t('pay_e_read'); }
  function methodName(mt) { return mt === 'contanti' ? t('m_contanti') : mt === 'abbuono' ? t('m_abbuono') : t('m_bonifico'); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function runsWithFees() { return ((RB.S.d && RB.S.d.runs) || []).filter(function (r) { return r.status !== 'annullato' && RBL.hasFee(r); }); }

  /* ---------- il socio: stato e distinta ---------- */
  function readPdf(file) {
    return new Promise(function (res, rej) {
      if (!file) return rej('x');
      if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) return rej('pay_e_type');
      if (file.size > MAX_PDF) return rej('pay_e_size');
      var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1] || ''); }; fr.onerror = function () { rej('pay_e_read'); }; fr.readAsDataURL(file);
    });
  }
  function openReceipt(runId, memId) {
    return RB.rpc('rc_receipt_get', { p_code: RB.S.code, p_run: runId, p_member: memId || null }).then(function (r) {
      if (!r || !r.ok) { RB.toast(RB.errMsg(r && r.error), 'err'); return; }
      var bin = atob(r.data), u = new Uint8Array(bin.length), i; for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([u], { type: 'application/pdf' })), a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = r.name || 'distinta.pdf'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    });
  }
  /* righe per la scheda Quote del socio: stato + distinta (solo se si paga con bonifico) */
  RB.payMemberRows = function (r, sg) {
    var st = state(r, sg), rows = [];
    if (!st.due) return rows;
    if (st.state !== 'paid' && sg.member_id === RB.S.me.id) rows.push(h('div', { class: 'pay-cta' }, h('button', { type: 'button', class: 'btn pri', id: 'pay-go-' + r.id, style: 'margin:0', onclick: function () { RB.paySheet(r.id); } }, RB.icon('quote'), t('pp_go', money(nowAmount(r, st))))));
    rows.push(RB.row({ title: t('pay_status'), sub: st.state === 'paid' ? t('pay_all_paid') : t('pay_left_of', money(st.left), money(st.due)) + (st.late ? ' · ' + t('pay_late_amt', money(st.lateAmount)) : st.nextDue ? ' · ' + t('by_date', RB.fmt.full(st.nextDue)) : ''), right: chipFor(st), go: false, cls: 'pay-status' }));
    var pi = (RB.S.d.settings && RB.S.d.settings.payment_info) || {};
    if ((pi.methods || []).indexOf('bonifico') >= 0 && st.state !== 'paid') {
      var rc = RB.S.pay.receipts.filter(function (x) { return x.run_id === r.id && x.member_id === sg.member_id; })[0];
      var inp = h('input', { type: 'file', accept: 'application/pdf,.pdf', style: 'display:none', id: 'pay-file-' + r.id, onchange: function (e) {
        var f = e.target.files && e.target.files[0]; e.target.value = '';
        readPdf(f).then(function (b64) { return RB.rpc('rc_receipt_save', { p_code: RB.S.code, p_run: r.id, p_name: f.name, p_data: b64 }); }).then(function (x) {
          if (x && x.ok) { RB.toast(t('pay_rc_saved')); RB.payLoad().then(function () { RB.render(); }); } else if (x) RB.toast(RB.errMsg(x.error), 'err');
        }, function (c) { if (c !== 'x') RB.toast(pdfErr(c), 'err'); });
      } });
      if (rc) {
        rows.push(RB.row({ lead: RB.icon('file'), title: t('pay_rc_have'), sub: rc.name, onclick: function () { openReceipt(r.id, null); } , right: h('button', { type: 'button', class: 'btn ghost sm2', 'aria-label': t('delete'), onclick: function (e) { e.stopPropagation(); RB.rpc('rc_receipt_delete', { p_code: RB.S.code, p_run: r.id }).then(function () { RB.payLoad().then(function () { RB.render(); }); }); } }, RB.icon('trash')) }));
      } else {
        rows.push(RB.row({ lead: RB.icon('file'), title: t('pay_rc_add'), sub: t('pay_rc_add_d'), id: 'pay-add-' + r.id, go: false, onclick: function () { inp.click(); } }));
      }
      rows.push(inp);
    }
    return rows;
  };

  /* ---------- pagina Paga: dati del bonifico da copiare, "Apri la mia banca", "Ho pagato" ---------- */
  /* app delle banche: ios = id App Store, and = pacchetto Android, web = sito (verificati sugli store) */
  var BANKS = [
    { k: 'intesa', n: 'Intesa Sanpaolo', ios: '597360475', and: 'com.latuabancaperandroid', web: 'https://www.intesasanpaolo.com' },
    { k: 'unicredit', n: 'UniCredit', ios: '396670008', and: 'com.unicredit', web: 'https://www.unicredit.it' },
    { k: 'poste', n: 'Poste Italiane (BancoPosta)', ios: '781421802', web: 'https://www.poste.it' },
    { k: 'bnl', n: 'BNL', ios: '578969149', and: 'it.bnl.apps.banking', web: 'https://bnl.it' },
    { k: 'bper', n: 'BPER Banca', ios: '554965344', and: 'it.gruppobper.ams.android.bper', web: 'https://www.bper.it' },
    { k: 'bpm', n: 'Banco BPM (YouApp)', ios: '739705959', and: 'com.lynxspa.bancopopolare', web: 'https://www.bancobpm.it' },
    { k: 'fineco', n: 'Fineco', ios: '405225581', and: 'com.fineco.it', web: 'https://finecobank.com' },
    { k: 'mps', n: 'Banca MPS', ios: '366805842', web: 'https://www.mps.it' },
    { k: 'ca', n: 'Crédit Agricole Italia', ios: '1502700297', web: 'https://www.credit-agricole.it' },
    { k: 'mediolanum', n: 'Banca Mediolanum', ios: '412610547', web: 'https://www.bancamediolanum.it' },
    { k: 'ing', n: 'ING Italia', ios: '6479606116', web: 'https://www.ing.it' },
    { k: 'hello', n: 'Hello bank!', ios: '718176604', and: 'it.bnl.apps.enterprise.hellobank', web: 'https://www.hellobank.it' },
    { k: 'widiba', n: 'Banca Widiba', ios: '915429623', web: 'https://www.widiba.it' },
    { k: 'isybank', n: 'isybank', ios: '1666218772', web: 'https://www.isybank.com' },
    { k: 'hype', n: 'HYPE', ios: '943405905', web: 'https://www.hype.it' },
    { k: 'revolut', n: 'Revolut', ios: '932493382', and: 'com.revolut.revolut', web: 'https://www.revolut.com' },
    { k: 'n26', n: 'N26', ios: '956857223', and: 'de.number26.android', web: 'https://n26.com' }];
  RB.BANKS = BANKS;
  var UA = navigator.userAgent || '', IS_ANDROID = /Android/i.test(UA), IS_IOS = !IS_ANDROID && !!RB.isApple && ('ontouchend' in document);
  RB.bankPref = function () { try { return JSON.parse(localStorage.getItem('rb.bank') || 'null'); } catch (e) { return null; } };
  function setBank(b) { try { if (b) localStorage.setItem('rb.bank', JSON.stringify(b)); else localStorage.removeItem('rb.bank'); } catch (e) {} }
  /* indirizzo da aprire per la banca scelta, secondo il dispositivo */
  RB.bankUrl = function (b, os) {
    os = os || (IS_ANDROID ? 'android' : IS_IOS ? 'ios' : 'desk');
    var q = encodeURIComponent(b.n);
    if (os === 'android') {
      var store = b.and ? 'https://play.google.com/store/apps/details?id=' + b.and : 'https://play.google.com/store/search?q=' + q + '&c=apps';
      return b.and ? 'intent://open#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=' + b.and + ';S.browser_fallback_url=' + encodeURIComponent(store) + ';end' : store;
    }
    if (os === 'ios') return b.ios ? 'https://apps.apple.com/it/app/id' + b.ios : 'itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=' + q;
    return b.web || 'https://www.google.com/search?q=' + q + '+home+banking';
  };
  function openBank(b) {
    var u = RB.bankUrl(b);
    RB.feel('tap');
    if (/^https:/.test(u)) window.open(u, '_blank', 'noopener'); else window.location.href = u;
  }
  function bankPicker(done) {
    var box = h('div'), ctl, cur = RB.bankPref();
    var l = h('div', { class: 'list' });
    BANKS.forEach(function (b) {
      l.appendChild(RB.row({ title: b.n, go: false, right: cur && cur.k === b.k ? RB.icon('check') : null, cls: 'bank-opt', onclick: function () { setBank({ k: b.k }); ctl.close(true); done(); } }));
    });
    box.appendChild(l);
    box.appendChild(RB.secT(t('pb_other')));
    var other = RB.input('pb-other', cur && cur.k === 'custom' ? cur.n : '', { max: 60, ph: t('pb_other_ph') });
    box.appendChild(h('div', { class: 'list' }, RB.field(t('pb_other_name'), other)));
    box.appendChild(h('button', { type: 'button', class: 'btn pri', id: 'pb-other-ok', onclick: function () { var v = RB.val('pb-other'); if (!v) { RB.toast(t('e_dati_mancanti'), 'err'); return; } setBank({ k: 'custom', n: v }); ctl.close(true); done(); } }, t('save')));
    ctl = RB.sheet({ title: t('pb_choose'), content: box, full: true, leftLabel: t('close') });
  }
  function myBank() { var p = RB.bankPref(); if (!p) return null; if (p.k === 'custom') return { k: 'custom', n: p.n }; return BANKS.filter(function (b) { return b.k === p.k; })[0] || null; }
  /* importo da pagare ora: arretrato, altrimenti la prossima rata (o il saldo) */
  function nowAmount(r, st) {
    if (st.late) return st.lateAmount;
    var rows = RBL.plan(r, st.due) || [], x = rows.filter(function (y) { return y.cum > st.paid + 0.005; })[0];
    return x ? Math.min(st.left, Math.round((x.cum - st.paid) * 100) / 100) : st.left;
  }
  function amountTxt(v) { return (Math.round(v * 100) / 100).toFixed(2).replace('.', ','); }
  RB.paySheet = function (runId) {
    var r = RB.run(runId), me = RB.S.me; if (!r || !me) return;
    var box = h('div', { id: 'pay-sheet' }), ctl;
    function build() {
      RB.clear(box);
      var sg = RB.signupsOf(runId).filter(function (x) { return x.member_id === me.id && x.status === 'si'; })[0];
      if (!sg) { box.appendChild(h('div', { class: 'empty' }, h('b', null, t('pay_none')))); return; }
      var st = state(r, sg), pi = (RB.S.d.settings && RB.S.d.settings.payment_info) || {}, methods = pi.methods || [], amt = nowAmount(r, st);
      var mem = RB.mem(me.id) || me, plan = RBL.plan(r, st.due) || [], ri = -1, tpl = r.causale || pi.causale || '';
      plan.some(function (y, i) { if (y.cum > st.paid + 0.005) { ri = i; return true; } return false; });
      var rata = plan.length > 1 && ri >= 0 ? t('rate_k', ri + 1, plan.length) : '';
      if (rata && tpl && !/\{rata\}/.test(tpl)) tpl += ' {rata}';
      var cz = RBL.causale(tpl, { run: r.title, cognome: mem.last_name, nome: mem.first_name, rata: rata }) || (r.title + ' - ' + mem.last_name + ' ' + mem.first_name + (rata ? ' ' + rata : ''));
      box.appendChild(h('div', { class: 'pay-hero' + (st.state === 'paid' ? ' ok' : st.late ? ' late' : '') },
        h('small', null, st.state === 'paid' ? t('pay_all_paid') : st.late ? t('pp_late') : t('pp_now')),
        h('b', { id: 'pp-big' }, money(st.state === 'paid' ? st.paid : amt)),
        h('span', null, r.title + (st.state !== 'paid' ? ' · ' + t('pay_left_of', money(st.left), money(st.due)) : ''))));
      if (st.state === 'paid') return;
      var open = claimsOf(runId, me.id);
      open.forEach(function (c) {
        box.appendChild(h('div', { class: 'banner acc', 'data-claim': c.id, style: 'display:flex;align-items:center;gap:8px' }, h('span', { style: 'flex:1' }, t('pp_claimed', money(+c.amount), RB.fmt.dayShort(c.created_at))),
          h('button', { type: 'button', class: 'btn ghost sm2', style: 'margin:0', onclick: function () { RB.rpc('rc_pay_claim_cancel', { p_code: RB.S.code, p_id: c.id }).then(function () { RB.payLoad().then(function () { build(); RB.render(); }); }); } }, t('cancel'))));
      });
      if (methods.indexOf('bonifico') >= 0 && pi.iban) {
        box.appendChild(RB.secT(t('m_bonifico')));
        var l = h('div', { class: 'list' });
        function cp(label, shown, value, id) {
          l.appendChild(RB.row({ title: label, sub: shown, cls: id === 'iban' ? 'iban' : '', go: false, id: 'pp-' + id,
            right: h('button', { type: 'button', class: 'btn ghost sm2', 'aria-label': t('copy') + ' ' + label, onclick: function (e) { e.stopPropagation(); RB.copy(value).then(function () { RB.feel('ok'); RB.toast(t('copied_x', label)); }); } }, RB.icon('copy')) }));
        }
        if (pi.holder) cp(t('holder'), pi.holder, pi.holder, 'holder');
        cp('IBAN', pi.iban, pi.iban.replace(/\s/g, ''), 'iban');
        cp(t('pay_amount'), money(amt), amountTxt(amt), 'amount');
        cp(t('causale'), cz, cz, 'causale');
        box.appendChild(l);
        var all = [pi.holder ? t('holder') + ': ' + pi.holder : '', 'IBAN: ' + pi.iban.replace(/\s/g, ''), t('pay_amount') + ': ' + amountTxt(amt) + ' €', t('causale') + ': ' + cz].filter(Boolean).join('\n');
        box.appendChild(h('button', { type: 'button', class: 'btn sec', id: 'pp-copy-all', onclick: function () { RB.copy(all).then(function () { RB.feel('ok'); RB.toast(t('copied')); }); } }, RB.icon('copy'), t('pp_copy_all')));
        /* la mia banca */
        var b = myBank();
        box.appendChild(RB.secT(t('pb_title'), h('button', { type: 'button', class: 'btn ghost sm2', id: 'pb-change', onclick: function () { bankPicker(build); } }, b ? t('pb_change') : t('pb_choose_short'))));
        if (b) {
          box.appendChild(h('button', { type: 'button', class: 'btn pri pay-open', id: 'pb-open', onclick: function () { openBank(b); } }, RB.icon('share'), t('pb_open', b.n)));
          box.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, IS_IOS ? t('pb_hint_ios') : IS_ANDROID ? t('pb_hint_android') : t('pb_hint_desk')));
        } else {
          box.appendChild(h('button', { type: 'button', class: 'btn pri pay-open', id: 'pb-pick', onclick: function () { bankPicker(build); } }, t('pb_choose')));
          box.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('pb_once')));
        }
      }
      if (methods.indexOf('contanti') >= 0) {
        box.appendChild(RB.secT(t('m_contanti')));
        box.appendChild(h('div', { class: 'list' }, RB.row({ lead: RB.icon('quote'), title: t('m_contanti'), sub: [pi.cash_contact ? t('cash_to') + ' ' + pi.cash_contact : '', pi.cash_note || ''].filter(Boolean).join(' · ') || t('cash_default'), go: false })));
      }
      if (!methods.length) box.appendChild(h('div', { class: 'list' }, h('div', { class: 'empty', style: 'padding:22px' }, t('pay_info_missing'))));
      /* ho pagato */
      box.appendChild(RB.secT(t('pp_done_t')));
      var method = methods.indexOf('bonifico') >= 0 ? 'bonifico' : 'contanti';
      var amtIn = RB.input('pp-claim-amt', amtTxtNum(amt), { type: 'number', mode: 'decimal', step: '0.01', min: 0 });
      var fl = h('div', { class: 'list' }, RB.field(t('pay_amount') + ' (€)', amtIn));
      if (methods.length > 1) fl.appendChild(h('div', { class: 'field' }, h('span', null, t('pay_method')), RB.seg([{ v: 'bonifico', label: t('m_bonifico') }, { v: 'contanti', label: t('m_contanti') }], method, function (v) { method = v; }, 'pp-method')));
      box.appendChild(fl);
      var done = h('button', { type: 'button', class: 'btn pri', id: 'pp-claim', style: 'margin-top:12px', onclick: function () {
        var v = parseFloat(String(RB.val('pp-claim-amt')).replace(',', '.'));
        if (!(v > 0)) { RB.toast(t('pay_e_amt'), 'err'); RB.feel('err'); return; }
        RB.act(done, function () { return RB.rpc('rc_pay_claim', { p_code: RB.S.code, p_run: runId, p_amount: v, p_method: method, p_note: null }); }, t('pp_claim_ok')).then(function (x) {
          if (x && x.ok) { RB.sound('ok'); RB.payLoad().then(function () { build(); RB.render(); }); }
        });
      } }, RB.icon('check'), t('pp_done'));
      box.appendChild(done);
      box.appendChild(h('p', { class: 'sm', style: 'padding:0 6px' }, t('pp_done_d')));
    }
    function amtTxtNum(v) { return (Math.round(v * 100) / 100).toFixed(2); }
    ctl = RB.sheet({ title: t('pp_title'), content: box, full: true, leftLabel: t('close') });
    build();
    return ctl;
  };

  /* ---------- il tesoriere ---------- */
  RB.payAlerts = function () {
    if (!RB.can('payments_manage')) return [];
    var T = RBL.payTotals(runsWithFees(), RB.S.d.signups || [], pays(), RB.S.pay.receipts, Date.now()), out = [];
    T.runs.forEach(function (o) { if (o.late) out.push({ run: o.run, n: o.late, amount: o.lateAmount }); });
    return out;
  };
  RB.payBlock = function (root) {
    if (!RB.can('payments_manage')) return;
    var T = RBL.payTotals(runsWithFees(), RB.S.d.signups || [], pays(), RB.S.pay.receipts, Date.now());
    root.appendChild(RB.secT(t('pay_title')));
    var cl = RB.S.pay.claims || [];
    if (cl.length) {
      var cb = h('div', { class: 'list', id: 'pay-claims', style: 'margin-bottom:10px' });
      cl.forEach(function (c) { var m = RB.mem(c.member_id), r = RB.run(c.run_id); if (m && r) cb.appendChild(RB.row({ lead: RB.av(m, 'sm'), title: RB.fullName(m), sub: r.title + ' · ' + methodName(c.method) + ' · ' + RB.fmt.dayShort(c.created_at), value: money(+c.amount), right: RB.chip(t('pc_to_confirm'), 'wa'), onclick: function () { RB.payMember(c.run_id, c.member_id); } })); });
      root.appendChild(RB.secT(t('pc_title_n', cl.length))); root.appendChild(cb);
    }
    T.runs.filter(function (o) { return o.late; }).forEach(function (o) {
      root.appendChild(h('div', { class: 'banner er', role: 'button', tabindex: '0', style: 'cursor:pointer', onclick: function () { RB.payRun(o.run.id); } }, t('pay_alert', o.late, o.run.title, money(o.lateAmount))));
    });
    var kp = h('div', { class: 'kpis', id: 'pay-kpis' });
    [[money(T.paid), t('pay_k_paid')], [money(T.left), t('pay_k_left')], [String(T.late), t('pay_k_late')]].forEach(function (k) { kp.appendChild(h('div', { class: 'kpi' }, h('b', null, k[0]), h('span', null, k[1]))); });
    root.appendChild(kp);
    var ag = RBL.payAging(runsWithFees(), RB.S.d.signups || [], pays(), RB.S.pay.receipts, Date.now());
    if (T.late) {
      var al = h('div', { class: 'list', id: 'pay-aging', style: 'margin-bottom:10px' });
      [[t('pay_ag1'), ag[0]], [t('pay_ag2'), ag[1]], [t('pay_ag3'), ag[2]]].forEach(function (x, i) { if (x[1].n) al.appendChild(RB.row({ title: x[0], sub: t('pay_members_n', x[1].n), value: money(x[1].amount), go: false, right: RB.chip(String(x[1].n), i === 2 ? 'er' : 'wa') })); });
      root.appendChild(al);
    }
    var rf = RBL.payRefunds(RB.S.d.runs || [], RB.S.d.signups || [], pays());
    if (rf.length) {
      var rl = h('div', { class: 'list', id: 'pay-refunds', style: 'margin-bottom:10px' });
      rf.forEach(function (x) { var m = RB.mem(x.member_id); if (m) rl.appendChild(RB.row({ lead: RB.av(m, 'sm'), title: RB.fullName(m), sub: t('pay_refund_due', x.run.title), value: money(x.amount), right: RB.chip(t('pay_refund'), 'wa'), onclick: function () { RB.payMember(x.run.id, x.member_id); } })); });
      root.appendChild(RB.secT(t('pay_refunds'))); root.appendChild(rl);
    }
    root.appendChild(h('div', { class: 'list', style: 'margin-bottom:10px' }, RB.row({ lead: RB.icon('file'), title: t('pay_ledger'), sub: t('pay_ledger_d'), id: 'pay-ledger-open', onclick: function () { RB.payLedger(); } })));
    var l = h('div', { class: 'list', id: 'pay-runs' });
    if (!T.runs.length) l.appendChild(h('div', { class: 'empty', style: 'padding:22px' }, t('pay_none')));
    T.runs.forEach(function (o) {
      l.appendChild(RB.row({ title: o.run.title, sub: RB.fmt.day(new Date(o.run.run_date)) + ' · ' + t('pay_paid_n', o.paidN, o.n), value: money(o.paid) + ' / ' + money(o.due), right: o.late ? RB.chip(t('pay_late_n', o.late), 'er') : o.paid >= o.due ? RB.chip(t('pay_s_paid'), 'ok') : null, onclick: function () { RB.payRun(o.run.id); } }));
    });
    root.appendChild(l);
  };
  /* riquadro nella dashboard (Report) */
  RB.payDash = function (root) {
    if (!RB.can('payments_manage')) return;
    var T = RBL.payTotals(runsWithFees(), RB.S.d.signups || [], pays(), RB.S.pay.receipts, Date.now());
    root.appendChild(RB.secT(t('pay_dash')));
    var kp = h('div', { class: 'kpis', id: 'dash-pay' });
    [[money(T.paid), t('pay_k_paid')], [money(T.left), t('pay_k_left')], [String(T.late), t('pay_k_late')]].forEach(function (k) { kp.appendChild(h('div', { class: 'kpi' }, h('b', null, k[0]), h('span', null, k[1]))); });
    root.appendChild(kp);
    RB.payAlerts().forEach(function (a) { root.appendChild(h('div', { class: 'banner er', role: 'button', tabindex: '0', style: 'cursor:pointer', onclick: function () { RB.payRun(a.run.id); } }, t('pay_alert', a.n, a.run.title, money(a.amount)))); });
  };

  RB.payRun = function (runId) {
    var r = RB.run(runId); if (!r) return;
    var box = h('div', { id: 'pay-run' }), filter = 'all', ctl;
    function rowsData() {
      return (RB.S.d.signups || []).filter(function (sg) { return sg.run_id === runId && sg.status === 'si'; }).map(function (sg) {
        var st = state(r, sg); return { sg: sg, st: st, m: RB.mem(sg.member_id) };
      }).filter(function (x) { return x.m && x.st.due; }).sort(function (a, b) { return (b.st.late - a.st.late) || RB.fullName(a.m).localeCompare(RB.fullName(b.m)); });
    }
    function draw() {
      RB.clear(box);
      var all = rowsData(), rows = all.filter(function (x) { return filter === 'all' || (filter === 'late' && x.st.late) || (filter === 'open' && x.st.state !== 'paid') || (filter === 'paid' && x.st.state === 'paid'); });
      var due = 0, paid = 0; all.forEach(function (x) { due += x.st.due; paid += Math.min(x.st.paid, x.st.due); });
      var kp = h('div', { class: 'kpis' });
      [[money(paid), t('pay_k_paid')], [money(due - paid), t('pay_k_left')], [String(all.filter(function (x) { return x.st.late; }).length), t('pay_k_late')]].forEach(function (k) { kp.appendChild(h('div', { class: 'kpi' }, h('b', null, k[0]), h('span', null, k[1]))); });
      box.appendChild(kp);
      var mg = RBL.runMargin(r, RB.S.d.signups || [], pays(), RB.S.pay.expenses, Date.now());
      box.appendChild(h('div', { class: 'list', style: 'margin-bottom:12px' }, RB.row({ lead: RB.icon('quote'), title: t('pay_exp'), sub: t('pay_margin') + ' ' + money(mg.margin) + ' · ' + t('pay_forecast') + ' ' + money(mg.forecast), value: money(mg.spent), id: 'pay-exp-open', onclick: function () { RB.payExpenses(runId, draw); } })));
      box.appendChild(RB.seg([{ v: 'all', label: t('pay_f_all') }, { v: 'late', label: t('pay_f_late') }, { v: 'open', label: t('pay_f_open') }, { v: 'paid', label: t('pay_f_paid') }], filter, function (v) { filter = v; draw(); }, 'pay-filter'));
      var l = h('div', { class: 'list', style: 'margin-top:12px' });
      if (!rows.length) l.appendChild(h('div', { class: 'empty', style: 'padding:22px' }, t('pay_none')));
      rows.forEach(function (x) {
        l.appendChild(RB.row({ lead: RB.av(x.m, 'sm'), title: RB.fullName(x.m), sub: x.st.state === 'paid' ? money(x.st.due) : t('pay_left_of', money(x.st.left), money(x.st.due)) + (hasRc(runId, x.sg.member_id) ? ' · PDF' : ''), right: chipFor(x.st), onclick: function () { RB.payMember(runId, x.sg.member_id, draw); } }));
      });
      box.appendChild(l);
      box.appendChild(h('button', { type: 'button', class: 'btn sec', id: 'pay-xls', style: 'margin-top:14px', onclick: function () {
        var head = [t('last_name'), t('first_name'), t('pay_due'), t('pay_paid'), t('pay_left'), t('pay_status'), 'PDF'];
        var data = all.map(function (x) { return [x.m.last_name, x.m.first_name, x.st.due, x.st.paid, x.st.left, x.st.state === 'paid' ? t('pay_s_paid') : x.st.late ? t('pay_late') : chipText(x.st), hasRc(runId, x.sg.member_id) ? 'sì' : '']; });
        RB.xls.exportTable(r.title + ' ' + t('pay_title'), head, data).then(function () { RB.toast(t('exported')); }, function () { RB.toast(t('e_xls'), 'err'); });
      } }, RB.icon('file'), t('pay_export')));
    }
    ctl = RB.sheet({ title: r.title, content: box, full: true, leftLabel: t('close') });
    draw();
  };

  RB.payMember = function (runId, memId, done) {
    var r = RB.run(runId), m = RB.mem(memId), sg = (RB.S.d.signups || []).filter(function (x) { return x.run_id === runId && x.member_id === memId; })[0];
    if (!r || !m || !sg) return;
    var box = h('div', { id: 'pay-member' }), method = 'bonifico', kind = 'in', ctl;
    function build() {
      RB.clear(box); var st = state(r, sg);
      box.appendChild(h('div', { class: 'list' },
        RB.row({ title: t('pay_due'), value: money(st.due), go: false }),
        RB.row({ title: t('pay_paid'), value: money(st.paid), go: false }),
        RB.row({ title: t('pay_left'), value: money(st.left), right: chipFor(st), go: false })));
      var mine = pays().filter(function (p) { return p.run_id === runId && p.member_id === memId; });
      if (mine.length) {
        box.appendChild(RB.secT(t('pay_history')));
        var l = h('div', { class: 'list' });
        mine.forEach(function (p) {
          l.appendChild(RB.row({ title: money(+p.amount), cls: +p.amount < 0 ? 'refund' : '', sub: RB.fmt.full(p.paid_on) + ' · ' + methodName(p.method) + (p.note ? ' · ' + p.note : ''), go: false,
            right: h('button', { type: 'button', class: 'ib', 'aria-label': t('delete'), onclick: function () { RB.ask({ title: t('pay_del'), msg: money(+p.amount), ok: t('delete'), danger: true }).then(function (ok) { if (ok) RB.rpc('rc_pay_delete', { p_code: RB.S.code, p_id: p.id }).then(function () { RB.payLoad().then(function () { build(); if (done) done(); }); }); }); } }, RB.icon('trash')) }));
        });
        box.appendChild(l);
      }
      claimsOf(runId, memId).forEach(function (c) {
        var ok = h('button', { type: 'button', class: 'btn pri', style: 'margin-top:0', 'data-claim-ok': c.id, onclick: function () {
          RB.act(ok, function () { return RB.rpc('rc_pay_save', { p_code: RB.S.code, p_run: runId, p_member: memId, p_amount: +c.amount, p_paid_on: String(c.created_at).slice(0, 10), p_method: c.method, p_note: t('pc_note') }).then(function (x) { return x && x.ok ? RB.rpc('rc_pay_claim_done', { p_code: RB.S.code, p_id: c.id }) : x; }); }, t('pay_saved')).then(function (x) {
            if (x && x.ok) RB.payLoad().then(function () { build(); if (done) done(); RB.render(); });
          });
        } }, t('pc_register'));
        var no = h('button', { type: 'button', class: 'btn sec', style: 'margin-top:0', onclick: function () {
          RB.ask({ title: t('pc_discard'), msg: t('pc_discard_msg'), ok: t('pc_discard'), danger: true }).then(function (y) { if (y) RB.rpc('rc_pay_claim_done', { p_code: RB.S.code, p_id: c.id }).then(function () { RB.payLoad().then(function () { build(); if (done) done(); RB.render(); }); }); });
        } }, t('pc_discard'));
        box.appendChild(h('div', { class: 'card pc-card', style: 'margin-top:12px' }, h('b', null, t('pc_says', money(+c.amount), methodName(c.method))), h('p', { class: 'sm', style: 'margin:4px 0 10px' }, RB.fmt.full(c.created_at) + (c.note ? ' · ' + c.note : '')), h('div', { style: 'display:flex;gap:8px' }, ok, no)));
      });
      var rc = RB.S.pay.receipts.filter(function (x) { return x.run_id === runId && x.member_id === memId; })[0];
      if (rc) box.appendChild(h('div', { class: 'list', style: 'margin-top:12px' }, RB.row({ lead: RB.icon('file'), title: t('pay_rc_view'), sub: rc.name, id: 'pay-rc-open', onclick: function () { openReceipt(runId, memId); } })));
      if (st.state !== 'paid' && st.state !== 'none' && m.phone && RB.waDigits(m.phone)) {
        box.appendChild(h('div', { class: 'list', style: 'margin-top:12px' }, RB.row({ lead: RB.icon('share'), title: t('pay_remind'), sub: t('pay_remind_d'), id: 'pay-remind', go: false, onclick: function () {
          var pi = (RB.S.d.settings && RB.S.d.settings.payment_info) || {}, cz = RBL.causale(r.causale || pi.causale || '', { run: r.title, cognome: m.last_name, nome: m.first_name, rata: '' });
          var txt = t('pay_remind_txt', m.first_name, r.title, money(st.late ? st.lateAmount : st.left)) + (pi.iban ? ' IBAN ' + pi.iban + (cz ? ' · ' + t('causale') + ': ' + cz : '') : '');
          window.open('https://wa.me/' + RB.waDigits(m.phone) + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
        } })));
      }
      if (st.state !== 'paid' || st.paid > st.due) {
        box.appendChild(RB.secT(t('pay_register')));
        box.appendChild(RB.seg([{ v: 'in', label: t('pay_in') }, { v: 'out', label: t('pay_out') }], kind, function (v) { kind = v; }, 'pay-kind'));
        box.appendChild(h('div', { class: 'list' },
          RB.field(t('pay_amount') + ' (€)', RB.input('pay-amt', st.left || '', { type: 'number', mode: 'decimal', step: '0.01', min: 0 })),
          RB.field(t('pay_date'), RB.input('pay-date', today(), { type: 'date' })),
          h('div', { class: 'field' }, h('span', null, t('pay_method')), RB.seg([{ v: 'bonifico', label: t('m_bonifico') }, { v: 'contanti', label: t('m_contanti') }, { v: 'abbuono', label: t('m_abbuono') }], method, function (v) { method = v; }, 'pay-method')),
          RB.field(t('pay_note'), RB.input('pay-note', '', { max: 200 }))));
        var save = h('button', { type: 'button', class: 'btn pri', id: 'pay-save', style: 'margin-top:14px', onclick: function () {
          var amt = parseFloat(String(RB.val('pay-amt')).replace(',', '.'));
          if (!(amt > 0) || !RB.val('pay-date')) { RB.toast(t('pay_e_amt'), 'err'); RB.feel('err'); return; }
          RB.act(save, function () { return RB.rpc('rc_pay_save', { p_code: RB.S.code, p_run: runId, p_member: memId, p_amount: kind === 'out' ? -amt : amt, p_paid_on: RB.val('pay-date'), p_method: method, p_note: RB.val('pay-note') }); }, t('pay_saved')).then(function (x) {
            if (x && x.ok) RB.payLoad().then(function () { build(); if (done) done(); RB.render(); });
          });
        } }, t('pay_register'));
        box.appendChild(save);
      }
    }
    ctl = RB.sheet({ title: RB.fullName(m), content: box, full: true, leftLabel: t('close') });
    build();
  };

  /* giornale di cassa: tutti i versamenti, totali per metodo, esportazione */
  RB.payLedger = function () {
    var box = h('div', { id: 'pay-ledger' }), filter = 'all', ctl;
    function draw() {
      RB.clear(box);
      var all = pays().slice().sort(function (a, b) { return String(b.paid_on).localeCompare(String(a.paid_on)); }), tot = { contanti: 0, bonifico: 0, abbuono: 0 };
      all.forEach(function (p) { tot[p.method] = Math.round((tot[p.method] + (+p.amount || 0)) * 100) / 100; });
      var kp = h('div', { class: 'kpis' });
      [[money(tot.contanti), t('pay_cash')], [money(tot.bonifico), t('m_bonifico')], [money(tot.abbuono), t('m_abbuono')]].forEach(function (k) { kp.appendChild(h('div', { class: 'kpi' }, h('b', null, k[0]), h('span', null, k[1]))); });
      box.appendChild(kp);
      box.appendChild(RB.seg([{ v: 'all', label: t('pay_f_all') }, { v: 'contanti', label: t('m_contanti') }, { v: 'bonifico', label: t('m_bonifico') }, { v: 'abbuono', label: t('m_abbuono') }], filter, function (v) { filter = v; draw(); }, 'pay-lf'));
      var rows = all.filter(function (p) { return filter === 'all' || p.method === filter; }), l = h('div', { class: 'list', style: 'margin-top:12px' });
      if (!rows.length) l.appendChild(h('div', { class: 'empty', style: 'padding:22px' }, t('pay_none')));
      rows.forEach(function (p) {
        var m = RB.mem(p.member_id), r = RB.run(p.run_id); if (!m || !r) return;
        l.appendChild(RB.row({ title: RB.fullName(m), sub: RB.fmt.full(p.paid_on) + ' · ' + methodName(p.method) + ' · ' + r.title, value: money(+p.amount), onclick: function () { RB.payMember(p.run_id, p.member_id, draw); } }));
      });
      box.appendChild(l);
      box.appendChild(h('button', { type: 'button', class: 'btn sec', id: 'pay-ledger-xls', style: 'margin-top:14px', onclick: function () {
        var head = [t('pay_date'), t('last_name'), t('first_name'), 'Run', t('pay_method'), t('pay_amount'), t('pay_note')];
        var data = all.map(function (p) { var m = RB.mem(p.member_id) || {}, r = RB.run(p.run_id) || {}; return [p.paid_on, m.last_name || '', m.first_name || '', r.title || '', methodName(p.method), +p.amount, p.note || '']; });
        RB.xls.exportTable(t('pay_ledger'), head, data).then(function () { RB.toast(t('exported')); }, function () { RB.toast(t('e_xls'), 'err'); });
      } }, RB.icon('file'), t('pay_export')));
    }
    ctl = RB.sheet({ title: t('pay_ledger'), content: box, full: true, leftLabel: t('close') }); draw();
  };

  /* spese di un Run e margine */
  RB.payExpenses = function (runId, done) {
    var r = RB.run(runId); if (!r) return;
    var box = h('div', { id: 'pay-exps' }), ctl;
    function build() {
      RB.clear(box);
      var mg = RBL.runMargin(r, RB.S.d.signups || [], pays(), RB.S.pay.expenses, Date.now());
      box.appendChild(h('div', { class: 'list' },
        RB.row({ title: t('pay_k_paid'), value: money(mg.paid), go: false }),
        RB.row({ title: t('pay_exp'), value: money(mg.spent), go: false }),
        RB.row({ title: t('pay_margin'), value: money(mg.margin), go: false, right: RB.chip(mg.margin >= 0 ? '+' : '−', mg.margin >= 0 ? 'ok' : 'er') }),
        RB.row({ title: t('pay_forecast'), sub: t('pay_forecast_d'), value: money(mg.forecast), go: false })));
      var mine = RB.S.pay.expenses.filter(function (e) { return e.run_id === runId; });
      if (mine.length) {
        var l = h('div', { class: 'list', style: 'margin-top:12px' });
        mine.forEach(function (e) {
          l.appendChild(RB.row({ title: e.label, sub: RB.fmt.full(e.paid_on) + (e.note ? ' · ' + e.note : ''), value: money(+e.amount), go: false,
            right: h('button', { type: 'button', class: 'ib', 'aria-label': t('delete'), onclick: function () { RB.ask({ title: t('pay_del'), msg: e.label, ok: t('delete'), danger: true }).then(function (ok) { if (ok) RB.rpc('rc_exp_delete', { p_code: RB.S.code, p_id: e.id }).then(function () { RB.payLoad().then(function () { build(); if (done) done(); }); }); }); } }, RB.icon('trash')) }));
        });
        box.appendChild(l);
      }
      box.appendChild(RB.secT(t('pay_exp_add')));
      box.appendChild(h('div', { class: 'list' },
        RB.field(t('pay_exp_label'), RB.input('ex-label', '', { max: 80, ph: t('pay_exp_ph') })),
        RB.field(t('pay_amount') + ' (€)', RB.input('ex-amt', '', { type: 'number', mode: 'decimal', step: '0.01', min: 0 })),
        RB.field(t('pay_date'), RB.input('ex-date', today(), { type: 'date' })),
        RB.field(t('pay_note'), RB.input('ex-note', '', { max: 200 }))));
      var save = h('button', { type: 'button', class: 'btn pri', id: 'ex-save', style: 'margin-top:14px', onclick: function () {
        var amt = parseFloat(String(RB.val('ex-amt')).replace(',', '.'));
        if (!RB.val('ex-label') || !(amt > 0) || !RB.val('ex-date')) { RB.toast(t('pay_e_amt'), 'err'); RB.feel('err'); return; }
        RB.act(save, function () { return RB.rpc('rc_exp_save', { p_code: RB.S.code, p_run: runId, p_label: RB.val('ex-label'), p_amount: amt, p_paid_on: RB.val('ex-date'), p_note: RB.val('ex-note') }); }, t('pay_saved')).then(function (x) { if (x && x.ok) RB.payLoad().then(function () { build(); if (done) done(); }); });
      } }, t('pay_exp_add'));
      box.appendChild(save);
    }
    ctl = RB.sheet({ title: r.title, content: box, full: true, leftLabel: t('close') }); build();
  };
})();
