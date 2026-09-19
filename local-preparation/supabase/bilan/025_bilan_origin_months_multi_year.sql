-- Controlled production migration: allow a business prefix to be reused in a
-- different year while preserving every existing UUID and identity.
begin;

alter table public.bilan_origin_months drop constraint if exists bilan_origin_months_prefix_key;
alter table public.bilan_origin_months add constraint bilan_origin_months_prefix_year_key unique (prefix, year);

create or replace function public.bilan_origin_month_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare expected_month integer;
begin
  if TG_OP = 'DELETE' then raise exception 'ORIGIN_MONTH_DELETE_FORBIDDEN'; end if;
  if new.prefix is null or new.prefix !~ '^[A-Z]{2,8}$' then raise exception 'ORIGIN_MONTH_INVALID_PREFIX'; end if;
  expected_month := case new.prefix
    when 'JA' then 1 when 'FE' then 2 when 'MR' then 3 when 'AV' then 4
    when 'MA' then 5 when 'JN' then 6 when 'JL' then 7 when 'AT' then 8
    when 'SE' then 9 when 'OT' then 10 when 'NV' then 11 when 'DC' then 12
    else null end;
  if expected_month is not null and new.month <> expected_month then raise exception 'ORIGIN_MONTH_PREFIX_MONTH_MISMATCH'; end if;
  if TG_OP = 'UPDATE' then
    if (new.id,new.prefix,new.year,new.month,new.created_at,new.created_by)
       is distinct from (old.id,old.prefix,old.year,old.month,old.created_at,old.created_by)
    then raise exception 'ORIGIN_MONTH_IDENTITY_IMMUTABLE'; end if;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end $$;

commit;
