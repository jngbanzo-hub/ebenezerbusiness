-- LOCAL PREPARATION ONLY. No business tables are changed.
begin;

create table public.bilan_origin_months (
  id uuid primary key default gen_random_uuid(),
  prefix text not null unique check (prefix ~ '^[A-Z]{2,8}$'),
  year integer not null check (year between 2000 and 2199),
  month integer not null check (month between 1 and 12),
  label text not null check (length(btrim(label)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique(year, month)
);
create table public.bilan_origin_month_audit (
  id bigint generated always as identity primary key,
  origin_month_id uuid not null references public.bilan_origin_months(id),
  action text not null check (action in ('CREATE','UPDATE')),
  actor_id uuid,
  old_value jsonb,
  new_value jsonb not null,
  occurred_at timestamptz not null default now()
);

create function public.bilan_origin_month_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if TG_OP = 'DELETE' then raise exception 'ORIGIN_MONTH_DELETE_FORBIDDEN'; end if;
  if new.prefix is null or new.prefix !~ '^[A-Z]{2,8}$' then raise exception 'ORIGIN_MONTH_INVALID_PREFIX'; end if;
  if TG_OP = 'UPDATE' then
    if (new.id,new.prefix,new.year,new.month,new.created_at,new.created_by)
       is distinct from (old.id,old.prefix,old.year,old.month,old.created_at,old.created_by)
    then raise exception 'ORIGIN_MONTH_IDENTITY_IMMUTABLE'; end if;
    new.updated_at := clock_timestamp();
  end if;
  if exists (select 1 from public.bilan_origin_months m where m.id <> new.id
    and (m.prefix like new.prefix || '%' or new.prefix like m.prefix || '%'))
  then raise exception 'ORIGIN_MONTH_PREFIX_CONFLICT'; end if;
  return new;
end $$;
create trigger bilan_origin_month_guard before insert or update or delete on public.bilan_origin_months
for each row execute function public.bilan_origin_month_guard();

create function public.bilan_origin_month_log() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.bilan_origin_month_audit(origin_month_id,action,actor_id,old_value,new_value)
    values (new.id,case when TG_OP='INSERT' then 'CREATE' else 'UPDATE' end,new.updated_by,
      case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end $$;
create trigger bilan_origin_month_log after insert or update on public.bilan_origin_months
for each row execute function public.bilan_origin_month_log();

create function public.bilan_origin_month_create(p_prefix text,p_year integer,p_month integer,p_label text,p_actor uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare result uuid;
begin
  if p_actor is null then raise exception 'ORIGIN_MONTH_ACTOR_REQUIRED'; end if;
  -- All runtime writers use this RPC. Serialize before the validation/INSERT
  -- statement so overlapping prefixes cannot race across server instances.
  lock table public.bilan_origin_months in share row exclusive mode;
  insert into public.bilan_origin_months(prefix,year,month,label,created_by,updated_by)
    values(upper(btrim(p_prefix)),p_year,p_month,btrim(p_label),p_actor,p_actor) returning id into result;
  return result;
end $$;

create function public.bilan_origin_month_update(p_id uuid,p_label text,p_active boolean,p_actor uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_actor is null then raise exception 'ORIGIN_MONTH_ACTOR_REQUIRED'; end if;
  update public.bilan_origin_months set label=btrim(p_label),active=p_active,updated_by=p_actor where id=p_id;
  if not found then raise exception 'ORIGIN_MONTH_NOT_FOUND'; end if;
  return p_id;
end $$;

-- Explicit Admin-supplied mappings. No generated prefix and no reassignment.
insert into public.bilan_origin_months(prefix,year,month,label) values
('JL',2026,7,'Juillet 2026'),('AT',2026,8,'Août 2026'),('SE',2026,9,'Septembre 2026'),
('OT',2026,10,'Octobre 2026'),('NV',2026,11,'Novembre 2026'),('DC',2026,12,'Décembre 2026'),
('JN',2027,1,'Janvier 2027');

alter table public.bilan_origin_months enable row level security;
alter table public.bilan_origin_month_audit enable row level security;
revoke all on public.bilan_origin_months,public.bilan_origin_month_audit from public,anon,authenticated,service_role;
grant select on public.bilan_origin_months,public.bilan_origin_month_audit to service_role;
revoke all on function public.bilan_origin_month_create(text,integer,integer,text,uuid),
  public.bilan_origin_month_update(uuid,text,boolean,uuid),public.bilan_origin_month_guard(),public.bilan_origin_month_log()
  from public,anon,authenticated;
grant execute on function public.bilan_origin_month_create(text,integer,integer,text,uuid),
  public.bilan_origin_month_update(uuid,text,boolean,uuid) to service_role;
commit;
