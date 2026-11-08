/* Roadbook · logica pura (nessun accesso al DOM): ruoli, import Excel, formazione. Testata in Node. */
(function (root) {
  'use strict';
  var L = {};

  /* permessi dei profili di accesso (stessi nomi e stesse dipendenze del database) */
  L.PERMS = ['members_view', 'phones_view', 'personal_view', 'route_view', 'formation_draft_view', 'runs_edit', 'formation_edit', 'signups_manage', 'photos_moderate', 'members_edit', 'payments_view', 'payments_edit', 'settings_edit', 'profiles_manage'];
  L.PERM_DEPS = {
    runs_edit: ['route_view'], formation_edit: ['formation_draft_view', 'members_view'], signups_manage: ['members_view'],
    members_edit: ['members_view', 'phones_view', 'personal_view'], payments_edit: ['payments_view', 'members_view'], payments_view: ['members_view'],
    phones_view: ['members_view'], personal_view: ['members_view'], profiles_manage: ['members_view']
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
    notes: ['note', 'notes', 'annotazioni', 'remarques', 'osservazioni']
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
        birth_date: L.parseDate(cell(row, map.birth_date)), joined_on: L.parseDate(cell(row, map.joined_on))
      };
      var bd = map.birth_date !== undefined ? cell(row, map.birth_date) : '', jd = map.joined_on !== undefined ? cell(row, map.joined_on) : '';
      if (!o.first_name || !o.last_name) { out.invalid.push({ row: r + 1, reason: 'nome_mancante' }); continue; }
      if (o.title === null) { out.invalid.push({ row: r + 1, reason: 'ruolo_sconosciuto', value: text(cell(row, map.title)) }); continue; }
      if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) { out.invalid.push({ row: r + 1, reason: 'email_non_valida' }); continue; }
      if ((bd !== '' && !o.birth_date) || (jd !== '' && !o.joined_on)) { out.invalid.push({ row: r + 1, reason: 'data_non_valida' }); continue; }
      var key = o.tessera ? 't:' + o.tessera.toLowerCase() : 'n:' + norm(o.first_name) + '|' + norm(o.last_name);
      if (seen[key]) { out.invalid.push({ row: r + 1, reason: 'doppione' }); continue; }
      seen[key] = true;
      out.rows.push(o);
    }
    return out;
  };

  /* conteggi iscritti di un run */
  L.counts = function (signups) {
    var c = { si: 0, forse: 0, no: 0, riders: 0, pass: 0, total: 0, checked: 0 };
    (signups || []).forEach(function (s) {
      if (s.status === 'si') { c.si++; c.riders++; c.pass += s.passengers || 0; if (s.checked_in) c.checked++; }
      else if (s.status === 'forse') c.forse++;
      else if (s.status === 'no') c.no++;
    });
    c.total = c.riders + c.pass;
    return c;
  };

  /* formazione automatica: capofila, soci (i più nuovi davanti), safety distribuiti, scopa in coda */
  L.autoFormation = function (people) {
    var duty = [], regular = [], lead = null;
    people.forEach(function (p) {
      if (p.title === 'head_road_captain' || p.title === 'road_captain' || p.title === 'officer') duty.push(p); else regular.push(p);
    });
    var rank = { head_road_captain: 0, road_captain: 1, officer: 2 };
    duty.sort(function (a, b) { return rank[a.title] - rank[b.title]; });
    var rcIdx = -1;
    for (var i = 0; i < duty.length; i++) if (duty[i].title !== 'officer') { rcIdx = i; break; }
    if (rcIdx >= 0) lead = duty.splice(rcIdx, 1)[0];
    var scopa = duty.length ? duty.pop() : null;
    var safeties = duty.slice(0, 2);
    duty.slice(2).forEach(function (p) { regular.push(p); });
    regular.sort(function (a, b) { return String(b.joined_on || '').localeCompare(String(a.joined_on || '')) || (a.order || 0) - (b.order || 0); });
    var mid = regular.slice(), n = mid.length, res = [];
    var pos = safeties.length === 1 ? [Math.round(n / 2)] : safeties.length === 2 ? [Math.round(n / 3), Math.round(2 * n / 3)] : [];
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

  /* navigazione: ritrovo -> tappe con indirizzo -> destinazione (consecutivi uguali uniti) */
  L.navPoints = function (run) {
    var pts = [], last = null;
    function add(v) {
      v = String(v == null ? '' : v).trim();
      if (!v) return;
      var k = norm(v);
      if (k && k === last) return;
      last = k; pts.push(v);
    }
    add(run && run.meeting_point);
    ((run && run.stops) || []).forEach(function (s) { add(s && s.addr); });
    add(run && run.destination);
    return pts;
  };
  L.NAV_MAX_WAYPOINTS = 9;
  L.googleNav = function (pts) {
    if (!pts || !pts.length) return null;
    var e = encodeURIComponent, base = 'https://www.google.com/maps/dir/?api=1&travelmode=driving';
    if (pts.length === 1) return { url: base + '&destination=' + e(pts[0]), dropped: 0 };
    var mid = pts.slice(1, -1), dropped = Math.max(0, mid.length - L.NAV_MAX_WAYPOINTS);
    mid = mid.slice(0, L.NAV_MAX_WAYPOINTS);
    return { url: base + '&origin=' + e(pts[0]) + '&destination=' + e(pts[pts.length - 1]) + (mid.length ? '&waypoints=' + mid.map(e).join('%7C') : ''), dropped: dropped };
  };
  L.appleNav = function (pts) {
    if (!pts || !pts.length) return null;
    var e = encodeURIComponent;
    if (pts.length === 1) return 'https://maps.apple.com/?daddr=' + e(pts[0]) + '&dirflg=d';
    return 'https://maps.apple.com/?saddr=' + e(pts[0]) + '&daddr=' + pts.slice(1).map(e).join('+to:') + '&dirflg=d';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.RBL = L;
})(typeof window !== 'undefined' ? window : this);
