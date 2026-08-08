begin;

create table public.internal_notifications (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  agency text not null check (agency in ('COO','FIH','LSHI','KLZ')),
  type text not null check (type in ('PAYMENT','EXPENSE','STORAGE_ARRIVAL','STORAGE_EXIT','CASH')),
  title text not null,
  message text not null,
  actor_user_id uuid references auth.users(id),
  actor_name text not null,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);

create index internal_notifications_agency_occurred_idx
  on public.internal_notifications (agency, occurred_at desc);

create table public.internal_notification_reads (
  notification_id uuid not null references public.internal_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key (notification_id, user_id)
);

alter table public.internal_notifications enable row level security;
alter table public.internal_notifications force row level security;
alter table public.internal_notification_reads enable row level security;
alter table public.internal_notification_reads force row level security;

revoke all on public.internal_notifications, public.internal_notification_reads from public, anon, authenticated, service_role;
grant select on public.internal_notifications to authenticated;
grant select, insert on public.internal_notification_reads to authenticated;
grant select, insert on public.internal_notifications, public.internal_notification_reads to service_role;

create policy internal_notifications_read on public.internal_notifications for select to authenticated using (
  exists (
    select 1 from public.agents a where a.id = auth.uid() and a.actif = true and (
      upper(trim(a.role)) = 'ADMIN' or
      (upper(trim(a.role)) = 'AGENT' and
       (case upper(trim(a.agence)) when 'COTONOU' then 'COO' else upper(trim(a.agence)) end) = internal_notifications.agency)
    )
  )
);

create policy internal_notification_reads_select on public.internal_notification_reads
  for select to authenticated using (user_id = auth.uid());
create policy internal_notification_reads_insert on public.internal_notification_reads
  for insert to authenticated with check (
    user_id = auth.uid() and exists (
      select 1 from public.internal_notifications n where n.id = notification_id
    )
  );

commit;
