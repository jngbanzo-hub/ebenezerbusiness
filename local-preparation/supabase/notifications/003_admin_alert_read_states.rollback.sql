begin;
drop function if exists public.mark_admin_alerts_read_server(uuid, text[]);
drop function if exists public.sync_admin_alert_read_states_server(uuid, text[]);
drop table if exists public.admin_alert_read_states;
commit;
