begin;

delete from public.internal_notification_reads where notification_id in (select id from public.internal_notifications where type = 'TRANSFER');
delete from public.internal_notifications where type = 'TRANSFER';

drop policy if exists internal_notifications_read on public.internal_notifications;
create policy internal_notifications_read on public.internal_notifications for select to authenticated using (
  exists (
    select 1 from public.agents a where a.id = auth.uid() and a.actif = true and (
      upper(trim(a.role)) = 'ADMIN' or
      (upper(trim(a.role)) = 'AGENT' and
       (case upper(trim(a.agence)) when 'COTONOU' then 'COO' else upper(trim(a.agence)) end) = internal_notifications.agency)
    )
  )
);

alter table public.internal_notifications drop constraint if exists internal_notifications_type_check;
alter table public.internal_notifications add constraint internal_notifications_type_check
  check (type in ('PAYMENT','EXPENSE','STORAGE_ARRIVAL','STORAGE_EXIT','CASH'));
alter table public.internal_notifications drop column if exists audience_role;

commit;
