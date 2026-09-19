import type { Metadata } from "next";
import { AdminGlobalParcelSearch } from "@/features/admin/admin-global-parcel-search";
import { createPageMetadata } from "@/lib/seo";
export const metadata:Metadata=createPageMetadata({title:"Recherche globale colis — Administration",description:"Agrégation Admin en lecture seule des informations colis.",path:"/admin/recherche-globale-colis",noIndex:true});
export default function Page(){return <AdminGlobalParcelSearch/>;}
