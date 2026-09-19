-- READ-ONLY PREFLIGHT. This script creates or modifies nothing.

select
  'required_relations' as check_name,
  to_regclass('public.agents') is not null as agents_exists,
  to_regclass('auth.users') is not null as auth_users_exists,
  to_regclass('public.logistics_events') is not null as logistics_events_exists;

with expected(column_name, accepted_types) as (
  values
    ('id', array['text', 'uuid', 'character varying']),
    ('agence', array['text', 'character varying']),
    ('role', array['text', 'character varying']),
    ('actif', array['boolean'])
),
actual as (
  select column_name, data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'agents'
)
select
  'agents_columns' as check_name,
  expected.column_name,
  actual.data_type,
  actual.column_name is not null as column_exists,
  coalesce(actual.data_type = any(expected.accepted_types), false) as type_valid
from expected
left join actual using (column_name)
order by expected.column_name;

select
  'identity_column_types' as check_name,
  table_schema,
  table_name,
  column_name,
  data_type
from information_schema.columns
where (table_schema, table_name, column_name) in (
  ('public', 'agents', 'id'),
  ('auth', 'users', 'id')
)
order by table_schema, table_name;

select
  'agency_values' as check_name,
  upper(trim(agence)) as stored_agency,
  case upper(trim(agence))
    when 'COTONOU' then 'COO'
    else upper(trim(agence))
  end as canonical_agency,
  count(*) as profile_count,
  upper(trim(agence)) in ('COO', 'COTONOU', 'FIH', 'LSHI', 'KLZ')
    as recognized
from public.agents
group by upper(trim(agence))
order by stored_agency;

select
  'unexpected_roles' as check_name,
  upper(trim(role)) as normalized_role,
  count(*) as profile_count,
  upper(trim(role)) in ('AGENT', 'ADMIN') as recognized
from public.agents
group by upper(trim(role))
order by normalized_role;

select
  'profile_activity' as check_name,
  actif,
  count(*) as profile_count
from public.agents
group by actif
order by actif;

select
  'identity_compatibility' as check_name,
  count(*) filter (where auth_user.id is null) as orphan_agent_profiles,
  count(*) filter (where auth_user.id is not null) as linked_agent_profiles
from public.agents as agent_profile
left join auth.users as auth_user
  on auth_user.id::text = agent_profile.id::text;

select
  'preexisting_logistics_scope' as check_name,
  case
    when to_regclass('public.logistics_events') is null then
      'TABLE_ABSENT'
    else
      'INSPECT_SEPARATELY_BEFORE_002'
  end as status;
