-- DECISION PDG CERTIFIEE — AOUT 2026 UNIQUEMENT.
-- A appliquer seulement après 023_bilan_monthly_agent_bonuses.sql.
-- Ne crée aucun compte Auth, aucun email, aucune Dépense et aucun mouvement Caisse.

begin;

with people(display_name, agency) as (values
  ('Christian Sacre','COO'), ('Kiss Esda BOMEME','COO'), ('Trésor','COO'), ('Yannick','COO'),
  ('Jean Remy Ilela','FIH'), ('Sera NGBANZO','FIH'), ('Benedicte Ngbanzo','FIH'), ('Paul Ngbanzo','FIH'),
  ('Clever KAYEMBE','LSHI'), ('Isaac ILELA','LSHI'), ('Prisca Ilela','LSHI'),
  ('Maman Deborah','KLZ')
)
insert into public.bilan_bonus_beneficiaries(display_name, agency, auth_agent_id)
select p.display_name, p.agency,
  (select a.id from public.agents a
   where a.actif = true and upper(trim(a.role)) = 'AGENT'
     and upper(trim(a.agence)) in (p.agency, case when p.agency='COO' then 'COTONOU' else p.agency end)
     and lower(trim(a.nom)) = lower(p.display_name)
   limit 1)
from people p
on conflict (agency, display_name) do update
set auth_agent_id = coalesce(public.bilan_bonus_beneficiaries.auth_agent_id, excluded.auth_agent_id),
    updated_at = now();

insert into public.bilan_monthly_agent_bonuses(
  month_origin, beneficiary_id, agency, amount_usd, status, decided_at, decided_by, note
)
select date '2026-08-01', beneficiary_id, agency, 50.00, 'CERTIFIEE', now(),
  'PDG_CERTIFIED_DECISION', 'Décision PDG août 2026 : 50 USD par personne.'
from public.bilan_bonus_beneficiaries
where (agency, display_name) in (
  ('COO','Christian Sacre'), ('COO','Kiss Esda BOMEME'), ('COO','Trésor'), ('COO','Yannick'),
  ('FIH','Jean Remy Ilela'), ('FIH','Sera NGBANZO'), ('FIH','Benedicte Ngbanzo'), ('FIH','Paul Ngbanzo'),
  ('LSHI','Clever KAYEMBE'), ('LSHI','Isaac ILELA'), ('LSHI','Prisca Ilela'), ('KLZ','Maman Deborah')
)
on conflict (month_origin, beneficiary_id) do update
set amount_usd=excluded.amount_usd, status=excluded.status, decided_at=excluded.decided_at,
    decided_by=excluded.decided_by, note=excluded.note, updated_at=now();

do $$
declare c bigint; linked bigint; total numeric;
begin
  select count(*), count(auth_agent_id) into c, linked
  from public.bilan_bonus_beneficiaries
  where (agency, display_name) in (
    ('COO','Christian Sacre'), ('COO','Kiss Esda BOMEME'), ('COO','Trésor'), ('COO','Yannick'),
    ('FIH','Jean Remy Ilela'), ('FIH','Sera NGBANZO'), ('FIH','Benedicte Ngbanzo'), ('FIH','Paul Ngbanzo'),
    ('LSHI','Clever KAYEMBE'), ('LSHI','Isaac ILELA'), ('LSHI','Prisca Ilela'), ('KLZ','Maman Deborah'));
  select sum(amount_usd) into total from public.bilan_monthly_agent_bonuses where month_origin=date '2026-08-01';
  if c <> 12 then raise exception 'BILAN_BONUS_BENEFICIARY_COUNT_MISMATCH'; end if;
  if linked <> 7 then raise exception 'BILAN_BONUS_AUTH_LINK_COUNT_MISMATCH'; end if;
  if total <> 600 then raise exception 'BILAN_BONUS_TOTAL_MISMATCH'; end if;
end $$;

commit;
