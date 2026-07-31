with expected_roles(role_name) as (
  values
    ('anon'::name),
    ('authenticated'::name),
    ('service_role'::name)
),
expected_privileges(privilege_name) as (
  values
    ('SELECT'::text),
    ('INSERT'::text),
    ('UPDATE'::text),
    ('DELETE'::text),
    ('TRUNCATE'::text),
    ('REFERENCES'::text),
    ('TRIGGER'::text)
),
privilege_matrix as (
  select
    expected_roles.role_name,
    expected_privileges.privilege_name,
    has_table_privilege(
      expected_roles.role_name,
      'public.agents',
      expected_privileges.privilege_name
    ) as allowed
  from expected_roles
  cross join expected_privileges
),
public_privilege_matrix as (
  select
    'PUBLIC'::name as role_name,
    expected_privileges.privilege_name,
    exists (
      select 1
      from pg_catalog.pg_class as relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) as privilege
      where relation.oid = 'public.agents'::regclass
        and privilege.grantee = 0
        and privilege.privilege_type = expected_privileges.privilege_name
    ) as allowed
  from expected_privileges
),
all_privileges as (
  select role_name, privilege_name, allowed
  from privilege_matrix
  union all
  select role_name, privilege_name, allowed
  from public_privilege_matrix
)
select
  role_name,
  jsonb_object_agg(privilege_name, allowed order by privilege_name) as privileges
from all_privileges
group by role_name
order by role_name;
