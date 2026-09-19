begin;

alter table public.internal_notifications
  add column if not exists audience_role text not null default 'ALL';

alter table public.internal_notifications drop constraint if exists internal_notifications_type_check;
alter table public.internal_notifications add constraint internal_notifications_type_check
  check (type in ('PAYMENT','EXPENSE','STORAGE_ARRIVAL','STORAGE_EXIT','CASH','TRANSFER'));

alter table public.internal_notifications drop constraint if exists internal_notifications_audience_role_check;
alter table public.internal_notifications add constraint internal_notifications_audience_role_check
  check (audience_role in ('ALL','AGENT','ADMIN'));

drop policy if exists internal_notifications_read on public.internal_notifications;
create policy internal_notifications_read on public.internal_notifications for select to authenticated using (
  exists (
    select 1 from public.agents a where a.id = auth.uid() and a.actif = true and (
      upper(trim(a.role)) = 'ADMIN' or
      (upper(trim(a.role)) = 'AGENT' and internal_notifications.audience_role in ('ALL','AGENT') and
       (case upper(trim(a.agence)) when 'COTONOU' then 'COO' else upper(trim(a.agence)) end) = internal_notifications.agency)
    )
  )
);

commit;
