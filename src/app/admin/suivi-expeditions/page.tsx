import type { Metadata } from "next";

import { ShipmentTrackingPage } from "@/features/admin/shipment-tracking-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({ title: "Suivi des expéditions — Administration", description: "Mise à jour opérationnelle des statuts de groupage.", path: "/admin/suivi-expeditions", noIndex: true });
export default function Page() { return <ShipmentTrackingPage/>; }
