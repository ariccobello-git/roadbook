-- 9076 RoadBook 4.9.0 · iscrizioni: conferma, scadenza, richieste e annullamenti approvati dal direttivo
-- Funzioni riscritte per intero: si può incollare nel SQL Editor così com'è. Richiede la migrazione 20261126_run_days_halts.

alter table public.rc_runs add column if not exists signup_until timestamptz;
alter table public.rc_signups add column if not exists pending text;
alter table public.rc_signups add column if not exists requested_at timestamptz;
alter table public.rc_signups drop constraint if exists rc_signups_pending_check;
alter table public.rc_signups add constraint rc_signups_pending_check check (pending is null or pending in ('join', 'cancel'));

create or replace function rc_private.push_send(p_kind text, p_ref text) returns void
 language plpgsql security definer set search_path to 'public', 'rc_private'
as $$
begin
  perform net.http_post(
    url := 'https://qaffjgvnexaditlovwea.supabase.co/functions/v1/sos-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-key', rc_private.vsec('rc_push_key')),
    body := jsonb_build_object('kind', p_kind, 'run', p_ref), timeout_milliseconds := 8000);
end $$;

/* iscrizione: chi gestisce le iscrizioni agisce sempre direttamente; per gli altri, dopo la scadenza o a posti esauriti,
   «Ci sono» diventa una richiesta e cancellarsi dopo la scadenza diventa una richiesta di annullamento */
create or replace function public.rc_signup(p_code text, p_run uuid, p_status text, p_passengers integer default 0, p_member uuid default null::uuid, p_room text default null::text, p_extras jsonb default null::jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members; sm boolean; target uuid; r rc_runs; taken int; v_ex jsonb; cur rc_signups; closed boolean; full boolean;
begin
  m := rc_private.auth(p_code);
  if m.id is null then return rc_private.err('auth'); end if;
  sm := rc_private.can(m.title, 'signups_manage');
  target := coalesce(p_member, m.id);
  if target <> m.id and not sm then return rc_private.err('forbidden'); end if;
  select * into r from rc_runs where id = p_run;
  if not found then return rc_private.err('non_trovato'); end if;
  if not sm and r.status <> 'programmato' then return rc_private.err('run_chiuso'); end if;
  if not exists (select 1 from rc_members where id = target and active) then return rc_private.err('non_trovato'); end if;
  select * into cur from rc_signups where run_id = p_run and member_id = target;
  closed := not sm and r.signup_until is not null and now() > r.signup_until;
  /* ritiro della mia richiesta in attesa */
  if p_status = 'ritira' then
    if cur.pending = 'join' and cur.status <> 'si' then delete from rc_signups where run_id = p_run and member_id = target;
    elsif cur.pending is not null then update rc_signups set pending = null, requested_at = null where run_id = p_run and member_id = target; end if;
    return jsonb_build_object('ok', true);
  end if;
  /* cancellarsi dopo la scadenza: serve l'approvazione */
  if closed and cur.status = 'si' and p_status in ('no', 'forse', 'rimuovi') then
    update rc_signups set pending = 'cancel', requested_at = now() where run_id = p_run and member_id = target;
    perform rc_private.push_send('req', p_run || ':' || target);
    return jsonb_build_object('ok', true, 'pending', 'cancel');
  end if;
  if p_status = 'rimuovi' then
    delete from rc_signups where run_id = p_run and member_id = target;
    return jsonb_build_object('ok', true);
  end if;
  if p_status not in ('si','forse','no') then return rc_private.err('dati_non_validi'); end if;
  p_passengers := greatest(0, least(coalesce(p_passengers, 0), 1));
  /* p_room: null = lascia com'è, '' = nessuna scelta, altrimenti deve essere una sistemazione del Run */
  if p_room is not null and p_room <> '' and not exists (select 1 from jsonb_array_elements(r.rooms) e where e->>'id' = p_room) then return rc_private.err('dati_non_validi'); end if;
  if p_extras is not null then
    if jsonb_typeof(p_extras) <> 'object' then return rc_private.err('dati_non_validi'); end if;
    if exists (select 1 from jsonb_each(p_extras) e where jsonb_typeof(e.value) <> 'number'
        or not exists (select 1 from jsonb_array_elements(r.extras) x where x->>'id' = e.key)
        or (e.value)::text::numeric < 0 or (e.value)::text::numeric > 20 or (e.value)::text::numeric <> trunc((e.value)::text::numeric)) then return rc_private.err('dati_non_validi'); end if;
    select coalesce(jsonb_object_agg(e.key, e.value) filter (where (e.value)::text::numeric > 0), '{}'::jsonb) into v_ex from jsonb_each(p_extras) e;
  end if;
  if p_status = 'si' and not sm then
    select coalesce(sum(1 + passengers), 0) into taken from rc_signups where run_id = p_run and status = 'si' and member_id <> target;
    full := r.max_participants is not null and taken + 1 + p_passengers > r.max_participants;
    if cur.status is distinct from 'si' and (closed or full) then
      /* richiesta di partecipazione: decide il direttivo */
      insert into rc_signups (run_id, member_id, status, passengers, room, extras, pending, requested_at)
        values (p_run, target, coalesce(cur.status, 'forse'), p_passengers, nullif(p_room, ''), coalesce(v_ex, '{}'::jsonb), 'join', now())
      on conflict (run_id, member_id) do update set passengers = excluded.passengers, pending = 'join', requested_at = now(), updated_at = now(),
        room = case when p_room is null then rc_signups.room else nullif(p_room, '') end,
        extras = case when p_extras is null then rc_signups.extras else v_ex end;
      perform rc_private.push_send('req', p_run || ':' || target);
      return jsonb_build_object('ok', true, 'pending', 'join', 'reason', case when closed then 'scaduto' else 'completo' end);
    end if;
    if full then return rc_private.err('completo'); end if;
  end if;
  insert into rc_signups (run_id, member_id, status, passengers, room, extras) values (p_run, target, p_status, p_passengers, nullif(p_room, ''), coalesce(v_ex, '{}'::jsonb))
  on conflict (run_id, member_id) do update set status = excluded.status, passengers = excluded.passengers, updated_at = now(), pending = null, requested_at = null,
    room = case when p_room is null then rc_signups.room else nullif(p_room, '') end,
    extras = case when p_extras is null then rc_signups.extras else v_ex end;
  return jsonb_build_object('ok', true);
end $function$;

/* decisione del direttivo su una richiesta: p_ok true approva, false rifiuta; il socio riceve la risposta */
create or replace function public.rc_signup_decide(p_code text, p_run uuid, p_member uuid, p_ok boolean)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members; cur rc_signups; k text;
begin
  m := rc_private.auth(p_code); if m.id is null then return rc_private.err('auth'); end if;
  if not rc_private.can(m.title, 'signups_manage') then return rc_private.err('forbidden'); end if;
  select * into cur from rc_signups where run_id = p_run and member_id = p_member for update;
  if cur.run_id is null or cur.pending is null or p_ok is null then return rc_private.err('non_trovato'); end if;
  k := cur.pending;
  if k = 'join' and p_ok then update rc_signups set status = 'si', pending = null, requested_at = null, updated_at = now() where run_id = p_run and member_id = p_member;
  elsif k = 'join' then
    if cur.status = 'forse' then delete from rc_signups where run_id = p_run and member_id = p_member;
    else update rc_signups set pending = null, requested_at = null where run_id = p_run and member_id = p_member; end if;
  elsif p_ok then delete from rc_signups where run_id = p_run and member_id = p_member;
  else update rc_signups set pending = null, requested_at = null where run_id = p_run and member_id = p_member; end if;
  perform rc_private.push_send('req_done', p_run || ':' || p_member || ':' || k || ':' || case when p_ok then '1' else '0' end);
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.rc_signup_decide(text, uuid, uuid, boolean) from public;
grant execute on function public.rc_signup_decide(text, uuid, uuid, boolean) to anon, authenticated;

/* salvataggio del Run: «Iscrizioni entro» (dopo gli orari dei giorni) */
do $$
declare src text;
begin
  select pg_get_functiondef('public.rc_run_save(text,jsonb)'::regprocedure) into src;
  if position('signup_until' in src) = 0 then
    src := regexp_replace(src, '(update rc_runs set day_starts = [^;]*;)',
      '\1 update rc_runs set signup_until = nullif(p->>''signup_until'', '''')::timestamptz where id = v_id;');
    if position('signup_until' in src) = 0 then raise exception 'rc_run_save: punto di inserimento non trovato'; end if;
    execute src;
  end if;
end $$;

/* sincronizzazione: scadenza iscrizioni e richieste in attesa */
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
      from rc_run_halts h join rc_runs rr on rr.id = h.run_id where rr.run_date > now() - interval '60 days'), '[]'::jsonb));
end $function$;

/* notifiche: come la 4.8.0 più richieste al direttivo e risposte ai soci */
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
    msgs := '[]'::jsonb;
  end if;
  return jsonb_build_object('ok', true, 'pub', rc_private.vsec('rc_vapid_pub'), 'priv', rc_private.vsec('rc_vapid_priv'), 'msgs', msgs);
end $function$;

select pg_get_functiondef('public.rc_run_save(text,jsonb)'::regprocedure) like '%signup_until%' as save_ok,
  to_regprocedure('public.rc_signup_decide(text,uuid,uuid,boolean)') is not null as decide_ok,
  pg_get_functiondef('public.rc_push_msgs(text,text,text)'::regprocedure) like '%p_kind = ''req_done''%' as push_ok,
  pg_get_functiondef('public.rc_sync(text)'::regprocedure) like '%''pending'', s.pending%' as sync_ok;
