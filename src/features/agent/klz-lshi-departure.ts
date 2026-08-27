export type KlzLshiQuote = Readonly<{trackingCode:string;forwardingReference:string;origin:"KLZ";destination:"LSHI";weightKg:number;rateUsdPerKg:13;amountExpectedUsd:number;readyForDeparture:boolean;readinessCode:string|null}>;
export type KlzLshiDepartureAttempt = Readonly<{fingerprint:string;requestId:string}>;
export type KlzRoutingDestination = "LSHI" | "FIH";
export type KlzRoutingPreview = Readonly<{trackingCode:string;origin:"KLZ";destination:KlzRoutingDestination;weightKg:number;rateUsdPerKg:13|16;amountExpectedUsd:number}>;

const KLZ_ROUTING_RATES = Object.freeze({LSHI:13,FIH:16} as const);

export function buildKlzRoutingPreview(trackingCode:string,weightKg:number,destination:KlzRoutingDestination):KlzRoutingPreview {
  const normalizedCode=trackingCode.trim().toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(normalizedCode)||!Number.isFinite(weightKg)||weightKg<=0)throw new Error("Colis KLZ invalide pour le devis d’acheminement.");
  const rateUsdPerKg=KLZ_ROUTING_RATES[destination];
  return Object.freeze({trackingCode:normalizedCode,origin:"KLZ",destination,weightKg,rateUsdPerKg,amountExpectedUsd:Math.round(weightKg*rateUsdPerKg*100)/100});
}

export function departureFingerprint(quote:KlzLshiQuote){return JSON.stringify({trackingCode:quote.trackingCode,forwardingReference:quote.forwardingReference,weightKg:quote.weightKg});}
export function getOrCreateDepartureAttempt(current:KlzLshiDepartureAttempt|null,quote:KlzLshiQuote,createId:()=>string=()=>crypto.randomUUID()){const fingerprint=departureFingerprint(quote);return current?.fingerprint===fingerprint?current:Object.freeze({fingerprint,requestId:createId()});}
