-- 9076 RoadBook 4.8.0 · orari di partenza per giorno, soste del gruppo e «Si riparte»
-- Funzioni riscritte per intero (niente sostituzioni di testo): si può incollare nel SQL Editor così com'è.

alter table public.rc_runs add column if not exists day_starts jsonb not null default '{}'::jsonb;
alter table public.rc_runs add column if not exists started_day smallint;
update public.rc_runs set started_day = 1 where started_at is not null and started_day is null;

/* "Ho visto" per giorno */
alter table public.rc_run_ack add column if not exists day smallint not null default 1;
alter table public.rc_run_ack drop constraint if exists rc_run_ack_pkey;
alter table public.rc_run_ack add primary key (run_id, member_id, day);

/* soste del gruppo: una sola aperta per Run */
create table if not exists public.rc_run_halts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.rc_runs(id) on delete cascade,
  day smallint not null default 1,
  lat double precision, lng double precision,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  restart_at timestamptz,
  called_by uuid references public.rc_members(id) on delete set null
);
create unique index if not exists rc_run_halts_open on public.rc_run_halts (run_id) where ended_at is null;
create index if not exists rc_run_halts_run on public.rc_run_halts (run_id, started_at);
alter table public.rc_run_halts enable row level security;

/* orari per giorno: {"2":"08:30", ...}, solo giorni 2..N e orari validi */
create or replace function rc_private.clean_day_starts(j jsonb, days int) returns jsonb
 language sql immutable set search_path to 'public', 'rc_private'
as $$
  select coalesce(jsonb_object_agg(e.key, e.value #>> '{}'), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end) e
  where e.key ~ '^[0-9]{1,2}$' and e.key::int between 2 and days and coalesce(e.value #>> '{}', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
$$;

/* ora di partenza del giorno d (ora di Roma): giorno 1 = data del Run, gli altri all'orario scelto o alla stessa ora */
create or replace function rc_private.day_start(r public.rc_runs, d int) returns timestamptz
 language sql stable set search_path to 'public', 'rc_private'
as $$
  select ((((r.run_date at time zone 'Europe/Rome')::date + (greatest(d, 1) - 1))
    + coalesce(case when d > 1 then nullif(r.day_starts ->> d::text, '')::time end, (r.run_date at time zone 'Europe/Rome')::time)) at time zone 'Europe/Rome')
$$;

/* giorno che si può far partire adesso: da 2 ore prima a 12 ore dopo la sua partenza; null se nessuno */
create or replace function rc_private.next_start_day(r public.rc_runs, t timestamptz) returns int
 language plpgsql stable set search_path to 'public', 'rc_private'
as $$
declare d int; ds timestamptz;
begin
  if r.id is null or r.status <> 'programmato' then return null; end if;
  for d in (case when r.started_at is null then 1 else coalesce(r.started_day, 1) + 1 end) .. greatest(coalesce(r.days, 1), 1) loop
    ds := rc_private.day_start(r, d);
    if t < ds - interval '2 hours' then return null; end if;
    if t <= ds + interval '12 hours' then return d; end if;
  end loop;
  return null;
end $$;

/* far partire il Run (o il giorno successivo) */
create or replace function public.rc_run_start(p_code text, p_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members; r rc_runs; d int;
begin
  m := rc_private.auth(p_code); if m.id is null then return rc_private.err('auth'); end if;
  select * into r from rc_runs where id = p_id for update;
  if r.id is null then return rc_private.err('non_trovato'); end if;
  if not rc_private.can_start(m, r) then return rc_private.err('forbidden'); end if;
  if r.status <> 'programmato' then return rc_private.err('dati_non_validi'); end if;
  d := rc_private.next_start_day(r, now());
  if d is null then
    if r.started_at > now() - interval '15 minutes' then return jsonb_build_object('ok', true, 'already', true); end if;
    return rc_private.err('fuori_orario');
  end if;
  update rc_runs set started_at = now(), started_by = m.id, started_day = d, updated_at = now() where id = p_id;
  update rc_run_halts set ended_at = now() where run_id = p_id and ended_at is null;
  insert into rc_run_ack (run_id, member_id, day) values (p_id, m.id, d) on conflict do nothing;
  perform net.http_post(
    url := 'https://qaffjgvnexaditlovwea.supabase.co/functions/v1/sos-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-key', rc_private.vsec('rc_push_key')),
    body := jsonb_build_object('kind', 'start', 'run', p_id), timeout_milliseconds := 8000);
  return jsonb_build_object('ok', true, 'day', d);
end $function$;

/* "Ho visto" sull'avviso di partenza del giorno in corso */
create or replace function public.rc_run_ack(p_code text, p_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members; r rc_runs;
begin
  m := rc_private.auth(p_code); if m.id is null then return rc_private.err('auth'); end if;
  select * into r from rc_runs where id = p_id and started_at is not null;
  if r.id is null then return rc_private.err('non_trovato'); end if;
  insert into rc_run_ack (run_id, member_id, day) values (p_id, m.id, coalesce(r.started_day, 1)) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $function$;

/* soste: 'stop' apre, 'go' chiude, 'undo' riapre l'ultima (entro 3 minuti), 'call' annuncia la ripartenza tra p_min minuti a chi partecipa */
create or replace function public.rc_run_halt(p_code text, p_id uuid, p_action text, p_lat double precision default null, p_lng double precision default null, p_min int default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members; r rc_runs; hid uuid;
begin
  m := rc_private.auth(p_code); if m.id is null then return rc_private.err('auth'); end if;
  select * into r from rc_runs where id = p_id for update;
  if r.id is null then return rc_private.err('non_trovato'); end if;
  if not rc_private.can_start(m, r) then return rc_private.err('forbidden'); end if;
  if r.status <> 'programmato' or r.started_at is null then return rc_private.err('dati_non_validi'); end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180) then return rc_private.err('dati_non_validi'); end if;
  select id into hid from rc_run_halts where run_id = p_id and ended_at is null;
  if p_action = 'stop' then
    if hid is null then insert into rc_run_halts (run_id, day, lat, lng) values (p_id, coalesce(r.started_day, 1), p_lat, p_lng) returning id into hid; end if;
  elsif p_action = 'go' then
    update rc_run_halts set ended_at = now() where id = hid;
  elsif p_action = 'undo' then
    if hid is null then
      select id into hid from rc_run_halts where run_id = p_id and ended_at > now() - interval '3 minutes' order by ended_at desc limit 1;
      update rc_run_halts set ended_at = null where id = hid;
    end if;
  elsif p_action = 'call' then
    if p_min is null or p_min not in (0, 5, 10, 15) then return rc_private.err('dati_non_validi'); end if;
    if hid is null then insert into rc_run_halts (run_id, day, lat, lng) values (p_id, coalesce(r.started_day, 1), p_lat, p_lng) returning id into hid; end if;
    update rc_run_halts set restart_at = now() + make_interval(mins => p_min), called_by = m.id, ended_at = case when p_min = 0 then now() else null end where id = hid;
    perform net.http_post(
      url := 'https://qaffjgvnexaditlovwea.supabase.co/functions/v1/sos-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-key', rc_private.vsec('rc_push_key')),
      body := jsonb_build_object('kind', 'restart', 'run', hid), timeout_milliseconds := 8000);
  else
    return rc_private.err('dati_non_validi');
  end if;
  return jsonb_build_object('ok', true, 'id', hid);
end $function$;

revoke all on function public.rc_run_halt(text, uuid, text, double precision, double precision, int) from public;
grant execute on function public.rc_run_halt(text, uuid, text, double precision, double precision, int) to anon, authenticated;

/* salvataggio del Run: orari dei giorni successivi (dopo incaricato della partenza) */
do $$
declare src text;
begin
  select pg_get_functiondef('public.rc_run_save(text,jsonb)'::regprocedure) into src;
  if position('day_starts' in src) = 0 then
    src := regexp_replace(src, '(update rc_runs set starter_id = [^;]*;)',
      '\1 update rc_runs set day_starts = rc_private.clean_day_starts(p->''day_starts'', v_days) where id = v_id;');
    if position('day_starts' in src) = 0 then raise exception 'rc_run_save: punto di inserimento non trovato'; end if;
    execute src;
  end if;
end $$;

/* sincronizzazione: partenza per giorno, orari, soste e i miei "Ho visto" (run:giorno) */
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
    || jsonb_build_object('starter_id', r.starter_id, 'started_at', r.started_at, 'started_by', r.started_by, 'started_day', r.started_day, 'day_starts', r.day_starts)
    order by r.run_date), '[]'::jsonb) into fixed
  from jsonb_array_elements(res->'runs') e join rc_runs r on r.id = (e->>'id')::uuid;
  return res || jsonb_build_object('runs', fixed,
    'acks', coalesce((select jsonb_agg(a.run_id::text || ':' || a.day) from rc_run_ack a join rc_runs rr on rr.id = a.run_id where a.member_id = m.id and rr.started_at > now() - interval '2 days'), '[]'::jsonb),
    'halts', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'run_id', h.run_id, 'day', h.day, 'lat', case when rt then h.lat end, 'lng', case when rt then h.lng end,
        'started_at', h.started_at, 'ended_at', h.ended_at, 'restart_at', h.restart_at) order by h.started_at)
      from rc_run_halts h join rc_runs rr on rr.id = h.run_id where rr.run_date > now() - interval '60 days'), '[]'::jsonb));
end $function$;

/* notifiche: promemoria, pagamenti, "è ora di partire" per ogni giorno, "si parte" e "si riparte" */
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
  else
    msgs := '[]'::jsonb;
  end if;
  return jsonb_build_object('ok', true, 'pub', rc_private.vsec('rc_vapid_pub'), 'priv', rc_private.vsec('rc_vapid_priv'), 'msgs', msgs);
end $function$;

select pg_get_functiondef('public.rc_run_save(text,jsonb)'::regprocedure) like '%clean_day_starts%' as save_ok,
  to_regprocedure('public.rc_run_halt(text,uuid,text,double precision,double precision,integer)') is not null as halt_ok,
  pg_get_functiondef('public.rc_push_msgs(text,text,text)'::regprocedure) like '%p_kind = ''restart''%' as push_ok,
  pg_get_functiondef('public.rc_sync(text)'::regprocedure) like '%''halts''%' as sync_ok;
