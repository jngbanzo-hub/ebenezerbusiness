export type KlzLshiQuote = Readonly<{trackingCode:string;forwardingReference:string;origin:"KLZ";destination:"LSHI";weightKg:number;rateUsdPerKg:13;amountExpectedUsd:number;readyForDeparture:boolean;readinessCode:string|null}>;
export type KlzLshiDepartureAttempt = Readonly<{fingerprint:string;requestId:string}>;

export function departureFingerprint(quote:KlzLshiQuote){return JSON.stringify({trackingCode:quote.trackingCode,forwardingReference:quote.forwardingReference,weightKg:quote.weightKg});}
export function getOrCreateDepartureAttempt(current:KlzLshiDepartureAttempt|null,quote:KlzLshiQuote,createId:()=>string=()=>crypto.randomUUID()){const fingerprint=departureFingerprint(quote);return current?.fingerprint===fingerprint?current:Object.freeze({fingerprint,requestId:createId()});}
