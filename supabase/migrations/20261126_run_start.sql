-- 9076 RoadBook 4.7.0 · partenza del Run e avviso a tutti
-- Chi può far partire: Direttore, Vice direttore, Amministratore e l'incaricato scelto nel Run (starter_id).

alter table public.rc_runs add column if not exists starter_id uuid references public.rc_members(id) on delete set null;
alter table public.rc_runs add column if not exists started_at timestamptz;
alter table public.rc_runs add column if not exists started_by uuid references public.rc_members(id) on delete set null;

create table if not exists public.rc_run_ack (
  run_id uuid not null references public.rc_runs(id) on delete cascade,
  member_id uuid not null references public.rc_members(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (run_id, member_id)
);
alter table public.rc_run_ack enable row level security;

create or replace function rc_private.can_start(m public.rc_members, r public.rc_runs) returns boolean
 language sql stable set search_path to 'public', 'rc_private'
as $$ select m.id is not null and m.active and (m.title in ('admin', 'direttore', 'vice_direttore') or m.id = r.starter_id) $$;

/* far partire il Run: da 2 ore prima del ritrovo a 12 ore dopo, una sola volta */
create or replace function public.rc_run_start(p_code text, p_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members; r rc_runs;
begin
  m := rc_private.auth(p_code); if m.id is null then return rc_private.err('auth'); end if;
  select * into r from rc_runs where id = p_id for update;
  if r.id is null then return rc_private.err('non_trovato'); end if;
  if not rc_private.can_start(m, r) then return rc_private.err('forbidden'); end if;
  if r.status <> 'programmato' then return rc_private.err('dati_non_validi'); end if;
  if r.started_at is not null then return jsonb_build_object('ok', true, 'already', true); end if;
  if now() < r.run_date - interval '2 hours' or now() > r.run_date + interval '12 hours' then return rc_private.err('fuori_orario'); end if;
  update rc_runs set started_at = now(), started_by = m.id, updated_at = now() where id = p_id;
  insert into rc_run_ack (run_id, member_id) values (p_id, m.id) on conflict do nothing;
  perform net.http_post(
    url := 'https://qaffjgvnexaditlovwea.supabase.co/functions/v1/sos-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-key', rc_private.vsec('rc_push_key')),
    body := jsonb_build_object('kind', 'start', 'run', p_id), timeout_milliseconds := 8000);
  return jsonb_build_object('ok', true);
end $function$;

/* "Ho visto" sull'avviso di partenza */
create or replace function public.rc_run_ack(p_code text, p_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'rc_private'
as $function$
declare m rc_members;
begin
  m := rc_private.auth(p_code); if m.id is null then return rc_private.err('auth'); end if;
  if not exists (select 1 from rc_runs where id = p_id and started_at is not null) then return rc_private.err('non_trovato'); end if;
  insert into rc_run_ack (run_id, member_id) values (p_id, m.id) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.rc_run_start(text, uuid) from public;
revoke all on function public.rc_run_ack(text, uuid) from public;
grant execute on function public.rc_run_start(text, uuid) to anon, authenticated;
grant execute on function public.rc_run_ack(text, uuid) to anon, authenticated;

/* salvataggio del Run: incaricato della partenza (deve essere un socio attivo) */
do $$
declare src text;
begin
  select pg_get_functiondef('public.rc_run_save(text,jsonb)'::regprocedure) into src;
  if position('starter_id' in src) = 0 then
    src := replace(src, 'perform rc_private.weather_request(v_id, true);',
      'update rc_runs set starter_id = (select id from rc_members where id = nullif(p->>''starter_id'', '''')::uuid and active) where id = v_id;
  perform rc_private.weather_request(v_id, true);');
    execute src;
  end if;
end $$;

/* sincronizzazione: dati della partenza nei Run e i miei "Ho visto" */
do $$
declare src text;
begin
  select pg_get_functiondef('public.rc_sync(text)'::regprocedure) into src;
  if position('started_at' in src) = 0 then
    src := replace(src, '|| jsonb_build_object(''review'', case when rt then r.review else ''{}''::jsonb end)',
      '|| jsonb_build_object(''review'', case when rt then r.review else ''{}''::jsonb end)
    || jsonb_build_object(''starter_id'', r.starter_id, ''started_at'', r.started_at, ''started_by'', r.started_by)');
    src := replace(src, 'return res || jsonb_build_object(''runs'', fixed);',
      'return res || jsonb_build_object(''runs'', fixed, ''acks'', coalesce((select jsonb_agg(a.run_id) from rc_run_ack a join rc_runs rr on rr.id = a.run_id where a.member_id = m.id and rr.started_at > now() - interval ''2 days''), ''[]''::jsonb));');
    execute src;
  end if;
end $$;

/* notifiche: "è ora di partire" a chi può far partire, "si parte" a tutti i soci attivi */
do $$
declare src text;
begin
  select pg_get_functiondef('public.rc_push_msgs(text,text,text)'::regprocedure) into src;
  if position('start_due' in src) = 0 then
    src := replace(src, '''Roadbook · ', '''9076 RoadBook · ');
    src := replace(src, '    msgs := msgs || coalesce(cm, ''[]''::jsonb);',
'    msgs := msgs || coalesce(cm, ''[]''::jsonb);
    /* è ora di partire: una volta, dall''ora del ritrovo fino a 30 minuti dopo */
    with due as (select r.* from rc_runs r where r.status = ''programmato'' and r.started_at is null
                   and now() >= r.run_date - interval ''5 minutes'' and now() < r.run_date + interval ''30 minutes''),
    tgt as (select d.id as run_id, d.title, mm.id as member_id from due d join rc_members mm on mm.active and rc_private.can_start(mm, d)
            where not exists (select 1 from rc_remind_sent x where x.run_id = d.id and x.member_id = mm.id and x.slot = ''start_due'')),
    ins as (insert into rc_remind_sent (run_id, member_id, slot) select run_id, member_id, ''start_due'' from tgt on conflict do nothing returning 1)
    select coalesce(jsonb_agg(jsonb_build_object(''endpoint'', p.endpoint, ''p256dh'', p.p256dh, ''auth'', p.auth,
      ''title'', ''9076 RoadBook · è ora di partire'', ''body'', ''Fai partire «'' || t.title || ''»: apri l''''app e tocca il pulsante.'',
      ''tag'', ''startdue-'' || t.run_id, ''ttl'', 3600)), ''[]''::jsonb)
      into cm from tgt t join rc_push p on p.member_id = t.member_id;
    msgs := msgs || coalesce(cm, ''[]''::jsonb);');
    src := replace(src, '  else
    msgs := ''[]''::jsonb;',
'  elsif p_kind = ''start'' then
    /* si parte: a tutti i soci attivi tranne chi ha fatto partire */
    select coalesce(jsonb_agg(jsonb_build_object(''endpoint'', p.endpoint, ''p256dh'', p.p256dh, ''auth'', p.auth,
      ''title'', ''9076 RoadBook · si parte!'', ''body'', ''«'' || r.title || ''» è partito. Apri l''''app e tocca «Ho visto».'',
      ''tag'', ''start-'' || r.id, ''ttl'', 7200)), ''[]''::jsonb)
      into msgs from rc_runs r join rc_members mm on mm.active and mm.id is distinct from r.started_by join rc_push p on p.member_id = mm.id
      where r.id = nullif(p_endpoint, '''')::uuid and r.started_at > now() - interval ''30 minutes'';
  else
    msgs := ''[]''::jsonb;');
    execute src;
  end if;
end $$;
