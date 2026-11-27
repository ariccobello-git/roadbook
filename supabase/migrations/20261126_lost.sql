-- 9076 RoadBook 5.0.0 · «Mi sono perso»: il server propone la sosta, il capogruppo o il safety la confermano e il socio la raggiunge con ora prevista di arrivo
-- Funzioni riscritte per intero: si può incollare nel SQL Editor così com'è. Richiede le migrazioni 20261126_run_days_halts e 20261126_signup_rules.

create table if not exists public.rc_lost (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.rc_runs(id) on delete cascade,
  member_id uuid not null references public.rc_members(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'sent', 'arrived', 'closed')),
  lat double precision, lng double precision, pos_at timestamptz,
  stop jsonb, tip jsonb,
  sent_by uuid references public.rc_members(id) on delete set null, sent_at timestamptz,
  eta timestamptz, eta_at timestamptz, eta_pushed timestamptz,
  created_at timestamptz not null default now(), done_at timestamptz
);
create unique index if not exists rc_lost_open on public.rc_lost (run_id, member_id) where status in ('open', 'sent');
create index if not exists rc_lost_run on public.rc_lost (run_id, created_at);
alter table public.rc_lost add column if not exists tip jsonb;
alter table public.rc_lost enable row level security;

/* chi agisce per chi si è perso: capogruppo (road captain in formazione, chi fa partire il Run, Head Road Captain) e safety */
create or replace function rc_private.lost_actor(m public.rc_members, r public.rc_runs) returns boolean
 language sql stable set search_path to 'public', 'rc_private'
as $$ select coalesce(m.id is not null and m.active and (m.id = r.starter_id or m.title = 'head_road_captain'
  or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(r.formation) = 'array' then r.formation else '[]'::jsonb end) f
             where f->>'member_id' = m.id::text and f->>'kind' in ('road_captain', 'safety'))), false) $$;
/* chi è informato e può intervenire se vuole: in più admin, direttore e vice direttore */
create or replace function rc_private.lost_guide(m public.rc_members, r public.rc_runs) returns boolean
 language sql stable set search_path to 'public', 'rc_private'
as $$ select coalesce(m.id is not null and m.active and (rc_private.lost_actor(m, r) or m.title in ('admin', 'direttore', 'vice_direttore')), false) $$;

create or replace function rc_private.km(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision) returns double precision
 language sql immutable
as $$ select 2 * 6371 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2) + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))) $$;

/* distanza (km) da un punto al tratto a-b, in piano locale (basta per qualche decina di km) */
create or replace function rc_private.seg_km(p_lat double precision, p_lng double precision, a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision) returns double precision
 language plpgsql immutable
as $$
declare k double precision := cos(radians(p_lat)) * 111.32; ax double precision; ay double precision; dx double precision; dy double precision; l2 double precision; u double precision;
begin
  ax := (a_lng - p_lng) * k; ay := (a_lat - p_lat) * 110.57; dx := (b_lng - p_lng) * k - ax; dy := (b_lat - p_lat) * 110.57 - ay;
  l2 := dx * dx + dy * dy;
  u := case when l2 = 0 then 0 else greatest(0, least(1, -(ax * dx + ay * dy) / l2)) end;
  return sqrt(power(ax + u * dx, 2) + power(ay + u * dy, 2));
end $$;

/* luogo del programma con coordinate valide → {name, addr, lat, lng}, altrimenti null */
create or replace function rc_private.place_pt(e jsonb) returns jsonb
 language sql immutable
as $$ select case when jsonb_typeof(e) = 'object' and coalesce(e->>'lat', '') ~ '^-?[0-9]+(\.[0-9]+)?$' and coalesce(e->>'lng', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
  then jsonb_build_object('name', left(coalesce(e->>'name', ''), 80), 'addr', left(coalesce(e->>'addr', ''), 160), 'lat', (e->>'lat')::double precision, 'lng', (e->>'lng')::double precision) end $$;

/* sosta proposta dal server (la conferma il capogruppo o il safety): se il gruppo è fermo, la tappa entro 500 m dalla sosta
   (o la sosta stessa); altrimenti la tappa che chiude il tratto di programma più vicino al gruppo. null se non si sa */
create or replace function rc_private.lost_auto_stop(r public.rc_runs, p_member uuid) returns jsonb
 language plpgsql stable security definer set search_path to 'public', 'rc_private'
as $function$
declare v_days int; d int; st jsonb := case when jsonb_typeof(r.stops) = 'array' then r.stops else '[]'::jsonb end; pl jsonb := '[]'::jsonb; e jsonb;
  hl rc_run_halts; g_lat double precision; g_lng double precision; best jsonb; bd double precision := 1e9; dd double precision; i int; n int;
begin
  v_days := greatest(coalesce(r.days, 1), 1); d := least(greatest(coalesce(r.started_day, 1), 1), v_days);
  /* luoghi del giorno in ordine: partenza (o arrivo del giorno prima), tappe, arrivo del giorno */
  if d = 1 then e := r.meeting;
  else select x into e from jsonb_array_elements(st) x where x->>'end' = 'true' and coalesce(nullif(x->>'day', ''), '1') = (d - 1)::text limit 1; e := coalesce(e, r.meeting); end if;
  if rc_private.place_pt(e) is not null then pl := pl || jsonb_build_array(rc_private.place_pt(e)); end if;
  pl := pl || coalesce((select jsonb_agg(rc_private.place_pt(x) order by o) from jsonb_array_elements(st) with ordinality y(x, o)
    where coalesce(x->>'end', 'false') <> 'true' and (v_days = 1 or coalesce(nullif(x->>'day', ''), '1') = d::text) and rc_private.place_pt(x) is not null), '[]'::jsonb);
  e := null;
  if d < v_days then select x into e from jsonb_array_elements(st) x where x->>'end' = 'true' and coalesce(nullif(x->>'day', ''), '1') = d::text limit 1; end if;
  e := coalesce(e, case when d >= v_days then r.dest end);
  if rc_private.place_pt(e) is not null then pl := pl || jsonb_build_array(rc_private.place_pt(e)); end if;
  n := jsonb_array_length(pl);
  select * into hl from rc_run_halts where run_id = r.id and ended_at is null and lat is not null;
  if hl.id is not null then
    for i in 0 .. n - 1 loop
      dd := rc_private.km(hl.lat, hl.lng, (pl->i->>'lat')::double precision, (pl->i->>'lng')::double precision);
      if dd < bd then bd := dd; best := pl->i; end if;
    end loop;
    if best is not null and bd <= 0.5 then return best; end if;
    return jsonb_build_object('name', 'Sosta del gruppo', 'addr', '', 'lat', hl.lat, 'lng', hl.lng);
  end if;
  if n = 0 then return null; end if;
  /* posizione del gruppo: la più recente degli ultimi 10 minuti, prima chi guida */
  select l.lat, l.lng into g_lat, g_lng from rc_live l join rc_members mm on mm.id = l.member_id
    where l.run_id = r.id and l.member_id <> p_member and l.at > now() - interval '10 minutes'
    order by rc_private.lost_actor(mm, r) desc, l.at desc limit 1;
  if g_lat is null then return null; end if;
  if n = 1 then return pl->0; end if;
  for i in 0 .. n - 2 loop
    dd := rc_private.seg_km(g_lat, g_lng, (pl->i->>'lat')::double precision, (pl->i->>'lng')::double precision, (pl->(i + 1)->>'lat')::double precision, (pl->(i + 1)->>'lng')::double precision);
    if dd < bd then bd := dd; best := pl->(i + 1); end if;
  end loop;
  return best;
end $function$;

/* «Mi sono perso»: solo chi partecipa, a Run partito e non oltre 6 ore dalla fine; una sola richiesta aperta per socio.
   Il server propone la sosta; arriva al socio solo quando il capogruppo o il safety la confermano */
create or replace function public.rc_lost_send(p_code text, p_run uuid, p_lat double precision default null, p_lng double precision default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members; r rc_runs; cur rc_lost; v_id uuid; v_stop jsonb;
begin
  m := rc_private.auth(p_code); if m.id is null then return rc_private.err('auth'); end if;
  select * into r from rc_runs where id = p_run;
  if r.id is null then return rc_private.err('non_trovato'); end if;
  if not exists (select 1 from rc_signups where run_id = p_run and member_id = m.id and status = 'si') then return rc_private.err('forbidden'); end if;
  if r.status <> 'programmato' or r.started_at is null or now() > r.run_date + make_interval(days => greatest(coalesce(r.days, 1), 1)) + interval '6 hours' then return rc_private.err('live_fuori_orario'); end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180) then return rc_private.err('dati_non_validi'); end if;
  select * into cur from rc_lost where run_id = p_run and member_id = m.id and status in ('open', 'sent') for update;
  if cur.id is not null then
    update rc_lost set lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng), pos_at = case when p_lat is null then pos_at else now() end where id = cur.id;
    return jsonb_build_object('ok', true, 'id', cur.id, 'status', cur.status);
  end if;
  v_stop := rc_private.lost_auto_stop(r, m.id);
  insert into rc_lost (run_id, member_id, lat, lng, pos_at, tip)
    values (p_run, m.id, p_lat, p_lng, case when p_lat is null then null else now() end, v_stop)
    returning id into v_id;
  perform rc_private.push_send('lost', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'open');
end $function$;

/* la sosta da raggiungere: {name, addr, lat, lng}; si può cambiare finché il socio non è arrivato */
create or replace function public.rc_lost_stop(p_code text, p_id uuid, p_stop jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members; r rc_runs; cur rc_lost; v_name text; v_addr text; v_lat double precision; v_lng double precision;
begin
  m := rc_private.auth(p_code); if m.id is null then return rc_private.err('auth'); end if;
  select * into cur from rc_lost where id = p_id for update;
  if cur.id is null or cur.status not in ('open', 'sent') then return rc_private.err('non_trovato'); end if;
  select * into r from rc_runs where id = cur.run_id;
  if not rc_private.lost_guide(m, r) then return rc_private.err('forbidden'); end if;
  if p_stop is null or jsonb_typeof(p_stop) <> 'object' then return rc_private.err('dati_non_validi'); end if;
  v_name := left(btrim(coalesce(p_stop->>'name', '')), 80); v_addr := left(btrim(coalesce(p_stop->>'addr', '')), 160);
  begin
    v_lat := nullif(p_stop->>'lat', '')::double precision; v_lng := nullif(p_stop->>'lng', '')::double precision;
  exception when others then return rc_private.err('dati_non_validi');
  end;
  if (v_lat is null) <> (v_lng is null) or (v_lat is not null and (v_lat not between -90 and 90 or v_lng not between -180 and 180)) then return rc_private.err('dati_non_validi'); end if;
  if v_lat is null and v_addr = '' then return rc_private.err('dati_non_validi'); end if;
  update rc_lost set stop = jsonb_build_object('name', v_name, 'addr', v_addr, 'lat', v_lat, 'lng', v_lng), status = 'sent', sent_by = m.id, sent_at = now(),
    eta = null, eta_at = null, eta_pushed = null where id = p_id;
  perform rc_private.push_send('lost_go', p_id::text);
  return jsonb_build_object('ok', true);
end $function$;

/* posizione e minuti all'arrivo dal telefono di chi si è perso: sotto i 200 m dalla sosta è arrivato;
   al capogruppo arriva l'ora prevista la prima volta e poi solo se cambia di 10 minuti o più */
create or replace function public.rc_lost_pos(p_code text, p_id uuid, p_lat double precision, p_lng double precision, p_eta_min int default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members; cur rc_lost; v_eta timestamptz; s_lat double precision; s_lng double precision;
begin
  m := rc_private.auth(p_code); if m.id is null then return rc_private.err('auth'); end if;
  select * into cur from rc_lost where id = p_id for update;
  if cur.id is null or cur.member_id <> m.id then return rc_private.err('non_trovato'); end if;
  if cur.status not in ('open', 'sent') then return jsonb_build_object('ok', true, 'status', cur.status); end if;
  if p_lat is null or p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180 or (p_eta_min is not null and p_eta_min not between 0 and 1440) then return rc_private.err('dati_non_validi'); end if;
  update rc_lost set lat = p_lat, lng = p_lng, pos_at = now() where id = p_id;
  if cur.status <> 'sent' then return jsonb_build_object('ok', true, 'status', cur.status); end if;
  s_lat := nullif(cur.stop->>'lat', '')::double precision; s_lng := nullif(cur.stop->>'lng', '')::double precision;
  if s_lat is not null and rc_private.km(p_lat, p_lng, s_lat, s_lng) < 0.2 then
    update rc_lost set status = 'arrived', done_at = now(), eta = now(), eta_at = now() where id = p_id;
    perform rc_private.push_send('lost_here', p_id::text);
    return jsonb_build_object('ok', true, 'status', 'arrived');
  end if;
  if p_eta_min is not null then
    v_eta := now() + make_interval(mins => p_eta_min);
    update rc_lost set eta = v_eta, eta_at = now() where id = p_id;
    if cur.eta_pushed is null or abs(extract(epoch from v_eta - cur.eta_pushed)) >= 600 then
      update rc_lost set eta_pushed = v_eta where id = p_id;
      perform rc_private.push_send('lost_eta', p_id::text);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'status', 'sent');
end $function$;

/* fine: p_found = ritrovato il gruppo (o arrivato), altrimenti richiesta annullata; la chiude il socio o chi lo aiuta */
create or replace function public.rc_lost_close(p_code text, p_id uuid, p_found boolean)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members; r rc_runs; cur rc_lost; mine boolean;
begin
  m := rc_private.auth(p_code); if m.id is null then return rc_private.err('auth'); end if;
  select * into cur from rc_lost where id = p_id for update;
  if cur.id is null then return rc_private.err('non_trovato'); end if;
  select * into r from rc_runs where id = cur.run_id;
  mine := cur.member_id = m.id;
  if not mine and not rc_private.lost_guide(m, r) then return rc_private.err('forbidden'); end if;
  if cur.status not in ('open', 'sent') then return jsonb_build_object('ok', true); end if;
  update rc_lost set status = case when coalesce(p_found, false) then 'arrived' else 'closed' end, done_at = now() where id = p_id;
  if mine then perform rc_private.push_send(case when coalesce(p_found, false) then 'lost_here' else 'lost_off' end, p_id::text); end if;
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.rc_lost_send(text, uuid, double precision, double precision) from public;
revoke all on function public.rc_lost_stop(text, uuid, jsonb) from public;
revoke all on function public.rc_lost_pos(text, uuid, double precision, double precision, int) from public;
revoke all on function public.rc_lost_close(text, uuid, boolean) from public;
grant execute on function public.rc_lost_send(text, uuid, double precision, double precision) to anon, authenticated;
grant execute on function public.rc_lost_stop(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.rc_lost_pos(text, uuid, double precision, double precision, int) to anon, authenticated;
grant execute on function public.rc_lost_close(text, uuid, boolean) to anon, authenticated;

/* dati in più per la sincronizzazione (le prossime funzioni si aggiungono qui, senza riscrivere rc_sync) */
create or replace function rc_private.sync_extra(m public.rc_members) returns jsonb
 language sql stable security definer set search_path to 'public', 'rc_private'
as $$
  select jsonb_build_object('lost', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'run_id', l.run_id, 'member_id', l.member_id, 'status', l.status,
      'lat', l.lat, 'lng', l.lng, 'pos_at', l.pos_at, 'stop', l.stop, 'tip', l.tip, 'sent_by', l.sent_by, 'sent_at', l.sent_at, 'eta', l.eta, 'eta_at', l.eta_at,
      'created_at', l.created_at, 'done_at', l.done_at, 'phone', (select pm.phone from rc_members pm where pm.id = l.member_id),
      /* chi può chiamare il socio che si è perso: capogruppo e safety, con il telefono */
      'helpers', coalesce((select jsonb_agg(jsonb_build_object('id', hm.id, 'name', trim(coalesce(hm.first_name, '') || ' ' || coalesce(hm.last_name, '')), 'phone', hm.phone,
          'role', case when exists (select 1 from jsonb_array_elements(case when jsonb_typeof(r.formation) = 'array' then r.formation else '[]'::jsonb end) f
                                    where f->>'member_id' = hm.id::text and f->>'kind' = 'safety') then 'safety' else 'rc' end))
        from rc_members hm where hm.id <> l.member_id and rc_private.lost_actor(hm, r) and coalesce(hm.phone, '') <> ''), '[]'::jsonb)) order by l.created_at)
    from rc_lost l join rc_runs r on r.id = l.run_id
    where l.created_at > now() - interval '2 days' and (l.status in ('open', 'sent') or l.done_at > now() - interval '30 minutes')
      and (l.member_id = m.id or rc_private.lost_guide(m, r))), '[]'::jsonb))
$$;

/* notifiche in più (le prossime si aggiungono qui, senza riscrivere rc_push_msgs); p_ref = id della richiesta */
create or replace function rc_private.push_extra(p_kind text, p_ref text) returns jsonb
 language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare l rc_lost; r rc_runs; nm text; sn text; msgs jsonb;
begin
  if p_kind not in ('lost', 'lost_go', 'lost_eta', 'lost_here', 'lost_off') or p_ref !~ '^[0-9a-f-]{36}$' then return '[]'::jsonb; end if;
  select * into l from rc_lost where id = p_ref::uuid;
  if l.id is null then return '[]'::jsonb; end if;
  select * into r from rc_runs where id = l.run_id;
  select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from rc_members where id = l.member_id;
  sn := coalesce(nullif(l.stop->>'name', ''), nullif(l.stop->>'addr', ''), nullif(l.tip->>'name', ''), nullif(l.tip->>'addr', ''), 'la sosta');
  if p_kind = 'lost_go' then
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth,
      'title', '9076 RoadBook · raggiungi il gruppo', 'body', 'Vai a «' || sn || '». Tocca per aprire la navigazione.',
      'tag', 'lost-go-' || l.id, 'ttl', 3600, 'url', './#lost=' || l.id)), '[]'::jsonb)
      into msgs from rc_push p where p.member_id = l.member_id;
    return msgs;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth,
    'title', '9076 RoadBook · ' || case p_kind when 'lost' then 'socio staccato dal gruppo' when 'lost_eta' then 'arrivo previsto' else r.title end,
    'body', case p_kind
      when 'lost' then nm || case when not rc_private.lost_actor(t, r) then ' si è perso. Se ne occupano capogruppo e safety: tocca per seguire.'
        when l.tip is null then ' si è perso: chiamalo e indicagli la sosta da raggiungere.'
        else ' si è perso. Proposta: «' || sn || '». Chiamalo e conferma la sosta.' end
      when 'lost_eta' then nm || ' arriva a «' || sn || '» verso le ' || to_char(l.eta at time zone 'Europe/Rome', 'HH24:MI') || '.'
      when 'lost_here' then nm || case when l.stop is not null and l.status = 'arrived' and l.eta_at is not null and l.eta = l.done_at then ' è arrivato a «' || sn || '».' else ' ha ritrovato il gruppo.' end
      else nm || ' ha annullato la richiesta: ha ritrovato la strada.' end,
    'tag', case when p_kind in ('lost', 'lost_eta') then 'lost-' || l.id else 'lost-end-' || l.id end,
    'ttl', case p_kind when 'lost' then 1800 else 3600 end, 'url', './#lost=' || l.id)), '[]'::jsonb)
    into msgs from rc_members t join rc_push p on p.member_id = t.id
    where t.id <> l.member_id and rc_private.lost_guide(t, r);
  return msgs;
end $function$;

/* sincronizzazione: come la 4.9.0 più i dati di rc_private.sync_extra */
create or replace function public.rc_sync(p_code text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members; pm text[]; res jsonb; rt boolean; involved boolean; fm_inv boolean; fixed jsonb;
begin
  res := rc_sync_base(p_code);
  if (res->>'ok') is distinct from 'true' then return res; end if;
  m := rc_private.auth(p_code); pm := rc_private.perms(m.title);
  rt := 'route_view' = any(pm);
  involved := 'route_author' = any(pm) or 'review_approve' = any(pm);
  fm_inv := 'formation_edit' = any(pm) or 'review_approve' = any(pm) or 'route_author' = any(pm);
  select coalesce(jsonb_agg(
    case
      when not rt then (e - 'stops' - 'route_url' - 'meeting' - 'dest') || jsonb_build_object('stops','[]'::jsonb,'route_url',null,'meeting',null,'dest',null,'route_public',false)
      when involved or (r.review ? 'release') then e
      else (e - 'stops' - 'route_url' - 'meeting' - 'dest') || jsonb_build_object('stops','[]'::jsonb,'route_url',null,'meeting',null,'dest',null)
    end
    || case when rt and (r.review ? 'release') and not coalesce((e->>'formation_published')::boolean,false) then jsonb_build_object('formation', r.formation)
            when not fm_inv and not (r.review ? 'release') and not coalesce((e->>'formation_published')::boolean,false) then jsonb_build_object('formation','[]'::jsonb)
            else '{}'::jsonb end
    || jsonb_build_object('review', case when rt then r.review else '{}'::jsonb end)
    || jsonb_build_object('starter_id', r.starter_id, 'started_at', r.started_at, 'started_by', r.started_by, 'started_day', r.started_day, 'day_starts', r.day_starts, 'signup_until', r.signup_until)
    order by r.run_date), '[]'::jsonb) into fixed
  from jsonb_array_elements(res->'runs') e join rc_runs r on r.id = (e->>'id')::uuid;
  return res || jsonb_build_object('runs', fixed,
    'signups', coalesce((select jsonb_agg(jsonb_build_object('run_id', s.run_id, 'member_id', s.member_id, 'status', s.status, 'passengers', s.passengers, 'checked_in', s.checked_in,
        'room', s.room, 'extras', s.extras, 'pending', s.pending, 'requested_at', s.requested_at)) from rc_signups s join rc_runs r on r.id = s.run_id), '[]'::jsonb),
    'acks', coalesce((select jsonb_agg(a.run_id::text || ':' || a.day) from rc_run_ack a join rc_runs rr on rr.id = a.run_id where a.member_id = m.id and rr.started_at > now() - interval '2 days'), '[]'::jsonb),
    'halts', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'run_id', h.run_id, 'day', h.day, 'lat', case when rt then h.lat end, 'lng', case when rt then h.lng end,
        'started_at', h.started_at, 'ended_at', h.ended_at, 'restart_at', h.restart_at) order by h.started_at)
      from rc_run_halts h join rc_runs rr on rr.id = h.run_id where rr.run_date > now() - interval '60 days'), '[]'::jsonb))
    || rc_private.sync_extra(m);
end $function$;

/* notifiche: come la 4.9.0; i tipi nuovi passano da rc_private.push_extra */
create or replace function public.rc_push_msgs(p_key text, p_kind text, p_endpoint text default null::text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private', 'extensions'
as $function$
declare msgs jsonb; cm jsonb;
begin
  if p_key is distinct from rc_private.vsec('rc_push_key') then return jsonb_build_object('ok', false); end if;
  if p_kind = 'test' then
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'title', '9076 RoadBook · prova', 'body', 'Le notifiche funzionano su questo dispositivo.', 'tag', 'test', 'ttl', 60)), '[]'::jsonb)
      into msgs from rc_push s where s.endpoint = p_endpoint;
  elsif p_kind = 'remind' then
    delete from rc_remind_sent where at < now() - interval '40 days';
    with due as (
      select r.id as run_id, r.title, r.run_date, coalesce(nullif(r.meeting_point, ''), r.meeting->>'name', '') as mp, s.slot, s.iv
      from rc_runs r cross join (values ('24h', interval '24 hours'), ('2h', interval '2 hours'), ('1h', interval '1 hour')) s(slot, iv)
      where r.status = 'programmato' and now() >= r.run_date - s.iv and now() < r.run_date - s.iv + interval '30 minutes'),
    tgt as (
      select d.*, g.member_id from due d
      join rc_signups g on g.run_id = d.run_id and g.status = 'si'
      join rc_members mm on mm.id = g.member_id and mm.active
      where not exists (select 1 from rc_remind_sent x where x.run_id = d.run_id and x.member_id = g.member_id and x.slot = d.slot)),
    ins as (insert into rc_remind_sent (run_id, member_id, slot) select run_id, member_id, slot from tgt on conflict do nothing returning 1)
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth,
      'title', '9076 RoadBook · ' || t.title,
      'body', case t.slot when '24h' then 'Domani alle ' when '2h' then 'Tra 2 ore, alle ' else 'Tra un''ora si parte, alle ' end
              || to_char(t.run_date at time zone 'Europe/Rome', 'HH24:MI') || case when t.mp <> '' then ' · ritrovo: ' || t.mp else '' end,
      'tag', 'run-' || t.run_id || '-' || t.slot, 'ttl', case t.slot when '24h' then 7200 else 1800 end)), '[]'::jsonb)
      into msgs from tgt t join rc_push p on p.member_id = t.member_id;
    /* "Ho pagato": avviso a chi gestisce i pagamenti (una volta per dichiarazione) */
    with cl as (
      select c.id, c.amount, c.method, r.title, trim(coalesce(mm.first_name,'') || ' ' || coalesce(mm.last_name,'')) as nm
      from rc_pay_claims c join rc_runs r on r.id = c.run_id join rc_members mm on mm.id = c.member_id
      where not c.notified and c.done_at is null),
    upd as (update rc_pay_claims set notified = true where id in (select id from cl) returning 1)
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth,
      'title', '9076 RoadBook · pagamento da confermare',
      'body', cl.nm || ' dice di aver pagato ' || to_char(cl.amount, 'FM999G990D00') || ' € (' || cl.method || ') · ' || cl.title,
      'tag', 'claim-' || cl.id, 'ttl', 86400)), '[]'::jsonb)
      into cm from cl cross join rc_members t join rc_push p on p.member_id = t.id
      where t.active and rc_private.can(t.title, 'payments_manage');
    msgs := msgs || coalesce(cm, '[]'::jsonb);
    /* è ora di partire: per ogni giorno, una volta, dall'ora di partenza fino a 30 minuti dopo, a chi può far partire */
    with cand as (
      select r.id, r.title, r.days, x.d, rc_private.day_start(r, x.d) as ds
      from rc_runs r cross join lateral (select rc_private.next_start_day(r, now()) as d) x
      where r.status = 'programmato' and r.run_date < now() + interval '1 hour' and r.run_date > now() - interval '31 days' and x.d is not null),
    due as (select * from cand where now() >= ds - interval '5 minutes' and now() < ds + interval '30 minutes'),
    tgt as (select d.id as run_id, d.title, d.days, d.d, case when d.d = 1 then 'start_due' else 'start_due_' || d.d end as slot, mm.id as member_id
            from due d join rc_runs rr on rr.id = d.id join rc_members mm on mm.active and rc_private.can_start(mm, rr)),
    tgt2 as (select * from tgt t where not exists (select 1 from rc_remind_sent x where x.run_id = t.run_id and x.member_id = t.member_id and x.slot = t.slot)),
    ins as (insert into rc_remind_sent (run_id, member_id, slot) select run_id, member_id, slot from tgt2 on conflict do nothing returning 1)
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth,
      'title', '9076 RoadBook · è ora di partire',
      'body', case when t.days > 1 then 'Giorno ' || t.d || ' · ' else '' end || 'Fai partire «' || t.title || '»: apri l''app e tocca il pulsante.',
      'tag', 'startdue-' || t.run_id || '-' || t.d, 'ttl', 3600)), '[]'::jsonb)
      into cm from tgt2 t join rc_push p on p.member_id = t.member_id;
    msgs := msgs || coalesce(cm, '[]'::jsonb);
  elsif p_kind = 'start' then
    /* si parte: a tutti i soci attivi tranne chi ha fatto partire */
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth,
      'title', '9076 RoadBook · si parte!',
      'body', '«' || r.title || '» ' || case when r.days > 1 then 'giorno ' || coalesce(r.started_day, 1) || ': ' else '' end || 'è partito. Apri l''app e tocca «Ho visto».',
      'tag', 'start-' || r.id || '-' || coalesce(r.started_day, 1), 'ttl', 7200)), '[]'::jsonb)
      into msgs from rc_runs r join rc_members mm on mm.active and mm.id is distinct from r.started_by join rc_push p on p.member_id = mm.id
      where r.id = nullif(p_endpoint, '')::uuid and r.started_at > now() - interval '30 minutes';
  elsif p_kind = 'restart' then
    /* si riparte: a chi partecipa al Run e a chi può farlo partire, tranne chi lo annuncia */
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth,
      'title', '9076 RoadBook · si riparte!',
      'body', '«' || r.title || '»: ' || case when h.restart_at <= now() + interval '1 minute' then 'si riparte ora, tutti in sella!'
              else 'si riparte alle ' || to_char(h.restart_at at time zone 'Europe/Rome', 'HH24:MI') || '.' end,
      'tag', 'restart-' || r.id, 'ttl', 1800)), '[]'::jsonb)
      into msgs from rc_run_halts h join rc_runs r on r.id = h.run_id
      join rc_members mm on mm.active and mm.id is distinct from h.called_by
        and (rc_private.can_start(mm, r) or exists (select 1 from rc_signups g where g.run_id = r.id and g.member_id = mm.id and g.status = 'si'))
      join rc_push p on p.member_id = mm.id
      where h.id = nullif(p_endpoint, '')::uuid and h.restart_at > now() - interval '5 minutes';
  elsif p_kind = 'req' then
    /* richiesta dopo la scadenza o a posti esauriti: a chi gestisce le iscrizioni (p_endpoint = run:socio) */
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth,
      'title', '9076 RoadBook · richiesta da approvare',
      'body', trim(coalesce(sm.first_name, '') || ' ' || coalesce(sm.last_name, '')) || case s.pending when 'cancel' then ' chiede di annullare l''iscrizione a «' else ' chiede di partecipare a «' end || r.title || '».',
      'tag', 'req-' || r.id || '-' || sm.id, 'ttl', 86400)), '[]'::jsonb)
      into msgs from rc_signups s join rc_runs r on r.id = s.run_id join rc_members sm on sm.id = s.member_id
      join rc_members t on t.active and t.id <> s.member_id and rc_private.can(t.title, 'signups_manage') join rc_push p on p.member_id = t.id
      where s.pending is not null and s.run_id = nullif(split_part(p_endpoint, ':', 1), '')::uuid and s.member_id = nullif(split_part(p_endpoint, ':', 2), '')::uuid;
  elsif p_kind = 'req_done' then
    /* risposta al socio (p_endpoint = run:socio:join|cancel:1|0) */
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth,
      'title', '9076 RoadBook · ' || r.title,
      'body', case split_part(p_endpoint, ':', 3) || split_part(p_endpoint, ':', 4)
                when 'join1' then 'Richiesta approvata: sei iscritto.' when 'join0' then 'Richiesta di partecipazione non approvata.'
                when 'cancel1' then 'Annullamento approvato: non sei più iscritto.' else 'Annullamento non approvato: resti iscritto.' end,
      'tag', 'reqdone-' || r.id, 'ttl', 86400)), '[]'::jsonb)
      into msgs from rc_runs r join rc_push p on p.member_id = nullif(split_part(p_endpoint, ':', 2), '')::uuid
      where r.id = nullif(split_part(p_endpoint, ':', 1), '')::uuid;
  else
    msgs := rc_private.push_extra(p_kind, p_endpoint);
  end if;
  return jsonb_build_object('ok', true, 'pub', rc_private.vsec('rc_vapid_pub'), 'priv', rc_private.vsec('rc_vapid_priv'), 'msgs', msgs);
end $function$;

select to_regclass('public.rc_lost') is not null as table_ok,
  to_regprocedure('public.rc_lost_pos(text,uuid,double precision,double precision,integer)') is not null as rpc_ok,
  pg_get_functiondef('public.rc_sync(text)'::regprocedure) like '%rc_private.sync_extra(m)%' as sync_ok,
  pg_get_functiondef('public.rc_push_msgs(text,text,text)'::regprocedure) like '%rc_private.push_extra(p_kind, p_endpoint)%' as push_ok;
