/* Roadbook · logica pura (nessun accesso al DOM): ruoli, import Excel, formazione. Testata in Node. */
(function (root) {
  'use strict';
  var L = {};

  /* permessi dei profili di accesso (stessi nomi e stesse dipendenze del database) */
  L.PERMS = ['members_view', 'phones_view', 'personal_view', 'route_view', 'formation_draft_view', 'runs_edit', 'formation_edit', 'signups_manage', 'photos_moderate', 'members_edit', 'payments_view', 'payments_edit', 'settings_edit', 'profiles_manage', 'reports_view'];
  L.PERM_DEPS = {
    runs_edit: ['route_view'], formation_edit: ['formation_draft_view', 'members_view'], signups_manage: ['members_view'],
    members_edit: ['members_view', 'phones_view', 'personal_view'], payments_edit: ['payments_view', 'members_view'], payments_view: ['members_view'],
    phones_view: ['members_view'], personal_view: ['members_view'], profiles_manage: ['members_view'], reports_view: ['members_view']
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
  L.runDays = function (run) { var d = parseInt(run && run.days, 10); return d >= 1 && d <= 14 ? d : 1; };
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
  L.WX_ICON = { clear: '☀️', cloud: '⛅', fog: '🌫️', freezing: '🧊', drizzle: '🌦️', rain: '🌧️', snow: '❄️', thunder: '⛈️', unknown: '·' };
  function at(a, i) { return a && a[i] !== undefined && a[i] !== null ? Number(a[i]) : null; }
  /* dati orari di un punto per l'ora indicata (ms) */
  L.wxHour = function (point, ms) {
    var h = point && point.hourly, k = L.romeKey(ms), i;
    if (!h || !h.time) return null;
    i = h.time.indexOf(k);
    if (i < 0) return null;
    return { t: k, temp: at(h.temperature_2m, i), feels: at(h.apparent_temperature, i), pop: at(h.precipitation_probability, i), precip: at(h.precipitation, i),
      code: at(h.weather_code, i), wind: at(h.wind_speed_10m, i), gust: at(h.wind_gusts_10m, i), vis: at(h.visibility, i) };
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
  /* orari di arrivo ai punti: partenza all'ora del Run, km a 65 km/h, 20 min a ogni tappa; ogni giorno riparte dall'ora del Run */
  L.wxEtas = function (run, W) {
    var pts = (W && W.points) || [], start = new Date(run.run_date).getTime(), out = [], day = 1, t = start, prev = null, i;
    for (i = 0; i < pts.length; i++) {
      var p = pts[i], d = parseInt(p.day, 10) || 1;
      if (d > day) { day = d; t = start + (d - 1) * 86400000; prev = null; }
      if (prev && L.hasCoords(prev) && L.hasCoords(p)) t += L.haversine({ lat: +prev.lat, lng: +prev.lng }, { lat: +p.lat, lng: +p.lng }) * L.ROAD_FACTOR / L.WX_SPEED * 3600000;
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

  /* ---------- dashboard e report ---------- */
  var R = L.report = {};
  R.DATASETS = {
    run: [
      { k: 'date', ty: 'date' }, { k: 'title', ty: 'text' }, { k: 'status', ty: 'text' }, { k: 'days', ty: 'num' }, { k: 'km', ty: 'num' }, { k: 'difficulty', ty: 'text' },
      { k: 'meeting', ty: 'text' }, { k: 'destination', ty: 'text' }, { k: 'riders', ty: 'num' }, { k: 'passengers', ty: 'num' }, { k: 'total', ty: 'num' },
      { k: 'checked', ty: 'num' }, { k: 'maybe', ty: 'num' }, { k: 'max', ty: 'num' }, { k: 'fill', ty: 'num' }, { k: 'wx', ty: 'text' }],
    socio: [
      { k: 'last_name', ty: 'text' }, { k: 'first_name', ty: 'text' }, { k: 'title', ty: 'text' }, { k: 'active', ty: 'text' }, { k: 'bike', ty: 'text' }, { k: 'joined_on', ty: 'date' },
      { k: 'phone', ty: 'text', perm: 'phones_view' }, { k: 'email', ty: 'text', perm: 'personal_view' }, { k: 'tessera', ty: 'text', perm: 'personal_view' },
      { k: 'attended', ty: 'num' }, { k: 'signed', ty: 'num' }],
    presenza: [
      { k: 'date', ty: 'date' }, { k: 'run', ty: 'text' }, { k: 'member', ty: 'text' }, { k: 'answer', ty: 'text' }, { k: 'passengers', ty: 'num' }, { k: 'checked', ty: 'text' }],
    quota: [
      { k: 'member', ty: 'text' }, { k: 'year', ty: 'num' }, { k: 'amount', ty: 'num' }, { k: 'method', ty: 'text' }, { k: 'paid_on', ty: 'date' }, { k: 'note', ty: 'text', perm: 'payments_view' }]
  };
  R.DS_PERM = { run: null, socio: 'members_view', presenza: 'members_view', quota: 'payments_view' };
  R.cols = function (ds, perms) {
    return (R.DATASETS[ds] || []).filter(function (c) { return !c.perm || (perms || []).indexOf(c.perm) >= 0; });
  };
  function yearOf(s) { var m = /^(\d{4})/.exec(String(s || '')); return m ? +m[1] : null; }
  function dstr(iso) { return iso ? String(iso).slice(0, 10) : ''; }
  R.runYear = function (r) { return new Date(r.run_date).getFullYear(); };
  /* righe del dataset dopo i filtri; ctx: {runs, signups, members, payments, weather, titleName} */
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
          riders: c.riders, passengers: c.pass, total: c.total, checked: c.checked, maybe: c.forse, max: r.max_participants == null ? null : +r.max_participants,
          fill: r.max_participants ? Math.round(c.total * 100 / r.max_participants) : null, wx: sm && sm.covered ? ['ok', 'warn', 'crit'][sm.level] : '' });
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
    } else if (def.ds === 'quota') {
      (ctx.payments || []).forEach(function (p) {
        if (y && +p.year !== y) return; if (f.method && p.method !== f.method) return;
        rows.push({ member: name(mem[p.member_id]), year: +p.year, amount: p.amount == null ? null : +p.amount, method: p.method || '', paid_on: dstr(p.paid_on), note: p.note || '' });
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
    ['status', 'role', 'active', 'method'].forEach(function (k) { if (f[k]) out.filters[k] = String(f[k]).slice(0, 40); });
    if (d.sort && ok.indexOf(d.sort.key) >= 0) out.sort = { key: d.sort.key, dir: d.sort.dir === 'desc' ? 'desc' : 'asc' };
    return out;
  };
  /* report standard (si possono modificare e salvare come propri) */
  R.STANDARD = [
    { id: 'runs', def: { ds: 'run', cols: ['date', 'title', 'status', 'days', 'km', 'total', 'checked', 'fill'], filters: {}, sort: { key: 'date', dir: 'desc' } }, yearly: true },
    { id: 'presenze', def: { ds: 'socio', cols: ['last_name', 'first_name', 'title', 'attended', 'signed'], filters: { active: 'yes' }, sort: { key: 'attended', dir: 'desc' } }, yearly: true },
    { id: 'quote', def: { ds: 'quota', cols: ['member', 'year', 'amount', 'method', 'paid_on'], filters: {}, sort: { key: 'paid_on', dir: 'desc' } }, perm: 'payments_view', yearly: true },
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
    var fee = ctx.fee || 0, act = (ctx.members || []).filter(function (m) { return m.active; }).length, paid = null, expected = null;
    if (ctx.payments) { paid = ctx.payments.filter(function (p) { return +p.year === year; }).reduce(function (a, p) { return a + (+p.amount || 0); }, 0); expected = fee * act; }
    var paidIds = ctx.payments ? ctx.payments.filter(function (p) { return +p.year === year; }).map(function (p) { return p.member_id; }) : null;
    return {
      year: year, members: act, runs: doneY.length, km: doneY.reduce(function (a, r) { return a + (+r.km || 0); }, 0), avg: nP ? Math.round(sumP / nP * 10) / 10 : 0, next: next,
      series: done.slice(-8).map(function (r) { return { id: r.id, label: r.title, date: String(r.run_date).slice(0, 10), value: tot(r).total }; }),
      top: top, paid: paid, expected: expected, payers: paidIds ? new Set(paidIds).size : null, cancelled: runs.filter(function (r) { return r.status === 'annullato' && R.runYear(r) === year; }).length
    };
  };
  L.yearsOf = function (runs) { var o = {}; (runs || []).forEach(function (r) { o[new Date(r.run_date).getFullYear()] = 1; }); o[new Date().getFullYear()] = 1; return Object.keys(o).map(Number).sort(function (a, b) { return b - a; }); };

  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.RBL = L;
})(typeof window !== 'undefined' ? window : this);
