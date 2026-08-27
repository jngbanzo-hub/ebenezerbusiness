-- READ ONLY post-migration certification.
select count(*) as total_rows,
       count(parcel_id) as rows_with_parcel_id,
       count(distinct parcel_id) as distinct_parcel_ids,
       count(*) filter(where forwarding_id is null) as native_rows,
       count(*) filter(where forwarding_id is not null) as forwarded_rows
from public.stockage_parcels;

select not exists(select 1 from public.stockage_parcels where forwarding_id is null group by agency,tracking_code having count(*)>1) as native_unique,
       not exists(select 1 from public.stockage_parcels where forwarding_id is not null group by forwarding_id having count(*)>1) as forwarding_unique,
       not exists(select 1 from public.stockage_parcels p left join public.stockage_forwardings f on f.forwarding_id=p.forwarding_id where p.forwarding_id is not null and f.forwarding_id is null) as forwarding_fk_complete;

select conname,pg_get_constraintdef(oid) definition from pg_constraint
where conrelid='public.stockage_parcels'::regclass order by conname;
select indexname,indexdef from pg_indexes where schemaname='public' and tablename='stockage_parcels' order by indexname;
