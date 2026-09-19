-- PREPARATION LOCALE UNIQUEMENT — NE PAS APPLIQUER SANS GATE/AUTORISATION SEPARES.
-- Source de vérité auditable des décisions PDG de prime mensuelle par Agent.

begin;

create table if not exists public.bilan_bonus_beneficiaries (
  beneficiary_id uuid primary key default gen_random_uuid(),
  display_name text not null,
  agency text not null check (agency in ('COO', 'FIH', 'LSHI', 'KLZ')),
  active boolean not null default true,
  auth_agent_id uuid references auth.users(id) on delete set null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency, display_name),
  unique (auth_agent_id)
);

create table if not exists public.bilan_monthly_agent_bonuses (
  id uuid primary key default gen_random_uuid(),
  month_origin date not null check (month_origin = date_trunc('month', month_origin)::date),
  beneficiary_id uuid not null references public.bilan_bonus_beneficiaries(beneficiary_id) on delete restrict,
  agency text not null check (agency in ('COO', 'FIH', 'LSHI', 'KLZ')),
  amount_usd numeric(12,2),
  status text not null default 'A_DEFINIR' check (status in ('A_DEFINIR', 'CERTIFIEE', 'PAYEE')),
  decided_at timestamptz,
  decided_by text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bilan_bonus_amount_state_ck check (
    (status = 'A_DEFINIR' and amount_usd is null)
    or (status in ('CERTIFIEE', 'PAYEE') and amount_usd is not null and amount_usd >= 0)
  ),
  unique (month_origin, beneficiary_id)
);

create index if not exists bilan_monthly_agent_bonuses_month_agency_idx
  on public.bilan_monthly_agent_bonuses (month_origin, agency);

alter table public.bilan_monthly_agent_bonuses enable row level security;
alter table public.bilan_bonus_beneficiaries enable row level security;
revoke all on table public.bilan_bonus_beneficiaries from public, anon, authenticated;
revoke all on table public.bilan_monthly_agent_bonuses from public, anon, authenticated;
grant select, insert, update on table public.bilan_bonus_beneficiaries to service_role;
grant select, insert, update on table public.bilan_monthly_agent_bonuses to service_role;

comment on table public.bilan_monthly_agent_bonuses is
  'Configuration BILAN séparée: décisions PDG de prime par Agent et mois; aucune écriture Dépenses/Caisse.';
comment on table public.bilan_bonus_beneficiaries is
  'Personnel bénéficiaire Prime indépendant de Supabase Auth; auth_agent_id et email restent facultatifs.';

commit;
