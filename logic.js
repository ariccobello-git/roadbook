/* Roadbook · logica pura (nessun accesso al DOM): ruoli, import Excel, formazione. Testata in Node. */
(function (root) {
  'use strict';
  var L = {};

  /* permessi dei profili di accesso (stessi nomi e stesse dipendenze del database) */
  L.PERMS = ['members_view', 'phones_view', 'personal_view', 'route_view', 'formation_draft_view', 'runs_edit', 'formation_edit', 'signups_manage', 'photos_moderate', 'members_edit', 'settings_edit', 'profiles_manage', 'reports_view', 'emergency_manage', 'payments_manage', 'route_author', 'review_approve'];
  L.PERM_DEPS = {
    runs_edit: ['route_view'], formation_edit: ['formation_draft_view', 'members_view'], signups_manage: ['members_view'],
    members_edit: ['members_view', 'phones_view', 'personal_view'],
    emergency_manage: ['members_view', 'phones_view', 'personal_view'],
    payments_manage: ['members_view', 'personal_view', 'reports_view'],
    route_author: ['runs_edit', 'route_view', 'members_view'], review_approve: ['route_view', 'formation_draft_view', 'members_view'],
    phones_view: ['members_view'], personal_view: ['members_view'], profiles_manage: ['members_view'], reports_view: ['members_view']
  };
  /* revisione di percorso e formazione: stato per sezione e rilascio a direttivo/operativo */
  L.reviewOf = function (run) {
    var rv = (run && run.review) || {}, st = function (k) { return (rv[k] && rv[k].st) || 'bozza'; };
    var ro = st('route'), fo = st('formation');
    return { route: ro, formation: fo, released: !!rv.release, ready: ro === 'approvato' && fo === 'approvato', note: { route: rv.route && rv.route.note || '', formation: rv.formation && rv.formation.note || '' } };
  };
  L.closePerms = function (list) {
    var set = {}, out = [];
    (list || []).forEach(function (p) { set[p] = true; (L.PERM_DEPS[p] || []).forEach(function (d) { set[d] = true; }); });
    L.PERMS.forEach(function (p) { if (set[p]) out.push(p); });
    return out;
  };
  /* attiva/disattiva un permesso mantenendo coerenti quelli collegati */
  L.setPerm = function (list, key, on) {
    var set = {}, k, changed;
    (list || []).forEach(function (p) { set[p] = true; });
    if (on) { set[key] = true; return L.closePerms(Object.keys(set)); }
    delete set[key];
    do {
      changed = false;
      for (k in set) if ((L.PERM_DEPS[k] || []).some(function (d) { return !set[d]; })) { delete set[k]; changed = true; }
    } while (changed);
    return L.PERMS.filter(function (p) { return set[p]; });
  };

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  L.norm = norm;

  /* testo libero dei ruoli predefiniti (italiano, inglese, francese) */
  var ROLE_SYN = {
    socio: ['socio', 'soci', 'member', 'membre', 'membro', 'tesserato', 'ordinario'],
    admin: ['admin', 'amministratore', 'administrator', 'administrateur'],
    presidente: ['presidente', 'president'],
    direttore: ['direttore', 'direttrice', 'director', 'directeur'],
    vice_direttore: ['vice direttore', 'vicedirettore', 'vice direttrice', 'vice director', 'vice directeur'],
    head_road_captain: ['head road captain', 'head road capitain', 'head road capitan', 'head roadcaptain', 'head road cap', 'head rc', 'hrc', 'capo road captain'],
    road_captain: ['road captain', 'road capitain', 'road capitan', 'roadcaptain', 'road cap', 'rc', 'capo strada'],
    safety: ['safety', 'safety officer', 'responsabile sicurezza', 'responsable securite'],
    segretario: ['segretario', 'segretaria', 'secretary', 'secretaire', 'secrétaire'],
    tesoriere: ['tesoriere', 'tesoriera', 'treasurer', 'tresorier', 'trésorier'],
    officer: ['officer', 'officers', 'ufficiale', 'officier']
  };
  /* testo libero (anche da Excel) -> chiave del profilo, oppure null se non riconosciuto.
     Cella vuota = socio. `profiles` (facoltativo) aggiunge i profili personalizzati e limita ai profili esistenti. */
  L.resolveRole = function (s, profiles) {
    var raw = String(s == null ? '' : s).trim();
    if (!norm(raw)) return 'socio';
    var forms = [raw, raw.replace(/\(.*?\)/g, '')], i, j, k, n, p;
    for (i = 0; i < forms.length; i++) {
      n = norm(forms[i]); if (!n) continue;
      if (profiles) {
        for (j = 0; j < profiles.length; j++) if (norm(profiles[j].name) === n || norm(profiles[j].key) === n) return profiles[j].key;
      }
      for (k in ROLE_SYN) {
        if (ROLE_SYN[k].indexOf(n) < 0) continue;
        if (profiles) { for (p = 0; p < profiles.length; p++) if (profiles[p].key === k) return k; return null; }
        return k;
      }
    }
    return null;
  };

  /* intestazioni colonna riconosciute (italiano, inglese, francese) */
  var SYN = {
    first_name: ['nome', 'first name', 'firstname', 'name', 'prenom', 'given name'],
    last_name: ['cognome', 'last name', 'lastname', 'surname', 'nom', 'nom de famille', 'family name'],
    phone: ['telefono', 'cellulare', 'cell', 'tel', 'phone', 'mobile', 'telephone', 'numero di telefono'],
    email: ['email', 'e mail', 'mail', 'posta elettronica', 'courriel'],
    birth_date: ['data di nascita', 'nascita', 'nato il', 'birth date', 'birthdate', 'date of birth', 'date de naissance', 'dob'],
    tessera: ['tessera', 'n tessera', 'numero tessera', 'n socio', 'numero socio', 'membership', 'membership number', 'member number', 'numero de membre', 'hog'],
    bike: ['moto', 'motocicletta', 'modello moto', 'bike', 'motorcycle', 'modello'],
    title: ['ruolo', 'titolo', 'carica', 'role', 'title', 'fonction', 'qualifica'],
    joined_on: ['data iscrizione', 'iscritto dal', 'data di iscrizione', 'iscrizione', 'joined', 'join date', 'member since', 'date d adhesion', 'inscrit depuis'],
    notes: ['note', 'notes', 'annotazioni', 'remarques', 'osservazioni'],
    hog_until: ['scadenza hog', 'scadenza tessera hog', 'hog scadenza', 'tessera hog scadenza', 'hog fino al', 'hog expiry', 'hog expiration', 'expiration hog', 'expiration h o g'],
    release_year: ['liberatoria', 'anno liberatoria', 'liberatoria anno', 'release', 'waiver', 'decharge', 'annee decharge']
  };
  L.FIELDS = Object.keys(SYN);

  L.mapHeaders = function (headerRow) {
    var map = {}, used = {}, i, f, k, h;
    for (f in SYN) {
      for (i = 0; i < headerRow.length; i++) {
        if (used[i]) continue;
        h = norm(headerRow[i]);
        if (!h) continue;
        for (k = 0; k < SYN[f].length; k++) {
          if (h === SYN[f][k]) { map[f] = i; used[i] = true; break; }
        }
        if (map[f] !== undefined) break;
      }
    }
    return map;
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function validYMD(y, m, d) {
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return '';
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
    return y + '-' + pad(m) + '-' + pad(d);
  }
  /* numero seriale Excel, Date, "gg/mm/aaaa", "aaaa-mm-gg" -> "aaaa-mm-gg" oppure "" */
  L.parseDate = function (v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return isNaN(v) ? '' : validYMD(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') {
      if (v < 1 || v > 80000) return '';
      var dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return validYMD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(s))) return validYMD(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/.exec(s))) {
      var y = +m[3]; if (m[3].length === 2) y += y > 30 ? 1900 : 2000;
      return validYMD(y, +m[2], +m[1]);
    }
    return '';
  };

  /* anno della liberatoria: 2026, "2026", una data (si prende l'anno), "sì" non basta */
  L.parseYear = function (v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v >= 2000 && v <= 2100 && Math.floor(v) === v) return String(v);
    var d = L.parseDate(v); if (d) return d.slice(0, 4);
    var m = /^\s*(20\d\d)\s*$/.exec(String(v)); return m ? m[1] : '';
  };
  /* documenti del socio per un Run: tessera HOG valida alla data del Run e liberatoria dell'anno del Run.
     La liberatoria si controlla solo se il chapter ha iniziato a registrarla (almeno un socio con l'anno). */
  L.memberDocs = function (m, runDate, releaseTracked) {
    var d = String(runDate || '').slice(0, 10), y = +d.slice(0, 4), out = { hog: '', release: '' };
    if (!m || !d) return out;
    if (m.hog_until) out.hog = String(m.hog_until).slice(0, 10) < d ? 'expired' : 'ok';
    if (releaseTracked) out.release = +m.release_year === y ? 'ok' : 'missing';
    return out;
  };
  function cell(row, idx) {
    if (idx === undefined) return '';
    var v = row[idx];
    if (v == null) return '';
    if (typeof v === 'number' && !isFinite(v)) return '';
    return v;
  }
  function text(v) {
    if (v instanceof Date) return '';
    if (typeof v === 'number') return String(v);
    return String(v == null ? '' : v).trim();
  }

  /* matrice (righe di celle, prima riga = intestazioni) -> righe pronte per il database */
  L.rowsFromMatrix = function (matrix, profiles) {
    var out = { rows: [], invalid: [], mapping: {}, missing: [], total: 0 };
    if (!matrix || !matrix.length) { out.missing = ['first_name', 'last_name']; return out; }
    var hi = 0;
    while (hi < matrix.length && matrix[hi].every(function (c) { return text(c) === ''; })) hi++;
    if (hi >= matrix.length) { out.missing = ['first_name', 'last_name']; return out; }
    var map = L.mapHeaders(matrix[hi]);
    out.mapping = map;
    if (map.first_name === undefined) out.missing.push('first_name');
    if (map.last_name === undefined) out.missing.push('last_name');
    if (out.missing.length) return out;
    var seen = {};
    for (var r = hi + 1; r < matrix.length; r++) {
      var row = matrix[r];
      if (row.every(function (c) { return text(c) === ''; })) continue;
      out.total++;
      var o = {
        first_name: text(cell(row, map.first_name)), last_name: text(cell(row, map.last_name)),
        phone: text(cell(row, map.phone)), email: text(cell(row, map.email)), tessera: text(cell(row, map.tessera)),
        bike: text(cell(row, map.bike)), notes: text(cell(row, map.notes)),
        title: L.resolveRole(text(cell(row, map.title)), profiles),
        birth_date: L.parseDate(cell(row, map.birth_date)), joined_on: L.parseDate(cell(row, map.joined_on)),
        hog_until: L.parseDate(cell(row, map.hog_until)), release_year: L.parseYear(cell(row, map.release_year))
      };
      var bd = map.birth_date !== undefined ? cell(row, map.birth_date) : '', jd = map.joined_on !== undefined ? cell(row, map.joined_on) : '';
      if (!o.first_name || !o.last_name) { out.invalid.push({ row: r + 1, reason: 'nome_mancante' }); continue; }
      if (o.title === null) { out.invalid.push({ row: r + 1, reason: 'ruolo_sconosciuto', value: text(cell(row, map.title)) }); continue; }
      if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) { out.invalid.push({ row: r + 1, reason: 'email_non_valida' }); continue; }
      var hd = map.hog_until !== undefined ? cell(row, map.hog_until) : '';
      if ((bd !== '' && !o.birth_date) || (jd !== '' && !o.joined_on) || (hd !== '' && !o.hog_until)) { out.invalid.push({ row: r + 1, reason: 'data_non_valida' }); continue; }
      var key = o.tessera ? 't:' + o.tessera.toLowerCase() : 'n:' + norm(o.first_name) + '|' + norm(o.last_name);
      if (seen[key]) { out.invalid.push({ row: r + 1, reason: 'doppione' }); continue; }
      seen[key] = true;
      out.rows.push(o);
    }
    return out;
  };

  /* conteggi iscritti di un run */
  /* quote per Run: quota a persona; chi porta passeggeri paga anche per loro */
  L.runFee = function (r) { var f = r && r.fee != null ? parseFloat(r.fee) : 0; return isFinite(f) && f > 0 ? f : 0; };
  L.rooms = function (r) { return ((r && r.rooms) || []).filter(function (x) { return x && x.id && x.name; }); };
  L.roomOf = function (r, id) { return id ? L.rooms(r).filter(function (x) { return x.id === id; })[0] || null : null; };
  /* spese extra (pranzi, cene, merchandising): per Run, quantità per persona decisa dall'organizzazione */
  L.extras = function (r) { return ((r && r.extras) || []).filter(function (x) { return x && x.id && x.name; }); };
  L.extrasOf = function (r, signup) {
    var q = (signup && signup.extras) || {};
    return Math.round(L.extras(r).reduce(function (a, x) { var n = Math.floor(+q[x.id] || 0); return a + (n > 0 ? n * Math.max(0, +x.price || 0) : 0); }, 0) * 100) / 100;
  };
  L.hasFee = function (r) { return L.runFee(r) > 0 || L.rooms(r).concat(L.extras(r)).some(function (x) { return +x.price > 0; }); };
  /* quota a persona: se ha scelto una sistemazione vale il suo prezzo, altrimenti la quota base */
  L.unitOf = function (r, signup) { var rm = L.roomOf(r, signup && signup.room); return rm ? Math.max(0, +rm.price || 0) : L.runFee(r); };
  L.dueOf = function (r, signup) { return Math.round((L.unitOf(r, signup) * (1 + ((signup && signup.passengers) || 0)) + L.extrasOf(r, signup)) * 100) / 100; };
  /* rate: percentuali con scadenza; l'ultima assorbe gli arrotondamenti. Senza rate = unica soluzione */
  L.plan = function (r, due) {
    var ins = ((r && r.installments) || []).filter(function (x) { return x && x.due_on && +x.pct > 0; }).sort(function (a, b) { return String(a.due_on).localeCompare(String(b.due_on)); });
    if (!ins.length || !due) return [{ due_on: null, amount: due, cum: due }];
    var cum = 0, out = [];
    ins.forEach(function (x, i) {
      var amt = i === ins.length - 1 ? Math.round((due - cum) * 100) / 100 : Math.round(due * x.pct) / 100;
      cum = Math.round((cum + amt) * 100) / 100; out.push({ due_on: String(x.due_on).slice(0, 10), amount: amt, cum: cum });
    });
    return out;
  };
  /* causale del bonifico: segnaposto {run} {cognome} {nome} {rata} (es. "1/2") */
  L.causale = function (tpl, v) {
    v = v || {};
    return String(tpl || '').replace(/\{(run|cognome|nome|rata)\}/g, function (m, k) { return v[k] === undefined || v[k] === null ? '' : String(v[k]); }).replace(/\s+/g, ' ').trim();
  };
  /* una persona: importo dovuto e rate (importo + scadenza) */
  L.schedule = function (r, signup) { var due = L.dueOf(r, signup); return { due: due, rows: L.plan(r, due) }; };

  /* ---------- stato dei pagamenti (tesoriere) ---------- */
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  /* dovuto, versato e ritardo di una persona per un Run. Il ritardo c'è se è scaduta una rata non coperta
     (senza rate: da 7 giorni prima del Run, o a Run già svolto). */
  L.payState = function (run, signup, pays, hasReceipt, nowMs) {
    var due = L.dueOf(run, signup), paid = 0, today = new Date(nowMs).toISOString().slice(0, 10);
    (pays || []).forEach(function (p) { if (p.run_id === run.id && p.member_id === signup.member_id) paid += +p.amount || 0; });
    paid = r2(paid);
    var out = { due: due, paid: paid, left: Math.max(0, r2(due - paid)), state: 'none', late: false, lateAmount: 0, lateDays: 0, nextDue: null };
    if (!due) return out;
    var rows = L.plan(run, due), req = 0, nx = null;
    rows.forEach(function (x) {
      if (x.due_on) { if (x.due_on <= today) req = r2(req + x.amount); else if (!nx && x.cum > paid + 0.005) nx = x.due_on; }
    });
    var since = null;
    rows.forEach(function (x) { if (!since && x.due_on && x.due_on <= today && x.cum > paid + 0.005) since = x.due_on; });
    if (!rows[0].due_on && (new Date(run.run_date).getTime() - nowMs) <= 7 * 86400000) { req = due; since = new Date(new Date(run.run_date).getTime() - 7 * 86400000).toISOString().slice(0, 10); }
    out.nextDue = nx;
    if (paid >= due - 0.005) { out.state = 'paid'; return out; }
    out.late = paid < req - 0.005; out.lateAmount = out.late ? r2(req - paid) : 0;
    if (out.late && since) out.lateDays = Math.max(1, Math.round((Date.parse(today) - Date.parse(since)) / 86400000));
    out.state = paid > 0 ? 'partial' : (hasReceipt ? 'declared' : 'unpaid');
    return out;
  };
  /* riepilogo per Run (esclusi gli annullati) e totale */
  L.payTotals = function (runs, signups, pays, receipts, nowMs) {
    var tot = { due: 0, paid: 0, late: 0, lateAmount: 0, runs: [] };
    (runs || []).forEach(function (r) {
      if (r.status === 'annullato') return;
      var o = { run: r, due: 0, paid: 0, n: 0, paidN: 0, late: 0, lateAmount: 0, declared: 0 };
      (signups || []).forEach(function (sg) {
        if (sg.run_id !== r.id || sg.status !== 'si') return;
        var has = (receipts || []).some(function (x) { return x.run_id === r.id && x.member_id === sg.member_id; }), st = L.payState(r, sg, pays, has, nowMs);
        if (!st.due) return;
        o.n++; o.due = r2(o.due + st.due); o.paid = r2(o.paid + Math.min(st.paid, st.due));
        if (st.state === 'paid') o.paidN++; if (st.late) { o.late++; o.lateAmount = r2(o.lateAmount + st.lateAmount); } if (st.state === 'declared') o.declared++;
      });
      if (!o.n) return;
      tot.runs.push(o); tot.due = r2(tot.due + o.due); tot.paid = r2(tot.paid + o.paid); tot.late += o.late; tot.lateAmount = r2(tot.lateAmount + o.lateAmount);
    });
    tot.left = r2(tot.due - tot.paid);
    return tot;
  };
  /* ritardi per fasce (1-7, 8-30, oltre 30 giorni) su tutti i Run */
  L.payAging = function (runs, signups, pays, receipts, nowMs) {
    var b = [{ n: 0, amount: 0 }, { n: 0, amount: 0 }, { n: 0, amount: 0 }];
    (runs || []).forEach(function (r) {
      if (r.status === 'annullato') return;
      (signups || []).forEach(function (sg) {
        if (sg.run_id !== r.id || sg.status !== 'si') return;
        var st = L.payState(r, sg, pays, false, nowMs); if (!st.late) return;
        var k = st.lateDays <= 7 ? 0 : st.lateDays <= 30 ? 1 : 2; b[k].n++; b[k].amount = r2(b[k].amount + st.lateAmount);
      });
    });
    return b;
  };
  /* rimborsi da fare: chi ha versato ma ha rinunciato (o il Run è annullato) e ha un saldo positivo */
  L.payRefunds = function (runs, signups, pays) {
    var out = [], net = {};
    (pays || []).forEach(function (p) { var k = p.run_id + '|' + p.member_id; net[k] = r2((net[k] || 0) + (+p.amount || 0)); });
    Object.keys(net).forEach(function (k) {
      if (net[k] <= 0.005) return; var a = k.split('|'), run = (runs || []).filter(function (r) { return r.id === a[0]; })[0]; if (!run) return;
      var sg = (signups || []).filter(function (x) { return x.run_id === a[0] && x.member_id === a[1]; })[0];
      if (run.status === 'annullato' || !sg || sg.status === 'no') out.push({ run: run, member_id: a[1], amount: net[k] });
    });
    return out;
  };
  /* spese e margine di un Run: incassato (al netto di rimborsi) meno spese; previsto = dovuto meno spese */
  L.runMargin = function (run, signups, pays, expenses, nowMs) {
    var o = L.payTotals([run], signups, pays, [], nowMs).runs[0] || { due: 0, paid: 0 }, sp = 0;
    (expenses || []).forEach(function (e) { if (e.run_id === run.id) sp += +e.amount || 0; });
    sp = r2(sp); return { due: o.due, paid: o.paid, spent: sp, margin: r2(o.paid - sp), forecast: r2(o.due - sp) };
  };
  L.counts = function (signups) {
    var c = { si: 0, no: 0, riders: 0, pass: 0, total: 0, checked: 0 };
    (signups || []).forEach(function (s) {
      if (s.status === 'si') { c.si++; c.riders++; c.pass += s.passengers || 0; if (s.checked_in) c.checked++; }
      else if (s.status === 'no') c.no++;
    });
    c.total = c.riders + c.pass;
    return c;
  };

  /* formazione automatica: capofila, soci (i più nuovi davanti), safety distribuiti, scopa in coda.
     I Safety Officer iscritti sono sempre posti Safety; se mancano, fanno da safety fino a 2 officer/road captain liberi. */
  L.autoFormation = function (people) {
    var duty = [], regular = [], safetyOff = [], lead = null;
    people.forEach(function (p) {
      if (p.title === 'safety') safetyOff.push(p);
      else if (p.title === 'head_road_captain' || p.title === 'road_captain' || p.title === 'officer') duty.push(p); else regular.push(p);
    });
    var rank = { head_road_captain: 0, road_captain: 1, officer: 2 };
    duty.sort(function (a, b) { return rank[a.title] - rank[b.title]; });
    var rcIdx = -1;
    for (var i = 0; i < duty.length; i++) if (duty[i].title !== 'officer') { rcIdx = i; break; }
    if (rcIdx >= 0) lead = duty.splice(rcIdx, 1)[0];
    var scopa = duty.length ? duty.pop() : null;
    var extra = Math.max(0, 2 - safetyOff.length), safeties = safetyOff.concat(duty.slice(0, extra));
    duty.slice(extra).forEach(function (p) { regular.push(p); });
    regular.sort(function (a, b) { return String(b.joined_on || '').localeCompare(String(a.joined_on || '')) || (a.order || 0) - (b.order || 0); });
    var mid = regular.slice(), n = mid.length, res = [];
    var pos = safeties.map(function (_, j) { return Math.round((j + 1) * n / (safeties.length + 1)); });
    var out = [], si = 0;
    for (var k = 0; k <= n; k++) {
      while (si < safeties.length && pos[si] === k) { out.push({ kind: 'safety', member_id: safeties[si].id }); si++; }
      if (k < n) out.push({ kind: 'socio', member_id: mid[k].id });
    }
    res.push({ kind: 'road_captain', member_id: lead ? lead.id : null });
    out.forEach(function (x) { res.push(x); });
    res.push({ kind: 'scopa', member_id: scopa ? scopa.id : null });
    return res;
  };

  /* ---------- luoghi, giorni e distanze ---------- */
  L.KM_WARN = 500;
  L.ROAD_FACTOR = 1.25; /* stima: la strada è circa il 25% più lunga della linea d'aria */
  L.PLACE_KINDS = ['area', 'hotel', 'ristorante', 'hd', 'bar', 'agri', 'altro'];
  function num(v) { return v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v); }
  L.hasCoords = function (p) { return !!p && num(p.lat) !== null && num(p.lng) !== null; };
  L.haversine = function (a, b) {
    var R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  L.runDays = function (run) { var d = parseInt(run && run.days, 10); return d >= 1 && d <= 30 ? d : 1; };
  function textPlace(txt) { txt = String(txt == null ? '' : txt).trim(); return txt ? { name: '', addr: txt } : null; }
  L.endOf = function (run, day) {
    var e = null;
    ((run && run.stops) || []).forEach(function (s) { if (s && s.end && (parseInt(s.day, 10) || 1) === day) e = s; });
    return e;
  };
  /* luoghi di una giornata in ordine: partenza, tappe, arrivo (la partenza del giorno dopo è l'arrivo del giorno prima) */
  L.dayPlaces = function (run, day) {
    run = run || {};
    var days = L.runDays(run), all = day === undefined || day === null || days === 1;
    day = all ? 1 : day;
    var meet = run.meeting || textPlace(run.meeting_point), dest = run.dest || textPlace(run.destination), out = [];
    var start = day <= 1 ? meet : (L.endOf(run, day - 1) || meet);
    if (start) out.push(start);
    (run.stops || []).forEach(function (s) { if (s && !s.end && (all || (parseInt(s.day, 10) || 1) === day)) out.push(s); });
    var fin = day >= days ? dest : (L.endOf(run, day) || null);
    if (all && days === 1) fin = dest;
    if (fin) out.push(fin);
    return out;
  };
  function pointOf(p) {
    if (!p) return '';
    if (L.hasCoords(p)) return Number(p.lat).toFixed(6) + ',' + Number(p.lng).toFixed(6);
    return String(p.addr || '').trim();
  }
  /* navigazione: punti (testo o coordinate) del giorno, consecutivi uguali uniti */
  L.navPoints = function (run, day) {
    var pts = [], last = null;
    L.dayPlaces(run, day).forEach(function (p) {
      var v = pointOf(p);
      if (!v) return;
      var k = norm(v);
      if (k && k === last) return;
      last = k; pts.push(v);
    });
    return pts;
  };
  /* km stimati (linea d'aria x fattore) se tutti i luoghi del giorno hanno coordinate, altrimenti null */
  L.dayKm = function (run, day) {
    var pl = L.dayPlaces(run, day);
    if (pl.length < 2) return null;
    var km = 0, i;
    for (i = 0; i < pl.length; i++) if (!L.hasCoords(pl[i])) return null;
    for (i = 1; i < pl.length; i++) km += L.haversine({ lat: +pl[i - 1].lat, lng: +pl[i - 1].lng }, { lat: +pl[i].lat, lng: +pl[i].lng });
    return Math.round(km * L.ROAD_FACTOR);
  };
  L.kmWarn = function (km) { return km !== null && km !== undefined && km >= L.KM_WARN; };
  L.osrmUrl = function (places) {
    var c = places.filter(L.hasCoords);
    if (c.length < 2 || c.length !== places.length) return null;
    return 'https://router.project-osrm.org/route/v1/driving/' + c.map(function (p) { return Number(p.lng).toFixed(6) + ',' + Number(p.lat).toFixed(6); }).join(';') + '?overview=false';
  };
  L.parseOsrm = function (j) {
    if (!j || j.code !== 'Ok' || !j.routes || !j.routes[0] || typeof j.routes[0].distance !== 'number') return null;
    return Math.round(j.routes[0].distance / 1000);
  };

  /* minuti di guida per ogni tratto (durate di percorso OSRM); null se mancano */
  L.parseOsrmLegs = function (j) {
    if (!j || j.code !== 'Ok' || !j.routes || !j.routes[0] || !j.routes[0].legs) return null;
    var out = j.routes[0].legs.map(function (l) { return typeof l.duration === 'number' ? Math.max(1, Math.round(l.duration / 60)) : null; });
    return out.length && out.every(function (x) { return x !== null; }) ? out : null;
  };
  /* assegna a ogni luogo di una giornata i minuti dalla partenza (guida + sosta a ogni tappa intermedia) */
  L.applyTimes = function (places, legs, day) {
    var t = 0, i;
    if (!legs || legs.length !== places.length - 1) return false;
    if (!day || day === 1) places[0].tm = 0;
    for (i = 1; i < places.length; i++) {
      t += legs[i - 1] + (i > 1 ? L.WX_DWELL : 0);
      places[i].tm = t;
    }
    return true;
  };

  /* ---------- ricerca luoghi (OpenStreetMap) ---------- */
  var SEL = {
    area: ['nwr["highway"="services"]', 'nwr["highway"="rest_area"]'],
    hotel: ['nwr["tourism"~"^(hotel|motel|hostel|guest_house)$"]["name"]'],
    ristorante: ['nwr["amenity"="restaurant"]["name"]'],
    hd: ['nwr["shop"="motorcycle"]["name"~"harley",i]', 'nwr["shop"="motorcycle"]["brand"~"harley",i]'],
    bar: ['nwr["amenity"~"^(cafe|bar|pub)$"]["name"]'],
    agri: ['nwr["agritourism"="yes"]["name"]', 'nwr["tourism"="chalet"]["name"]']
  };
  L.overpassQuery = function (kind, lat, lng, radiusM) {
    var sel = SEL[kind];
    if (!sel || num(lat) === null || num(lng) === null) return null;
    var r = Math.max(1000, Math.min(100000, Math.round(radiusM || 15000))), at = '(around:' + r + ',' + Number(lat).toFixed(5) + ',' + Number(lng).toFixed(5) + ');';
    return '[out:json][timeout:25];(' + sel.map(function (s) { return s + at; }).join('') + ');out center tags 120;';
  };
  function addrOf(t) {
    var street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), city = t['addr:city'] || t['addr:suburb'] || '';
    var a = [street, city].filter(Boolean).join(', ');
    return a || t['addr:full'] || '';
  }
  L.parseOverpass = function (j, kind, lat, lng) {
    var seen = {}, out = [];
    ((j && j.elements) || []).forEach(function (e) {
      var t = e.tags || {}, la = num(e.lat !== undefined ? e.lat : e.center && e.center.lat), lo = num(e.lon !== undefined ? e.lon : e.center && e.center.lon);
      if (la === null || lo === null) return;
      var name = String(t.name || t.brand || t.operator || '').trim();
      if (!name && kind !== 'area') return;
      var key = name.toLowerCase() + '|' + la.toFixed(3) + '|' + lo.toFixed(3);
      if (seen[key]) return; seen[key] = 1;
      var extra = kind === 'area' ? [t.operator && t.operator !== name ? t.operator : '', t.ref, t.highway === 'rest_area' ? 'rest area' : ''].filter(Boolean).join(' · ') : '';
      out.push({ name: name, addr: addrOf(t) || extra, info: addrOf(t) ? extra : '', lat: +la.toFixed(6), lng: +lo.toFixed(6), kind: kind,
        dist: num(lat) !== null && num(lng) !== null ? Math.round(L.haversine({ lat: +lat, lng: +lng }, { lat: la, lng: lo }) * 10) / 10 : null });
    });
    out.sort(function (a, b) { return (a.dist === null ? 1e9 : a.dist) - (b.dist === null ? 1e9 : b.dist); });
    return out.slice(0, 80);
  };
  function nomAddr(it) {
    var a = it.address || {}, street = [a.road || a.pedestrian || a.footway, a.house_number].filter(Boolean).join(' '),
      city = a.city || a.town || a.village || a.municipality || a.county || '';
    var s = [street, city].filter(Boolean).join(', ');
    return s || String(it.display_name || '').split(',').slice(0, 3).join(',').trim();
  }
  L.parseNominatim = function (arr) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (it) {
      var la = num(it.lat), lo = num(it.lon);
      if (la === null || lo === null) return;
      out.push({ name: String(it.name || '').trim(), addr: nomAddr(it), lat: +la.toFixed(6), lng: +lo.toFixed(6) });
    });
    return out;
  };
  L.parseReverse = function (it, lat, lng) {
    if (!it || it.error) return { name: '', addr: '', lat: +Number(lat).toFixed(6), lng: +Number(lng).toFixed(6) };
    return { name: String(it.name || '').trim(), addr: nomAddr(it), lat: +Number(lat).toFixed(6), lng: +Number(lng).toFixed(6) };
  };
  L.parseZones = function (j) {
    var seen = {}, out = [];
    ((j && j.elements) || []).forEach(function (e) {
      var t = e.tags || {}, n = String(t.name || '').trim(), la = num(e.lat !== undefined ? e.lat : e.center && e.center.lat), lo = num(e.lon !== undefined ? e.lon : e.center && e.center.lon);
      if (!n || la === null || lo === null || seen[n.toLowerCase()]) return;
      seen[n.toLowerCase()] = 1; out.push({ name: n, lat: +la.toFixed(5), lng: +lo.toFixed(5) });
    });
    out.sort(function (a, b) { return a.name.localeCompare(b.name, 'it'); });
    return out;
  };
  L.zonesQuery = function (lat, lng) {
    return '[out:json][timeout:25];nwr["place"~"^(suburb|quarter)$"]["name"](around:12000,' + Number(lat).toFixed(5) + ',' + Number(lng).toFixed(5) + ');out center tags 120;';
  };
  /* punti di partenza predefiniti */
  L.FUNGO = { name: "Fungo dell'EUR", addr: 'Piazza Pakistan 1, Roma', kind: 'area', lat: 41.824428, lng: 12.462984 };
  /* concessionaria di riferimento del Chapter (coordinate dalla scheda Google Maps) */
  L.HD_STORE = { name: 'H-D Store Roma', addr: 'Via Pontina 583, 00128 Roma', kind: 'hd', lat: 41.7799579, lng: 12.4466032 };
  L.CITIES = [
    { name: 'Roma', lat: 41.9028, lng: 12.4964 }, { name: 'Milano', lat: 45.4642, lng: 9.19 }, { name: 'Napoli', lat: 40.8518, lng: 14.2681 },
    { name: 'Firenze', lat: 43.7696, lng: 11.2558 }, { name: 'Bologna', lat: 44.4949, lng: 11.3426 }, { name: 'Torino', lat: 45.0703, lng: 7.6869 }
  ];
  L.ROME_ZONES = [
    { name: 'EUR', lat: 41.8336, lng: 12.4708 }, { name: 'Centro storico', lat: 41.8986, lng: 12.4768 }, { name: 'Prati / Vaticano', lat: 41.9067, lng: 12.4604 },
    { name: 'Trastevere', lat: 41.8896, lng: 12.4697 }, { name: 'San Giovanni / Appio', lat: 41.8858, lng: 12.5071 }, { name: 'Ostiense / Garbatella', lat: 41.8582, lng: 12.4871 },
    { name: 'Magliana', lat: 41.84, lng: 12.435 }, { name: 'Aurelio', lat: 41.898, lng: 12.435 }, { name: 'Flaminio / Parioli', lat: 41.927, lng: 12.477 },
    { name: 'Salario / Trieste', lat: 41.918, lng: 12.52 }, { name: 'Nomentano', lat: 41.92, lng: 12.53 }, { name: 'Tiburtino', lat: 41.91, lng: 12.543 },
    { name: 'Prenestino', lat: 41.89, lng: 12.545 }, { name: 'Casilino / Torre Spaccata', lat: 41.87, lng: 12.58 }, { name: 'Tuscolano / Cinecittà', lat: 41.868, lng: 12.526 },
    { name: 'Laurentino / Laurentina', lat: 41.79, lng: 12.475 }, { name: 'Monte Mario / Cassia', lat: 41.934, lng: 12.45 }, { name: 'Ostia', lat: 41.73, lng: 12.283 }
  ];

  /* mappa Google del luogo dentro l'app (incorporamento senza chiave) e query per aprirlo in Google Maps: coordinate se presenti, altrimenti testo */
  L.placeQuery = function (p, txt) {
    if (L.hasCoords(p)) return (+p.lat).toFixed(6) + ',' + (+p.lng).toFixed(6);
    var q = p ? [p.name, p.addr].filter(Boolean).join(', ') : '';
    return (q || String(txt == null ? '' : txt)).trim().slice(0, 300);
  };
  L.mapEmbedUrl = function (p, txt, lang) {
    var q = L.placeQuery(p, txt);
    return q ? 'https://maps.google.com/maps?q=' + encodeURIComponent(q) + '&z=15&hl=' + (lang || 'it') + '&output=embed' : null;
  };

  /* navigatore: solo Google Maps. Oltre 9 tappe intermedie il percorso si divide in tratte consecutive (ogni tratta riparte dall'arrivo della precedente) */
  L.NAV_MAX_WAYPOINTS = 9;
  L.navTool = function (v) { return v === 'none' ? 'none' : 'google'; };
  L.googleNav = function (pts) {
    if (!pts || !pts.length) return [];
    var e = encodeURIComponent, base = 'https://www.google.com/maps/dir/?api=1&travelmode=driving', step = L.NAV_MAX_WAYPOINTS + 1, out = [], i, seg;
    if (pts.length === 1) return [base + '&destination=' + e(pts[0])];
    for (i = 0; i < pts.length - 1; i += step) {
      seg = pts.slice(i, Math.min(i + step + 1, pts.length));
      out.push(base + '&origin=' + e(seg[0]) + '&destination=' + e(seg[seg.length - 1]) + (seg.length > 2 ? '&waypoints=' + seg.slice(1, -1).map(e).join('%7C') : ''));
    }
    return out;
  };

  /* ---------- meteo per motociclisti ---------- */
  L.WX_SPEED = 65;   /* km/h medi di marcia */
  L.WX_DWELL = 20;   /* minuti di sosta a ogni tappa intermedia */
  L.WX_STALE_H = 3;  /* oltre queste ore l'ultimo dato è "vecchio" */
  var WX_FMT = null;
  /* "2026-11-10T09:00" nell'ora di Roma, arrotondato all'ora più vicina */
  L.romeKey = function (ms) {
    if (!WX_FMT) WX_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
    var p = {}; WX_FMT.formatToParts(new Date(Math.round(ms / 3600000) * 3600000)).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':00';
  };
  /* codice WMO -> categoria */
  L.wxKind = function (c) {
    if (c === null || c === undefined || c === '') return 'unknown';
    c = Number(c);
    if (isNaN(c)) return 'unknown';
    if (c === 0 || c === 1) return 'clear';
    if (c === 2 || c === 3) return 'cloud';
    if (c === 45 || c === 48) return 'fog';
    if (c === 56 || c === 57 || c === 66 || c === 67) return 'freezing';
    if (c >= 51 && c <= 55) return 'drizzle';
    if ((c >= 61 && c <= 65) || (c >= 80 && c <= 82)) return 'rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    if (c >= 95 && c <= 99) return 'thunder';
    return 'unknown';
  };
  /* icona del meteo: di notte il sereno è la luna e il poco nuvoloso una nuvola */
  L.wxIconFor = function (kind, dark) { return dark && kind === 'clear' ? '🌙' : dark && kind === 'cloud' ? '☁️' : L.WX_ICON[kind] || L.WX_ICON.unknown; };
  L.WX_ICON = { clear: '☀️', cloud: '⛅', fog: '🌫️', freezing: '🧊', drizzle: '🌦️', rain: '🌧️', snow: '❄️', thunder: '⛈️', unknown: '·' };
  function at(a, i) { return a && a[i] !== undefined && a[i] !== null ? Number(a[i]) : null; }
  /* dati orari di un punto per l'ora indicata (ms) */
  L.wxHour = function (point, ms) {
    var h = point && point.hourly, k = L.romeKey(ms), i;
    if (!h || !h.time) return null;
    i = h.time.indexOf(k);
    if (i < 0) return null;
    return { t: k, temp: at(h.temperature_2m, i), feels: at(h.apparent_temperature, i), pop: at(h.precipitation_probability, i), precip: at(h.precipitation, i),
      code: at(h.weather_code, i), wind: at(h.wind_speed_10m, i), gust: at(h.wind_gusts_10m, i), vis: at(h.visibility, i), uv: at(h.uv_index, i) };
  };
  /* rischio per chi va in moto: level 0 ok, 1 attenzione, 2 critico */
  L.wxFlags = function (r) {
    var f = [], lv = 0;
    function add(k, l) { f.push(k); if (l > lv) lv = l; }
    if (!r) return { level: 0, flags: [] };
    var kind = L.wxKind(r.code);
    if (kind === 'thunder') add('thunder', 2);
    if (kind === 'snow') add('snow', 2);
    if (r.temp !== null && r.temp <= 3 && ((r.precip || 0) > 0 || kind === 'freezing' || kind === 'snow' || kind === 'fog')) add('ice', 2);
    else if (kind === 'freezing') add('ice', 2);
    if (r.vis !== null && r.vis < 500) add('fog', 2); else if (r.vis !== null && r.vis < 2000) add('lowvis', 1);
    if (r.gust !== null && r.gust >= 60) add('gust', 2); else if (r.gust !== null && r.gust >= 45) add('gust', 1);
    if (r.wind !== null && r.wind >= 45) add('wind', 2); else if (r.wind !== null && r.wind >= 30) add('wind', 1);
    if (r.precip !== null && r.precip >= 4) add('heavy', 2);
    else if ((r.pop !== null && r.pop >= 50) || (r.precip !== null && r.precip >= 0.3)) add('rain', 1);
    if (r.temp !== null && r.temp <= 5 && f.indexOf('ice') < 0) add('cold', 1);
    if (r.temp !== null && r.temp >= 38) add('heat', 2); else if (r.temp !== null && r.temp >= 33) add('heat', 1);
    return { level: lv, flags: f };
  };
  /* orari di arrivo ai punti: partenza all'ora del Run; tempi di percorso del navigatore (tm) se salvati, altrimenti stima a 65 km/h; 20 min a ogni tappa; ogni giorno riparte dall'ora del Run */
  L.wxEtas = function (run, W) {
    var pts = (W && W.points) || [], start = new Date(run.run_date).getTime(), out = [], day = 1, t = start, prev = null, i;
    for (i = 0; i < pts.length; i++) {
      var p = pts[i], d = parseInt(p.day, 10) || 1;
      if (d > day) { day = d; t = start + (d - 1) * 86400000; prev = null; }
      if (typeof p.tm === 'number' && p.tm >= 0) t = start + (d - 1) * 86400000 + p.tm * 60000;
      else if (prev && L.hasCoords(prev) && L.hasCoords(p)) t += L.haversine({ lat: +prev.lat, lng: +prev.lng }, { lat: +p.lat, lng: +p.lng }) * L.ROAD_FACTOR / L.WX_SPEED * 3600000;
      else if (!L.hasCoords(p) && p.role === 'dest') t = start + (L.runDays(run) - 1) * 86400000 + (run.km ? run.km / L.WX_SPEED : 3) * 3600000;
      out.push({ p: p, eta: t });
      if (p.role === 'stop') t += L.WX_DWELL * 60000;
      prev = p;
    }
    return out;
  };
  /* sintesi del meteo lungo il percorso (W = ultimo salvataggio) */
  L.wxSummary = function (run, W, nowMs) {
    nowMs = nowMs || Date.now();
    if (!W || !W.points || !W.points.length) return null;
    var etas = L.wxEtas(run, W), pts = [], level = 0, firstRain = null, alerts = [], dark = null;
    etas.forEach(function (e) {
      var rec = L.wxHour(e.p, e.eta), fl = L.wxFlags(rec), day = L.romeKey(e.eta).slice(0, 10), dly = e.p.daily, di = dly && dly.time ? dly.time.indexOf(day) : -1;
      var rise = di >= 0 ? dly.sunrise[di] : null, set = di >= 0 ? dly.sunset[di] : null, hh = L.romeKey(e.eta).slice(11, 16), isDark = !!(rec && rise && set && (hh < rise.slice(11, 16) || hh > set.slice(11, 16)));
      var o = { label: e.p.label || '', role: e.p.role, day: e.p.day, eta: e.eta, rec: rec, flags: fl.flags, level: fl.level, dark: isDark, sunset: set ? set.slice(11, 16) : null };
      pts.push(o);
      if (fl.level > level) level = fl.level;
      if (!firstRain && fl.flags.some(function (x) { return x === 'rain' || x === 'heavy' || x === 'thunder'; })) firstRain = o;
      if (fl.level === 2) alerts.push({ level: 2, flags: fl.flags, label: o.label, eta: o.eta });
      if (isDark && !dark && (e.p.role === 'dest' || e.p.role === 'end')) dark = o;
    });
    var ageH = W.fetched_at ? Math.max(0, (nowMs - new Date(W.fetched_at).getTime()) / 3600000) : null;
    return { level: level, pts: pts, firstRain: firstRain, alerts: alerts, dark: dark, fetched_at: W.fetched_at, ageH: ageH, stale: ageH === null || ageH > L.WX_STALE_H, covered: pts.some(function (p) { return !!p.rec; }) };
  };
  /* Run da monitorare: dal giorno del Run fino a fine giornata (o ultimo giorno); serve per mostrare gli avvisi */
  L.wxWindow = function (run, nowMs) {
    var s = new Date(run.run_date).getTime(), e = s + (L.runDays(run) - 1) * 86400000 + 14 * 3600000;
    return { before: nowMs < s, during: nowMs >= s && nowMs <= e, after: nowMs > e, startMs: s, endMs: e, daysTo: (s - nowMs) / 86400000 };
  };


  /* ---------- meteo di un luogo qualsiasi (Open-Meteo, dal telefono) ---------- */
  L.omUrl = function (lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(3) + '&longitude=' + lng.toFixed(3)
      + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,visibility,uv_index'
      + '&daily=sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max'
      + '&timezone=Europe%2FRome&wind_speed_unit=kmh&forecast_days=7';
  };
  L.parseOm = function (j) {
    if (!j || !j.hourly || !j.hourly.time || !j.hourly.time.length || !j.daily || !j.daily.time) return null;
    return { hourly: j.hourly, daily: j.daily };
  };
  /* prossime n ore a partire dall'ora corrente */
  L.wxNext = function (pt, nowMs, n) {
    var out = [], base = Math.floor(nowMs / 3600000) * 3600000, i, rec, fl;
    for (i = 0; i < n; i++) {
      rec = L.wxHour(pt, base + i * 3600000);
      if (!rec) continue;
      fl = L.wxFlags(rec);
      out.push({ ms: base + i * 3600000, rec: rec, level: fl.level, flags: fl.flags });
    }
    return out;
  };
  L.wxDays = function (pt) {
    var d = pt && pt.daily, out = [], i;
    if (!d || !d.time) return out;
    for (i = 0; i < d.time.length; i++) out.push({ date: d.time[i], code: at(d.weather_code, i), max: at(d.temperature_2m_max, i), min: at(d.temperature_2m_min, i), pop: at(d.precipitation_probability_max, i), precip: at(d.precipitation_sum, i), gust: at(d.wind_gusts_10m_max, i), sunrise: d.sunrise ? d.sunrise[i] : null, sunset: d.sunset ? d.sunset[i] : null });
    return out;
  };
  /* ---- scena meteo animata e consigli per la moto ---- */
  L.wxIsNight = function (pt, ms) {
    var d = pt && pt.daily, k = L.romeKey(ms), i = d && d.time ? d.time.indexOf(k.slice(0, 10)) : -1;
    if (i < 0 || !d.sunrise || !d.sunset || !d.sunrise[i] || !d.sunset[i]) return false;
    var hh = k.slice(11, 16); return hh < String(d.sunrise[i]).slice(11, 16) || hh > String(d.sunset[i]).slice(11, 16);
  };
  /* livelli: rain/wind 0-3, sun 0 nessuno, 1 sereno, 2 sole forte, 3 sole molto forte; sky = tema dello sfondo */
  L.wxScene = function (rec, night) {
    if (!rec) return { sky: 'cloud', night: !!night, storm: false, snow: false, rain: 0, wind: 0, sun: 0, cloud: 1, fog: false };
    var kind = L.wxKind(rec.code), storm = kind === 'thunder', snow = kind === 'snow', rain = 0, wind = 0, sun = 0, cloud = 0, fog = kind === 'fog' || (rec.vis !== null && rec.vis < 2000);
    var p = rec.precip || 0, w = rec.wind || 0, g = rec.gust || 0;
    if (storm || kind === 'rain' || kind === 'drizzle' || kind === 'freezing' || p >= 0.3) rain = p >= 4 ? 3 : p >= 1 ? 2 : 1;
    if (storm) rain = Math.max(rain, 2);
    if (snow) rain = 0;
    wind = (w >= 45 || g >= 60) ? 3 : (w >= 30 || g >= 45) ? 2 : (w >= 20 || g >= 35) ? 1 : 0;
    var clear = (kind === 'clear' || (kind === 'unknown' && !rain)) && !snow && !storm && !fog && !rain;
    if (clear && !night) { var hot = rec.temp !== null ? rec.temp : 0, uv = rec.uv !== null && rec.uv !== undefined ? rec.uv : 0; sun = (uv >= 8 || hot >= 35) ? 3 : (uv >= 6 || hot >= 30) ? 2 : 1; }
    cloud = storm || rain ? 3 : kind === 'cloud' ? (rec.code === 3 ? 2 : 1) : snow ? 2 : 0;
    var sky = storm ? 'storm' : snow ? 'snow' : rain ? 'rain' : fog ? 'fog' : wind >= 2 ? 'wind' : night ? 'night' : sun >= 2 ? 'sun' : clear ? 'clear' : 'cloud';
    return { sky: sky, night: !!night, storm: storm, snow: snow, rain: rain, wind: wind, sun: sun, cloud: cloud, fog: fog };
  };
  var TIP_OF = { thunder: 'thunder', heavy: 'heavy', rain: 'rain', gust: 'gust', wind: 'wind', ice: 'ice', snow: 'snow', fog: 'fog', lowvis: 'fog', cold: 'cold', heat: 'heat' };
  /* verdetto per la moto sulle prossime ore: livello, finestra migliore, consigli ordinati per gravità, abbigliamento */
  L.wxRide = function (next, pt) {
    var first = next.slice(0, 6), level = first.reduce(function (m, x) { return Math.max(m, x.level); }, 0), tips = {}, best = null, run = null, i, order = [];
    first.forEach(function (x) { x.flags.forEach(function (f) { var k = TIP_OF[f]; if (!k) return; var lv = f === 'thunder' || f === 'ice' || f === 'snow' || f === 'heavy' ? 2 : x.level; if (!(k in tips) || lv > tips[k]) tips[k] = lv; }); });
    if (first.some(function (x) { return L.wxScene(x.rec, pt ? L.wxIsNight(pt, x.ms) : false).sun >= 2; })) tips.sun = 1;
    Object.keys(tips).forEach(function (k) { order.push(k); });
    order.sort(function (a, b) { return tips[b] - tips[a]; });
    for (i = 0; i < next.length; i++) {
      var calm = next[i].level === 0 && !(pt && L.wxIsNight(pt, next[i].ms));
      if (calm && run && next[i].ms - run.to === 3600000) run.to = next[i].ms;
      else if (calm) run = { from: next[i].ms, to: next[i].ms };
      else run = null;
      if (run && (!best || run.to - run.from > best.to - best.from)) best = { from: run.from, to: run.to };
    }
    var c = next[0] && next[0].rec, tmp = c ? (c.feels !== null ? c.feels : c.temp) : null;
    var dress = tmp === null ? null : tmp < 5 ? 1 : tmp < 12 ? 2 : tmp < 20 ? 3 : tmp < 28 ? 4 : 5;
    return { level: level, tips: order.slice(0, 4), best: best, dress: dress };
  };

  /* luoghi salvati: massimo 12, senza doppioni (stessa posizione entro ~1 km) */
  L.addPlace = function (list, p) {
    list = (list || []).filter(function (x) { return !(Math.abs(x.lat - p.lat) < 0.01 && Math.abs(x.lng - p.lng) < 0.01); });
    list.unshift({ n: String(p.n || '').slice(0, 80), lat: +p.lat, lng: +p.lng });
    return list.slice(0, 12);
  };

  /* ---------- dashboard e report ---------- */
  var R = L.report = {};
  R.DATASETS = {
    run: [
      { k: 'date', ty: 'date' }, { k: 'title', ty: 'text' }, { k: 'status', ty: 'text' }, { k: 'days', ty: 'num' }, { k: 'km', ty: 'num' }, { k: 'difficulty', ty: 'text' },
      { k: 'meeting', ty: 'text' }, { k: 'destination', ty: 'text' }, { k: 'riders', ty: 'num' }, { k: 'passengers', ty: 'num' }, { k: 'total', ty: 'num' },
      { k: 'checked', ty: 'num' }, { k: 'max', ty: 'num' }, { k: 'fill', ty: 'num' }, { k: 'wx', ty: 'text' },
      { k: 'fee', ty: 'num' }],
    socio: [
      { k: 'last_name', ty: 'text' }, { k: 'first_name', ty: 'text' }, { k: 'title', ty: 'text' }, { k: 'active', ty: 'text' }, { k: 'bike', ty: 'text' }, { k: 'joined_on', ty: 'date' },
      { k: 'phone', ty: 'text', perm: 'phones_view' }, { k: 'email', ty: 'text', perm: 'personal_view' }, { k: 'tessera', ty: 'text', perm: 'personal_view' },
      { k: 'attended', ty: 'num' }, { k: 'signed', ty: 'num' }],
    presenza: [
      { k: 'date', ty: 'date' }, { k: 'run', ty: 'text' }, { k: 'member', ty: 'text' }, { k: 'answer', ty: 'text' }, { k: 'passengers', ty: 'num' }, { k: 'checked', ty: 'text' }]
  };
  R.DS_PERM = { run: null, socio: 'members_view', presenza: 'members_view' };
  R.cols = function (ds, perms) {
    return (R.DATASETS[ds] || []).filter(function (c) { return !c.perm || (perms || []).indexOf(c.perm) >= 0; });
  };
  function yearOf(s) { var m = /^(\d{4})/.exec(String(s || '')); return m ? +m[1] : null; }
  function dstr(iso) { return iso ? String(iso).slice(0, 10) : ''; }
  R.runYear = function (r) { return new Date(r.run_date).getFullYear(); };
  /* righe del dataset dopo i filtri; ctx: {runs, signups, members, weather, titleName} */
  R.rows = function (ctx, def) {
    var f = def.filters || {}, y = f.year ? +f.year : null, rows = [], runs = ctx.runs || [], su = ctx.signups || [], byRun = {}, mem = {}, name = function (m) { return m ? (m.last_name + ' ' + m.first_name).trim() : '—'; };
    (ctx.members || []).forEach(function (m) { mem[m.id] = m; });
    su.forEach(function (s) { (byRun[s.run_id] = byRun[s.run_id] || []).push(s); });
    var tn = ctx.titleName || function (k) { return k; };
    if (def.ds === 'run') {
      runs.forEach(function (r) {
        if (y && R.runYear(r) !== y) return;
        if (f.status && r.status !== f.status) return;
        var c = L.counts(byRun[r.id] || []), W = ctx.weather && ctx.weather[r.id], sm = W ? L.wxSummary(r, W, ctx.now) : null;
        rows.push({ date: dstr(r.run_date), title: r.title, status: r.status, days: L.runDays(r), km: r.km == null ? null : +r.km, difficulty: r.difficulty, meeting: r.meeting_point || '', destination: r.destination || '',
          riders: c.riders, passengers: c.pass, total: c.total, checked: c.checked, max: r.max_participants == null ? null : +r.max_participants,
          fill: r.max_participants ? Math.round(c.total * 100 / r.max_participants) : null, wx: sm && sm.covered ? ['ok', 'warn', 'crit'][sm.level] : '',
          fee: L.runFee(r) || null });
      });
    } else if (def.ds === 'socio') {
      var yrs = {}; runs.forEach(function (r) { yrs[r.id] = R.runYear(r); });
      (ctx.members || []).forEach(function (m) {
        if (f.active === 'yes' && !m.active) return; if (f.active === 'no' && m.active) return;
        if (f.role && m.title !== f.role) return;
        var att = 0, sig = 0;
        su.forEach(function (s) { if (s.member_id !== m.id || (y && yrs[s.run_id] !== y)) return; if (s.status === 'si') sig++; if (s.checked_in) att++; });
        rows.push({ last_name: m.last_name, first_name: m.first_name, title: tn(m.title), active: m.active ? 'yes' : 'no', bike: m.bike || '', joined_on: dstr(m.joined_on), phone: m.phone || '', email: m.email || '', tessera: m.tessera || '', attended: att, signed: sig });
      });
    } else if (def.ds === 'presenza') {
      var rm = {}; runs.forEach(function (r) { rm[r.id] = r; });
      su.forEach(function (s) {
        var r = rm[s.run_id]; if (!r || (y && R.runYear(r) !== y)) return;
        if (f.status && r.status !== f.status) return;
        rows.push({ date: dstr(r.run_date), run: r.title, member: name(mem[s.member_id]), answer: s.status, passengers: s.passengers || 0, checked: s.checked_in ? 'yes' : 'no' });
      });
    }
    var sk = def.sort && def.sort.key, dir = def.sort && def.sort.dir === 'desc' ? -1 : 1;
    if (sk) rows.sort(function (a, b) {
      var x = a[sk], z = b[sk];
      if (x === null || x === undefined || x === '') return 1; if (z === null || z === undefined || z === '') return -1;
      return (typeof x === 'number' && typeof z === 'number' ? x - z : String(x).localeCompare(String(z), 'it')) * dir;
    });
    return rows;
  };
  R.totals = function (ds, cols, rows) {
    var o = {}, defs = {};
    (R.DATASETS[ds] || []).forEach(function (c) { defs[c.k] = c; });
    cols.forEach(function (k) {
      if (!defs[k] || defs[k].ty !== 'num' || k === 'year' || k === 'days' || k === 'fill' || k === 'max') return;
      o[k] = rows.reduce(function (a, r) { return a + (typeof r[k] === 'number' ? r[k] : 0); }, 0);
    });
    return o;
  };
  /* controllo di un report personalizzato (da DB o dal modulo) */
  R.cleanDef = function (d) {
    d = d || {};
    if (!R.DATASETS[d.ds]) return null;
    var ok = R.DATASETS[d.ds].map(function (c) { return c.k; }), cols = (d.cols || []).filter(function (k, i, a) { return ok.indexOf(k) >= 0 && a.indexOf(k) === i; });
    if (!cols.length) return null;
    var f = d.filters || {}, out = { ds: d.ds, cols: cols, filters: {}, sort: null };
    if (f.year && /^\d{4}$/.test(String(f.year))) out.filters.year = String(f.year);
    ['status', 'role', 'active'].forEach(function (k) { if (f[k]) out.filters[k] = String(f[k]).slice(0, 40); });
    if (d.sort && ok.indexOf(d.sort.key) >= 0) out.sort = { key: d.sort.key, dir: d.sort.dir === 'desc' ? 'desc' : 'asc' };
    return out;
  };
  /* report standard (si possono modificare e salvare come propri) */
  R.STANDARD = [
    { id: 'runs', def: { ds: 'run', cols: ['date', 'title', 'status', 'days', 'km', 'total', 'checked', 'fill'], filters: {}, sort: { key: 'date', dir: 'desc' } }, yearly: true },
    { id: 'presenze', def: { ds: 'socio', cols: ['last_name', 'first_name', 'title', 'attended', 'signed'], filters: { active: 'yes' }, sort: { key: 'attended', dir: 'desc' } }, yearly: true },
    { id: 'soci', def: { ds: 'socio', cols: ['last_name', 'first_name', 'title', 'joined_on', 'bike', 'active'], filters: { active: 'yes' }, sort: { key: 'last_name', dir: 'asc' } } },
    { id: 'meteo', def: { ds: 'run', cols: ['date', 'title', 'status', 'meeting', 'destination', 'wx'], filters: {}, sort: { key: 'date', dir: 'desc' } }, yearly: true }
  ];
  /* numeri della dashboard */
  R.dashboard = function (ctx, nowMs) {
    nowMs = nowMs || Date.now();
    var year = new Date(nowMs).getFullYear(), runs = (ctx.runs || []).slice().sort(function (a, b) { return new Date(a.run_date) - new Date(b.run_date); }), su = ctx.signups || [], byRun = {};
    su.forEach(function (s) { (byRun[s.run_id] = byRun[s.run_id] || []).push(s); });
    function tot(r) { return L.counts(byRun[r.id] || []); }
    var done = runs.filter(function (r) { return r.status !== 'annullato' && new Date(r.run_date).getTime() < nowMs; }), doneY = done.filter(function (r) { return R.runYear(r) === year; });
    var next = runs.filter(function (r) { return r.status === 'programmato' && new Date(r.run_date).getTime() >= nowMs - 6 * 3600000; })[0] || null;
    var sumP = 0, nP = 0; doneY.forEach(function (r) { var c = tot(r); if (c.total) { sumP += c.total; nP++; } });
    var att = {}; su.forEach(function (s) { if (s.checked_in || s.status === 'si') { var r = runs.filter(function (x) { return x.id === s.run_id; })[0]; if (r && R.runYear(r) === year && new Date(r.run_date).getTime() < nowMs) { att[s.member_id] = att[s.member_id] || { n: 0 }; att[s.member_id].n += s.checked_in ? 2 : 1; } } });
    var top = Object.keys(att).map(function (id) { return { id: id, n: att[id].n }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    var act = (ctx.members || []).filter(function (m) { return m.active; }).length;
    return {
      year: year, members: act, runs: doneY.length, km: doneY.reduce(function (a, r) { return a + (+r.km || 0); }, 0), avg: nP ? Math.round(sumP / nP * 10) / 10 : 0, next: next,
      series: done.slice(-8).map(function (r) { return { id: r.id, label: r.title, date: String(r.run_date).slice(0, 10), value: tot(r).total }; }),
      top: top, cancelled: runs.filter(function (r) { return r.status === 'annullato' && R.runYear(r) === year; }).length
    };
  };
  L.yearsOf = function (runs) { var o = {}; (runs || []).forEach(function (r) { o[new Date(r.run_date).getFullYear()] = 1; }); o[new Date().getFullYear()] = 1; return Object.keys(o).map(Number).sort(function (a, b) { return b - a; }); };

  /* ---------- secondo livello: import Run da Excel, calendario, GPX, tessera QR, statistiche ---------- */
  function nrm(x) { return String(x == null ? '' : x).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); }
  L.normName = nrm;
  /* data da cella Excel: numero seriale, testo gg/mm/aaaa o aaaa-mm-gg (+ ora facoltativa) -> Date locale oppure null */
  L.parseDateCell = function (d, tm) {
    var y, m, day, hh = 9, mi = 0, mt;
    if (typeof d === 'number' && isFinite(d)) {
      var ms = Math.round((d - 25569) * 86400) * 1000, u = new Date(ms); y = u.getUTCFullYear(); m = u.getUTCMonth() + 1; day = u.getUTCDate();
      var fr = d - Math.floor(d); if (fr > 0) { var tot = Math.round(fr * 1440); hh = Math.floor(tot / 60); mi = tot % 60; }
    } else {
      var s = String(d == null ? '' : d).trim();
      if ((mt = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/))) { day = +mt[1]; m = +mt[2]; y = +mt[3]; if (mt[4] != null) { hh = +mt[4]; mi = +mt[5]; } }
      else if ((mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/))) { y = +mt[1]; m = +mt[2]; day = +mt[3]; if (mt[4] != null) { hh = +mt[4]; mi = +mt[5]; } }
      else return null;
    }
    if (tm !== undefined && tm !== null && tm !== '') {
      if (typeof tm === 'number' && tm >= 0 && tm < 1) { var t2 = Math.round(tm * 1440); hh = Math.floor(t2 / 60); mi = t2 % 60; }
      else { var q = String(tm).trim().match(/^(\d{1,2})[:.](\d{2})/); if (q) { hh = +q[1]; mi = +q[2]; } else return null; }
    }
    if (m < 1 || m > 12 || day < 1 || day > 31 || hh > 23 || mi > 59 || y < 2000 || y > 2100) return null;
    var dt = new Date(y, m - 1, day, hh, mi, 0, 0);
    return dt.getMonth() === m - 1 && dt.getDate() === day ? dt : null;
  };
  var RUN_COLS = { titolo: 'title', title: 'title', data: 'date', date: 'date', ora: 'time', time: 'time', giorni: 'days', days: 'days', ritrovo: 'meeting', destinazione: 'dest', km: 'km', difficolta: 'diff', quota: 'fee', descrizione: 'desc', stato: 'status' };
  var DIFFS = { facile: 'facile', easy: 'facile', media: 'media', medium: 'media', impegnativa: 'impegnativa', hard: 'impegnativa', difficile: 'impegnativa' };
  /* righe del foglio "Run" (+ foglio facoltativo "Presenze") -> elenco controllato. existing = Run già presenti, members = soci */
  L.parseRunRows = function (rows, attRows, existing, members, now) {
    var out = { items: [], att: [], attErrors: [], total: 0 };
    if (!rows || !rows.length) return out;
    var head = rows[0].map(function (h) { return RUN_COLS[nrm(h)] || null; }), seen = {}, ex = {};
    (existing || []).forEach(function (r) { ex[nrm(r.title) + '|' + String(r.run_date).slice(0, 10)] = 1; });
    now = now || Date.now();
    rows.slice(1).forEach(function (row, i) {
      var o = {}; head.forEach(function (k, c) { if (k) o[k] = row[c]; });
      if (!Object.keys(o).some(function (k) { return String(o[k] == null ? '' : o[k]).trim() !== ''; })) return;
      var errs = [], title = String(o.title == null ? '' : o.title).trim(), dt = L.parseDateCell(o.date, o.time);
      if (!title) errs.push('titolo_mancante'); if (!dt) errs.push('data_non_valida');
      var days = o.days === '' || o.days == null ? 1 : parseInt(o.days, 10); if (!(days >= 1 && days <= 30)) { errs.push('giorni_non_validi'); days = 1; }
      var km = o.km === '' || o.km == null ? '' : Math.round(Number(String(o.km).replace(',', '.'))); if (km !== '' && !(km >= 0 && km <= 5000)) { errs.push('km_non_validi'); km = ''; }
      var fee = o.fee === '' || o.fee == null ? '' : Number(String(o.fee).replace(',', '.')); if (fee !== '' && !(fee >= 0 && fee <= 9999)) { errs.push('quota_non_valida'); fee = ''; }
      var diff = DIFFS[nrm(o.diff)] || 'media';
      var stIn = nrm(o.status), status = /annull|cancel/.test(stIn) ? 'annullato' : (dt && dt.getTime() < now) || /conclus|done|fatto/.test(stIn) ? 'concluso' : 'programmato';
      var key = nrm(title) + '|' + (dt ? dt.toISOString().slice(0, 10) : '');
      var dup = !!ex[key] || !!seen[key]; seen[key] = 1;
      out.items.push({ row: i + 2, errors: errs, dup: dup, ok: !errs.length && !dup, key: key, title: title,
        run: errs.length ? null : { id: null, title: title, run_date: dt.toISOString(), meeting_point: String(o.meeting || '').trim().slice(0, 200), destination: String(o.dest || '').trim().slice(0, 200), description: String(o.desc || '').trim().slice(0, 1000),
          km: km === '' ? '' : String(km), difficulty: diff, route_url: '', stops: [], meeting: null, dest: null, days: days, route_public: false, nav_tool: 'google', status: status, fee: fee === '' ? '' : String(fee) } });
    });
    out.total = out.items.length;
    if (attRows && attRows.length > 1) {
      var byName = {}; (members || []).forEach(function (m) { byName[nrm(m.last_name + ' ' + m.first_name)] = m; byName[nrm(m.first_name + ' ' + m.last_name)] = m; });
      var byKey = {}; out.items.forEach(function (it) { if (!it.errors.length) byKey[nrm(it.title)] = it; });
      attRows.slice(1).forEach(function (r, i) {
        var t = nrm(r[0]), nm = nrm(String(r[1] || '') + ' ' + String(r[2] || '')), nm2 = nrm(String(r[2] || '') + ' ' + String(r[1] || ''));
        if (!t && !nm.trim()) return;
        var pres = nrm(r[3]); if (pres !== '' && !/^(si|s|x|1|yes|y|presente|true|vero)$/.test(pres)) return;
        var m = byName[nm] || byName[nm2], it = byKey[t];
        if (!it) out.attErrors.push({ row: i + 2, why: 'run_sconosciuto' }); else if (!m) out.attErrors.push({ row: i + 2, why: 'socio_sconosciuto', name: String(r[1] || '') + ' ' + String(r[2] || '') });
        else out.att.push({ key: it.key, member: m.id });
      });
    }
    return out;
  };

  /* file .ics (RFC 5545) per un Run */
  function icsEsc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsFold(line) { var out = [], b = line; while (b.length > 73) { out.push(b.slice(0, 73)); b = ' ' + b.slice(73); } out.push(b); return out.join('\r\n'); }
  function icsUtc(d) { function p(n) { return (n < 10 ? '0' : '') + n; } return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z'; }
  L.ics = function (run, chapter, now) {
    var st = new Date(run.run_date), n = L.runDays(run), en = new Date(st.getTime() + (n > 1 ? n * 86400000 : 8 * 3600000));
    var desc = [run.destination ? 'Destinazione: ' + run.destination : '', run.km ? run.km + ' km' : '', run.description || ''].filter(Boolean).join('\n');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roadbook//Roma Chapter//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + run.id + '@roadbook', 'DTSTAMP:' + icsUtc(new Date(now || Date.now())), 'DTSTART:' + icsUtc(st), 'DTEND:' + icsUtc(en), 'SUMMARY:' + icsEsc((chapter ? chapter + ' · ' : '') + run.title),
      run.meeting_point ? 'LOCATION:' + icsEsc(run.meeting_point) : '', desc ? 'DESCRIPTION:' + icsEsc(desc) : '', run.status === 'annullato' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(run.title), 'TRIGGER:-P1D', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(run.title), 'TRIGGER:-PT2H', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(run.title), 'TRIGGER:-PT1H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    return lines.filter(Boolean).map(icsFold).join('\r\n') + '\r\n';
  };

  /* GPX: tappe dai waypoint, oppure dal tracciato (partenza, punti intermedi, arrivo) + chilometri */
  function hav(a, b) { var R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r, x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  function xmlTxt(s) { return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim(); }
  L.parseGpx = function (xml, maxStops) {
    maxStops = maxStops || 8; xml = String(xml || '');
    if (!/<gpx[\s>]/i.test(xml)) return null;
    function pts(tag) {
      var re = new RegExp('<' + tag + '\\b([^>]*?)(?:/>|>([\\s\\S]*?)</' + tag + '>)', 'gi'), out = [], m;
      while ((m = re.exec(xml))) {
        var la = /lat\s*=\s*["']([-\d.]+)["']/i.exec(m[1]), lo = /lon\s*=\s*["']([-\d.]+)["']/i.exec(m[1]); if (!la || !lo) continue;
        var nm = m[2] ? /<name>([\s\S]*?)<\/name>/i.exec(m[2]) : null, p = { lat: +la[1], lng: +lo[1], name: nm ? xmlTxt(nm[1]) : '' };
        if (isFinite(p.lat) && isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180) out.push(p);
      }
      return out;
    }
    var trk = pts('trkpt'); if (!trk.length) trk = pts('rtept');
    var km = 0, i; for (i = 1; i < trk.length; i++) km += hav(trk[i - 1], trk[i]);
    var wpt = pts('wpt'), stops;
    if (wpt.length) stops = wpt.slice(0, maxStops).map(function (p, k) { return { name: (p.name || 'Tappa ' + (k + 1)).slice(0, 60), lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }; });
    else if (trk.length >= 2) {
      var n = Math.min(maxStops, Math.max(2, Math.round(km / 60) + 1)), pick = [], cum = [0]; for (i = 1; i < trk.length; i++) cum.push(cum[i - 1] + hav(trk[i - 1], trk[i]));
      for (i = 0; i < n; i++) { var target = km * i / (n - 1), j = 0; while (j < trk.length - 1 && cum[j] < target) j++; pick.push(trk[j]); }
      stops = pick.map(function (p, k) { return { name: k === 0 ? 'Partenza' : k === pick.length - 1 ? 'Arrivo' : 'Tappa ' + k, lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }; });
    } else return { stops: [], km: 0, empty: true };
    return { stops: stops, km: Math.round(km), empty: false };
  };

  /* tessera digitale: contenuto del QR (nessun dato personale, solo l'identificativo) */
  L.qrPayload = function (memberId) { return 'RBK1:' + memberId; };
  L.parseQr = function (txt) { var m = /^RBK1:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(String(txt || '').trim()); return m ? m[1].toLowerCase() : null; };

  /* statistiche e storico */
  function isDone(r, now) { return r.status !== 'annullato' && (r.status === 'concluso' || new Date(r.run_date).getTime() < (now || Date.now())); }
  L.statsMember = function (runs, signups, memberId, now) {
    var done = (runs || []).filter(function (r) { return isDone(r, now); }), byRun = {}; (signups || []).forEach(function (s) { if (s.member_id === memberId) byRun[s.run_id] = s; });
    var attended = done.filter(function (r) { return byRun[r.id] && byRun[r.id].checked_in; }), signed = done.filter(function (r) { return byRun[r.id] && byRun[r.id].status === 'si'; });
    var km = attended.reduce(function (a, r) { return a + (r.km || 0); }, 0), nights = attended.reduce(function (a, r) { return a + (L.runDays(r) > 1 ? L.runDays(r) - 1 : 0); }, 0);
    var years = {}; attended.forEach(function (r) { var y = new Date(r.run_date).getFullYear(); years[y] = (years[y] || 0) + 1; });
    var last = attended.slice().sort(function (a, b) { return new Date(b.run_date) - new Date(a.run_date); })[0] || null;
    return { done: done.length, attended: attended.length, signed: signed.length, rate: done.length ? Math.round(attended.length * 100 / done.length) : 0, km: km, nights: nights, years: years, last: last };
  };
  L.statsChapter = function (runs, signups, members, now) {
    var done = (runs || []).filter(function (r) { return isDone(r, now); }), ids = {}; done.forEach(function (r) { ids[r.id] = r; });
    var per = {}, tot = 0, byMonth = {}, byMember = {};
    (signups || []).forEach(function (s) { if (ids[s.run_id] && s.checked_in) { per[s.run_id] = (per[s.run_id] || 0) + 1; byMember[s.member_id] = (byMember[s.member_id] || 0) + 1; } });
    done.forEach(function (r) { tot += per[r.id] || 0; var k = String(r.run_date).slice(0, 7); byMonth[k] = (byMonth[k] || 0) + 1; });
    var mm = {}; (members || []).forEach(function (m) { mm[m.id] = m; });
    var top = Object.keys(byMember).map(function (id) { return { id: id, n: byMember[id], m: mm[id] }; }).filter(function (x) { return x.m; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    var withData = done.filter(function (r) { return per[r.id]; });
    return { runs: done.length, avg: withData.length ? Math.round(tot * 10 / withData.length) / 10 : 0, km: done.reduce(function (a, r) { return a + (r.km || 0); }, 0), top: top, byMonth: byMonth, active: Object.keys(byMember).length };
  };

  /* ---------- import di un percorso condiviso da Google Maps ---------- */
  /* primo link Google Maps dentro un testo condiviso ("Indicazioni per ... https://maps.app.goo.gl/...") */
  L.gmapsFind = function (txt) {
    var m = String(txt == null ? '' : txt).match(/https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})\/maps)[^\s"'<>]*/i);
    return m ? m[0].replace(/[).,;]+$/, '') : null;
  };
  L.gmapsIsShort = function (u) { return /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(String(u || '')); };
  /* coordinate dal parametro geocode dei link condivisi da iPhone: per punto, 0x15 + lat*1e6 e 0x1d + lng*1e6 (interi a 32 bit) */
  function b64bytes(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var bin; try { bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); } catch (e) { return null; }
    var out = []; for (var i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i) & 255); return out;
  }
  function i32(b, o) { var v = b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24); return v; }
  L.gmapsGeocode = function (g) {
    var b = b64bytes(g);
    if (!b || b.length < 10 || b[0] !== 0x15 || b[5] !== 0x1d) return null;
    var lat = i32(b, 1) / 1e6, lng = i32(b, 6) / 1e6;
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng) ? { lat: lat, lng: lng } : null;
  };
  var COORD_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
  function gPoint(txt, ll) {
    txt = String(txt || '').replace(/\s+/g, ' ').trim();
    var c = COORD_RE.exec(txt), p = { name: '', addr: '', kind: 'altro' };
    if (c) { p.lat = +c[1]; p.lng = +c[2]; p.addr = p.lat.toFixed(5) + ', ' + p.lng.toFixed(5); }
    else if (txt) { var i = txt.indexOf(','); p.name = (i > 0 ? txt.slice(0, i) : txt).trim().slice(0, 80); p.addr = txt.slice(0, 200); if (p.name === p.addr) p.addr = ''; }
    if (ll && !c) { p.lat = ll.lat; p.lng = ll.lng; }
    return (p.name || p.addr || L.hasCoords(p)) ? p : null;
  }
  /* da un link completo di Google Maps: partenza, tappe, arrivo (con coordinate se presenti) e strade da evitare.
     Formati: maps?saddr=&daddr=A+to:B (iPhone), /maps/dir/A/B/... (Android e computer), /maps/dir/?api=1 */
  L.parseGmaps = function (url) {
    var u; try { u = new URL(url); } catch (e) { return null; }
    if (!/^(www\.|maps\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/i.test(u.hostname) || !/^\/maps/.test(u.pathname)) return null;
    var q = u.searchParams, texts = [], lls = [], avoid = [], flg = q.get('dirflg') || '';
    if (q.get('saddr') != null || q.get('daddr')) {
      texts = [q.get('saddr') || ''].concat(String(q.get('daddr') || '').split(/\s+to:/));
      lls = String(q.get('geocode') || '').split(';').map(L.gmapsGeocode);
      if (lls.length !== texts.length) lls = [];
    } else if (q.get('api') === '1' && q.get('destination')) {
      texts = [q.get('origin') || ''].concat(q.get('waypoints') ? q.get('waypoints').split('|') : [], [q.get('destination')]);
      if (!q.get('origin')) texts.shift();
      String(q.get('avoid') || '').split(',').forEach(function (a) { if (/^(highways|tolls|ferries)$/.test(a)) avoid.push(a); });
    } else {
      var m = /^\/maps\/dir\/(.*?)(?:\/@|\/data=|\/?$)/.exec(u.pathname);
      if (!m) return null;
      texts = m[1].split('/').map(function (x) { try { return decodeURIComponent(x.replace(/\+/g, ' ')); } catch (e) { return x; } });
      var data = /\/data=([^/?]*)/.exec(u.pathname), pairs = [], re = /!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/g, mm;
      if (data) while ((mm = re.exec(data[1]))) pairs.push({ lng: +mm[1], lat: +mm[2] });
      var named = texts.filter(function (x) { return x && !COORD_RE.test(x); });
      if (pairs.length === named.length) { var k = 0; lls = texts.map(function (x) { return x && !COORD_RE.test(x) ? pairs[k++] : null; }); }
      if (data && /!1b1/.test(data[1])) avoid.push('highways');
      if (data && /!2b1/.test(data[1])) avoid.push('tolls');
    }
    if (/h/.test(flg)) avoid.push('highways');
    if (/t/.test(flg)) avoid.push('tolls');
    var pts = [], mine = false;
    texts.forEach(function (x, i) {
      if (!String(x || '').trim() || /^(la mia posizione|my location|ma position|posizione attuale|current location)$/i.test(String(x).trim())) { if (i === 0) mine = true; return; }
      var p = gPoint(x, lls[i]); if (p) pts.push(p);
    });
    if (!pts.length) return null;
    /* luoghi noti (H-D Store Roma, Fungo dell'EUR): nome e tipo predefiniti se il punto è entro 300 m */
    pts = pts.map(function (p) {
      var k = [L.HD_STORE, L.FUNGO].filter(function (x) { return L.hasCoords(p) && L.haversine({ lat: +p.lat, lng: +p.lng }, x) <= 0.3; })[0];
      return k ? Object.assign({}, k) : p;
    });
    return { points: pts, fromMyLocation: mine, avoid: avoid.filter(function (a, i) { return avoid.indexOf(a) === i; }) };
  };
  /* punti importati → ritrovo (primo), tappe (intermedie, massimo max), arrivo (ultimo) */
  L.gmapsToRun = function (g, max) {
    var pts = (g && g.points) || [], n = pts.length;
    if (!n) return null;
    if (n === 1) return { meeting: null, stops: [], dest: pts[0], dropped: 0 };
    var mid = pts.slice(1, -1), lim = max == null ? 40 : max;
    return { meeting: g.fromMyLocation ? null : pts[0], stops: (g.fromMyLocation ? [pts[0]] : []).concat(mid).slice(0, lim), dest: pts[n - 1], dropped: Math.max(0, mid.length + (g.fromMyLocation ? 1 : 0) - lim) };
  };

  /* partenza del Run: la fanno Direttore, Vice direttore, Amministratore o l'incaricato scelto nel Run */
  L.START_TITLES = ['admin', 'direttore', 'vice_direttore'];
  L.canStart = function (me, r) {
    return !!(me && me.id && r && me.active !== false && (L.START_TITLES.indexOf(me.title) >= 0 || (r.starter_id && me.id === r.starter_id)));
  };
  /* ora di partenza del giorno d (ora locale): giorno 1 = data del Run, gli altri all'orario scelto (day_starts) o alla stessa ora */
  var HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
  L.dayStart = function (r, d) {
    var b = new Date(r && r.run_date), t = b.getTime();
    if (!isFinite(t)) return NaN;
    d = Math.max(1, d || 1);
    var x = new Date(b.getFullYear(), b.getMonth(), b.getDate() + d - 1, b.getHours(), b.getMinutes()), m = d > 1 && r.day_starts && HHMM.exec(r.day_starts[String(d)] || '');
    if (m) x.setHours(+m[1], +m[2], 0, 0);
    return d === 1 ? t : x.getTime();
  };
  L.dayStartTime = function (r, d) { var m = d > 1 && r && r.day_starts && HHMM.exec(r.day_starts[String(d)] || ''); return m ? m[0] : null; };
  /* giorno che si può far partire adesso: da 2 ore prima a 12 ore dopo la sua partenza (come sul server) */
  L.nextStartDay = function (r, now) {
    if (!r || r.status !== 'programmato') return null;
    var n = now == null ? Date.now() : now, H = 3600000, d, ds, last = L.runDays(r);
    for (d = r.started_at ? (r.started_day || 1) + 1 : 1; d <= last; d++) {
      ds = L.dayStart(r, d);
      if (!isFinite(ds) || n < ds - 2 * H) return null;
      if (n <= ds + 12 * H) return d;
    }
    return null;
  };
  /* fase della partenza: 'banner' da 30 minuti prima a 12 ore dopo, 'early' da 2 ore prima (solo nel dettaglio) */
  L.startPhase = function (r, now) {
    var n = now == null ? Date.now() : now, d = L.nextStartDay(r, n);
    if (!d) return null;
    return n >= L.dayStart(r, d) - 1800000 ? 'banner' : 'early';
  };
  /* un Run va in archivio 6 ore dopo la partenza dell'ultimo giorno */
  L.isPast = function (r, now) {
    var n = now == null ? Date.now() : now;
    return r.status === 'concluso' || L.dayStart(r, L.runDays(r)) < n - 6 * 3600000;
  };
  /* chiave del "Ho visto": Run e giorno */
  L.ackKey = function (r) { return r.id + ':' + (r.started_day || 1); };
  /* avviso "si parte" da confermare con "Ho visto": entro 12 ore dalla partenza, non per chi l'ha fatta partire */
  L.startAlertRun = function (runs, me, acks, now) {
    var n = now == null ? Date.now() : now, seen = acks || [];
    return (runs || []).filter(function (r) {
      var s = r.started_at ? new Date(r.started_at).getTime() : NaN;
      return isFinite(s) && r.status !== 'annullato' && n - s < 12 * 3600000 && me && r.started_by !== me.id && seen.indexOf(L.ackKey(r)) < 0;
    }).sort(function (a, b) { return new Date(b.started_at) - new Date(a.started_at); })[0] || null;
  };

  /* iscrizioni: chiuse dopo la data scelta dal direttivo; pieno se i posti non bastano per me (più l'eventuale passeggero) */
  L.signupClosed = function (r, now) { var u = r && r.signup_until ? new Date(r.signup_until).getTime() : NaN; return isFinite(u) && (now == null ? Date.now() : now) > u; };
  L.isFull = function (r, signups, meId, pass) {
    if (!r || !r.max_participants) return false;
    var taken = (signups || []).filter(function (s) { return s.status === 'si' && s.member_id !== meId; }).reduce(function (a, s) { return a + 1 + (s.passengers || 0); }, 0);
    return taken + 1 + (pass || 0) > r.max_participants;
  };

  /* soste del gruppo dal GPS di chi guida: sosta sotto 5 km/h per 3 minuti (semafori e code non contano),
     ripartenza sopra 20 km/h per 30 secondi e ad almeno 200 m dal punto di sosta (a piedi non riparte) */
  L.HALT = { slowKmh: 5, slowMs: 180000, fastKmh: 20, fastMs: 30000, awayKm: 0.2, gapMs: 30000 };
  L.haltNew = function (halted, at) { return { mode: halted ? 'halt' : 'move', slowSince: null, fastSince: null, at: at || null, last: null }; };
  /* un campione GPS {lat, lng, t (ms), kmh (null se il telefono non la dà)}; restituisce 'stop', 'go' o null */
  L.haltStep = function (st, s) {
    var C = L.HALT, v = s.kmh, ev = null;
    if (v == null || !isFinite(v)) v = st.last && s.t > st.last.t ? L.haversine(st.last, s) / ((s.t - st.last.t) / 3600000) : 0;
    if (st.mode === 'move') {
      st.fastSince = null;
      if (v < C.slowKmh) {
        if (st.slowSince == null) { st.slowSince = s.t; st.at = { lat: s.lat, lng: s.lng }; }
        if (s.t - st.slowSince >= C.slowMs) { st.mode = 'halt'; ev = 'stop'; st.slowSince = null; }
      } else st.slowSince = null;
    } else {
      st.slowSince = null;
      if (!st.at) st.at = { lat: s.lat, lng: s.lng };
      if (v >= C.fastKmh && L.haversine(st.at, s) >= C.awayKm) {
        if (st.fastSince == null) st.fastSince = s.t;
        if (s.t - st.fastSince >= C.fastMs) { st.mode = 'move'; ev = 'go'; st.fastSince = null; st.at = null; }
      } else st.fastSince = null;
    }
    st.last = { lat: s.lat, lng: s.lng, t: s.t };
    return ev;
  };
  /* da fermi il telefono può smettere di mandare posizioni: nessun aggiornamento per 30 s conta come fermo */
  L.haltTick = function (st, t) {
    var C = L.HALT;
    if (st.mode !== 'move' || !st.last || t - st.last.t < C.gapMs) return null;
    if (st.slowSince == null) { st.slowSince = st.last.t; st.at = { lat: st.last.lat, lng: st.last.lng }; }
    if (t - st.slowSince >= C.slowMs) { st.mode = 'halt'; st.slowSince = null; return 'stop'; }
    return null;
  };

  /* «Mi sono perso»: chi aiuta (come sul server: chi fa partire, chi gestisce i Run, road captain e scopa della formazione) */
  L.lostGuide = function (me, r) {
    if (!me || !me.id || !r || me.active === false) return false;
    if (L.canStart(me, r) || (me.perms || []).indexOf('runs_edit') >= 0) return true;
    return (Array.isArray(r.formation) ? r.formation : []).some(function (f) { return f && f.member_id === me.id && (f.kind === 'road_captain' || f.kind === 'scopa'); });
  };
  L.lostActive = function (x) { return !!x && (x.status === 'open' || x.status === 'sent'); };
  L.LOST = { arriveKm: 0.2, atStopKm: 0.5, kmh: 50 };
  /* sosta da proporre: la tappa dove il gruppo è fermo (entro 500 m dalla sosta in corso), altrimenti la tappa che chiude
     il tratto di programma più vicino al gruppo. places = luoghi del giorno in ordine; restituisce l'indice o -1 */
  L.nextStop = function (places, pos, haltAt) {
    var pts = [], i, best = -1, bd = Infinity;
    (places || []).forEach(function (p, k) { if (L.hasCoords(p)) pts.push({ k: k, lat: Number(p.lat), lng: Number(p.lng) }); });
    if (!pts.length) return -1;
    if (haltAt && L.hasCoords(haltAt)) {
      pts.forEach(function (p) { var d = L.haversine(haltAt, p); if (d < bd) { bd = d; best = p.k; } });
      if (bd <= L.LOST.atStopKm) return best;
      pos = pos || haltAt; best = -1; bd = Infinity;
    }
    if (!pos || !L.hasCoords(pos)) return pts.length > 1 ? pts[1].k : pts[0].k;
    if (pts.length === 1) return pts[0].k;
    for (i = 0; i < pts.length - 1; i++) { var d = segKm(pos, pts[i], pts[i + 1]); if (d < bd) { bd = d; best = pts[i + 1].k; } }
    return best;
  };
  /* distanza (km) dal punto al segmento a-b, in piano locale: basta per distanze di qualche decina di km */
  function segKm(p, a, b) {
    var k = Math.cos(Number(p.lat) * Math.PI / 180) * 111.32, ax = (a.lng - p.lng) * k, ay = (a.lat - p.lat) * 110.57, bx = (b.lng - p.lng) * k, by = (b.lat - p.lat) * 110.57;
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, u = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    return Math.sqrt(Math.pow(ax + u * dx, 2) + Math.pow(ay + u * dy, 2));
  }
  /* minuti all'arrivo senza servizio di percorsi: strada stimata a velocità media di gruppo */
  L.etaMin = function (from, to) {
    if (!L.hasCoords(from) || !L.hasCoords(to)) return null;
    return Math.max(1, Math.ceil(L.haversine(from, to) * L.ROAD_FACTOR / L.LOST.kmh * 60));
  };
  /* navigazione di Google Maps verso la sosta (coordinate se ci sono, altrimenti indirizzo o nome) */
  L.lostNavUrl = function (stop) {
    var q = L.hasCoords(stop) ? Number(stop.lat).toFixed(6) + ',' + Number(stop.lng).toFixed(6) : String((stop && (stop.addr || stop.name)) || '').trim();
    return q ? 'https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=' + encodeURIComponent(q) : null;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.RBL = L;
})(typeof window !== 'undefined' ? window : this);
