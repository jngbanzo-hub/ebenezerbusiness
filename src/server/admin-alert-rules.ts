export type AdminAlertLevel = "INFO" | "ATTENTION" | "IMPORTANT";
export type AdminAlertCategory = "QR" | "STOCKAGE" | "ENCAISSEMENTS" | "CAISSE" | "DÉPENSES" | "COHÉRENCE COLIS";
export type AdminAlert = { id: string; level: AdminAlertLevel; category: AdminAlertCategory; title: string; agency: "COO" | "FIH" | "LSHI" | "KLZ" | "TOUTES"; trackingCode: string | null; occurredAt: string; description: string; sources: string[] };

export function qrStockAlert(unassigned: number, occurredAt: string, existing: {level:"LOW"|"VERY_LOW";title:string;message:string}|null): AdminAlert[] {
  if (!existing) return [];
  return [{ id: "qr-stock", level: existing.level === "VERY_LOW" ? "IMPORTANT" : "ATTENTION", category: "QR", title: existing.title.replace(/^(IMPORTANT|ATTENTION) — /,""), agency: "TOUTES", trackingCode: null, occurredAt, description: existing.message, sources: ["Registre QR Supabase"] }];
}

export function staleStorageAlert(item: { trackingCode: string; agency: "FIH"|"LSHI"|"KLZ"; updatedAt: string }, now: Date, days: number): AdminAlert | null {
  const age = Math.floor((now.getTime() - Date.parse(item.updatedAt)) / 86_400_000); if (!Number.isFinite(age) || age < days) return null;
  return { id: `storage-stale:${item.agency}:${item.trackingCode}`, level: "ATTENTION", category: "STOCKAGE", title: "COLIS EN STOCK SANS ÉVOLUTION RÉCENTE", agency: item.agency, trackingCode: item.trackingCode, occurredAt: item.updatedAt, description: `Aucune évolution Stockage V2 depuis ${age} jours. Seuil configuré : ${days} jours.`, sources: ["Stockage V2"] };
}

export function paymentAlerts(item: { id: string; trackingCode: string; agency: "COO"|"FIH"|"LSHI"|"KLZ"; expected: number|null; paid: number; status: string; occurredAt: string }, now: Date, partialDays: number): AdminAlert[] {
  const alerts: AdminAlert[]=[]; const age=Math.floor((now.getTime()-Date.parse(item.occurredAt))/86_400_000);
  if (item.expected !== null && item.paid > item.expected) alerts.push({ id:`payment-over:${item.id}`,level:"ATTENTION",category:"ENCAISSEMENTS",title:"MONTANT PAYÉ SUPÉRIEUR AU MONTANT ATTENDU",agency:item.agency,trackingCode:item.trackingCode,occurredAt:item.occurredAt,description:`Attendu : ${item.expected}. Payé : ${item.paid}.`,sources:["Encaissements"] });
  if (item.agency==="COO" && /PARTIEL/i.test(item.status) && Number.isFinite(age) && age>=partialDays) alerts.push({ id:`payment-partial:${item.id}`,level:"ATTENTION",category:"ENCAISSEMENTS",title:"PAIEMENT PARTIEL COO ANCIEN",agency:"COO",trackingCode:item.trackingCode,occurredAt:item.occurredAt,description:`Paiement partiel sans solde depuis ${age} jours. Seuil configuré : ${partialDays} jours.`,sources:["Encaissements"] });
  return alerts;
}

export function consistencyAlerts(code: string, result: {state:"COHERENT"|"MULTIPLE_MANIFEST_MATCHES"|"INCONSISTENT";manifestMatchCount:number;manifestDetails:string[];inconsistencies:string[]}, occurredAt: string): AdminAlert[] {
  if(result.state==="INCONSISTENT") return [{id:`consistency:${code}`,level:"ATTENTION",category:"COHÉRENCE COLIS",title:"INCOHÉRENCE À VÉRIFIER",agency:"TOUTES",trackingCode:code,occurredAt,description:result.inconsistencies.join(" "),sources:["MANIFESTE","QR","Stockage V2"]}];
  if(result.state==="MULTIPLE_MANIFEST_MATCHES") return [{id:`manifest-multiple:${code}`,level:"INFO",category:"COHÉRENCE COLIS",title:"PLUSIEURS CORRESPONDANCES MANIFESTE TROUVÉES",agency:"TOUTES",trackingCode:code,occurredAt,description:`${result.manifestMatchCount} occurrences MANIFESTE : ${result.manifestDetails.join(" · ")}. Cette information n'est pas une incohérence inter-sources.`,sources:["MANIFESTE"]}];
  return [];
}

export function sourceUnavailable(category: AdminAlertCategory, occurredAt: string): AdminAlert { return {id:`source-unavailable:${category}`,level:"ATTENTION",category,title:"SOURCE TEMPORAIREMENT INDISPONIBLE",agency:"TOUTES",trackingCode:null,occurredAt,description:`La lecture ${category} est temporairement indisponible. Les autres catégories restent affichées.`,sources:[category]}; }
export function deduplicateAlerts(alerts: AdminAlert[]) { return Array.from(new Map(alerts.map((alert)=>[alert.id,alert])).values()).sort((a,b)=>priority(b.level)-priority(a.level)||b.occurredAt.localeCompare(a.occurredAt)); }
function priority(level:AdminAlertLevel){return level==="IMPORTANT"?3:level==="ATTENTION"?2:1;}
