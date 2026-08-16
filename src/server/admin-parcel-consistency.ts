export type ParcelConsistencyInput = {
  manifest: Array<{ agency: string; rowNumber: number }>;
  qr: Array<{ agency: string | null }>;
  storage: Array<{ agency: string; status: string }>;
};

export type ParcelConsistency = {
  state: "COHERENT" | "MULTIPLE_MANIFEST_MATCHES" | "INCONSISTENT";
  manifestMatchCount: number;
  manifestDetails: string[];
  inconsistencies: string[];
};

export function determineParcelConsistency(input: ParcelConsistencyInput): ParcelConsistency {
  const manifestAgencies = unique(input.manifest.map((item) => item.agency));
  const observations: Array<{ source: string; agency: string }> = [];
  if (manifestAgencies.length === 1) observations.push({ source: "MANIFESTE canonique", agency: manifestAgencies[0] });
  unique(input.qr.map((item) => item.agency).filter((value): value is string => Boolean(value))).forEach((agency) => observations.push({ source: "QR actif", agency }));
  unique(input.storage.filter((item) => isActiveStorage(item.status)).map((item) => item.agency)).forEach((agency) => observations.push({ source: "Stockage actif", agency }));
  const observedSources = new Set(observations.map((item) => item.source));
  const observedAgencies = new Set(observations.map((item) => item.agency));
  const inconsistent = observedSources.size >= 2 && observedAgencies.size >= 2;
  return {
    state: inconsistent ? "INCONSISTENT" : input.manifest.length > 1 ? "MULTIPLE_MANIFEST_MATCHES" : "COHERENT",
    manifestMatchCount: input.manifest.length,
    manifestDetails: input.manifest.map((item) => `${item.agency} · ligne ${item.rowNumber}`),
    inconsistencies: inconsistent ? [`Identités actuelles incompatibles : ${observations.map((item) => `${item.source} = ${item.agency}`).join(" ; ")}.`] : []
  };
}

function isActiveStorage(status: string) { return !/(DELIVERED|LIVR|SORTI|CLOSED|CANCEL)/i.test(status); }
function unique(values: string[]) { return Array.from(new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))); }
