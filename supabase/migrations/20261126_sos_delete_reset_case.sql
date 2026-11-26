-- 9076 RoadBook 4.6.0
-- 1) eliminazione definitiva di un'emergenza (solo emergency_manage); nel registro resta solo chi e quando
create or replace function public.rc_sos_delete(p_code text, p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'rc_private'
as $function$
declare m rc_members;
begin
  m := rc_private.auth(p_code);
  if m.id is null then return rc_private.err('auth'); end if;
  if not rc_private.can(m.title, 'emergency_manage') then return rc_private.err('forbidden'); end if;
  delete from rc_sos where id = p_id;
  if not found then return rc_private.err('non_trovato'); end if;
  delete from rc_sos_log where sos_id = p_id;
  insert into rc_sos_log (actor, sos_id, action) values (m.id, p_id, 'deleted');
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.rc_sos_delete(text, uuid) from public;
grant execute on function public.rc_sos_delete(text, uuid) to anon, authenticated;

-- 2) reset: la parola di conferma vale in maiuscolo, minuscolo o misto
do $$
declare src text;
begin
  select pg_get_functiondef('public.rc_reset(text,text[],text)'::regprocedure) into src;
  if position('p_confirm is distinct from ''RESET''' in src) > 0 then
    execute replace(src, 'p_confirm is distinct from ''RESET''', 'upper(btrim(coalesce(p_confirm, ''''))) <> ''RESET''');
  end if;
end $$;
