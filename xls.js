/* Roadbook · Excel: lettura, modello e esportazioni (libreria SheetJS caricata solo quando serve) */
(function () {
  'use strict';
  var RB = window.RB = window.RB || {};
  var SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var loading = null;

  function lib() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = SRC; s.onload = function () { res(window.XLSX); };
      s.onerror = function () { loading = null; rej(new Error('xlsx-load')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /* file scelto dall'utente -> matrice di celle */
  function read(file) {
    return lib().then(function (X) {
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onerror = function () { rej(new Error('read')); };
        fr.onload = function () {
          try {
            var wb = X.read(fr.result, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            res(X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }));
          } catch (e) { rej(e); }
        };
        fr.readAsArrayBuffer(file);
      });
    });
  }

  function save(X, wb, name) { X.writeFile(wb, name); }

  function template() {
    return lib().then(function (X) {
      var wb = X.utils.book_new();
      var head = ['Nome', 'Cognome', 'Telefono', 'Email', 'Data di nascita', 'N. Tessera', 'Moto', 'Ruolo', 'Data iscrizione', 'Note'];
      var ws = X.utils.aoa_to_sheet([head]);
      ws['!cols'] = head.map(function (h) { return { wch: Math.max(14, h.length + 2) }; });
      X.utils.book_append_sheet(wb, ws, 'Soci');
      var info = [[RB.t('xls_help_title')], [RB.t('xls_help_1')], [RB.t('xls_help_2')], [RB.t('xls_help_3')], [''],
        [RB.t('xls_help_roles')]].concat(RBL.TITLES.map(function (t) { return [RB.t('title_' + t)]; }));
      var w2 = X.utils.aoa_to_sheet(info); w2['!cols'] = [{ wch: 90 }];
      X.utils.book_append_sheet(wb, w2, RB.t('xls_help_sheet'));
      save(X, wb, 'roadbook-modello-soci.xlsx');
    });
  }

  function exportMembers() {
    return lib().then(function (X) {
      var rows = [['Nome', 'Cognome', 'Telefono', 'Email', 'Data di nascita', 'N. Tessera', 'Moto', 'Ruolo', 'Data iscrizione', 'Attivo', 'Note']];
      RB.members().forEach(function (m) {
        rows.push([m.first_name, m.last_name, m.phone || '', m.email || '', m.birth_date || '', m.tessera || '', m.bike || '', RB.t('title_' + m.title), m.joined_on || '', m.active ? 'Si' : 'No', m.notes || '']);
      });
      var wb = X.utils.book_new(), ws = X.utils.aoa_to_sheet(rows);
      ws['!cols'] = [14, 16, 16, 26, 14, 12, 18, 18, 14, 8, 30].map(function (w) { return { wch: w }; });
      X.utils.book_append_sheet(wb, ws, 'Soci');
      save(X, wb, 'roadbook-soci.xlsx');
    });
  }

  function exportPayments(year) {
    return lib().then(function (X) {
      var rows = [[RB.t('x_name'), RB.t('x_year'), RB.t('x_status'), RB.t('x_amount'), RB.t('x_method'), RB.t('x_date'), RB.t('x_note')]];
      var pays = (RB.S.d.payments || []).filter(function (p) { return p.year === year; });
      RB.members().filter(function (m) { return m.active; }).forEach(function (m) {
        var p = pays.filter(function (x) { return x.member_id === m.id; });
        if (!p.length) rows.push([RB.fullName(m), year, RB.t('unpaid'), '', '', '', '']);
        p.forEach(function (x) { rows.push([RB.fullName(m), year, RB.t('paid'), Number(x.amount), RB.t('m_' + x.method), x.paid_on || '', x.note || '']); });
      });
      var wb = X.utils.book_new(), ws = X.utils.aoa_to_sheet(rows);
      ws['!cols'] = [26, 8, 12, 10, 12, 12, 30].map(function (w) { return { wch: w }; });
      X.utils.book_append_sheet(wb, ws, String(year));
      save(X, wb, 'roadbook-quote-' + year + '.xlsx');
    });
  }

  RB.xls = { read: read, template: template, exportMembers: exportMembers, exportPayments: exportPayments };
})();
