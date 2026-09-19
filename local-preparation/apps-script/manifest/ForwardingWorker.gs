/** Endpoint dédié au worker. À brancher dans le doPost existant sans modifier ses autres actions. */
function doPost(e) {
  if (!e || !e.parameter || e.parameter.action !== 'forwarding-manifest-worker') {
    return reponseWorkerForwarding_({success:false,errorCode:'ACCESS_DENIED'});
  }
  return traiterWorkerForwarding_(e);
}

function traiterWorkerForwarding_(e) {
  try {
    var corps = JSON.parse(String(e.postData && e.postData.contents || '{}'));
    var attendu = PropertiesService.getScriptProperties().getProperty('FORWARDING_MANIFEST_WORKER_TOKEN');
    var fourni = String(corps.token || '');
    if (!attendu || !fourni || !comparaisonConstanteForwarding_(attendu, fourni)) return reponseWorkerForwarding_({success:false,errorCode:'ACCESS_DENIED'});
    if (corps.action !== 'PROJECT_FORWARDING_MANIFEST' || !corps.job) throw new Error('INVALID_WORKER_COMMAND');
    return reponseWorkerForwarding_(projeterJobForwarding_(corps.job));
  } catch (erreur) {
    var code = normaliserErreurWorkerForwarding_(erreur);
    return reponseWorkerForwarding_({success:true,outcome:code==='MANIFEST_SOURCE_AMBIGUOUS'?'AMBIGUOUS':'RETRY',errorCode:code});
  }
}

function projeterJobForwarding_(job) {
  if (job.sync_state === 'AWAITING_PAYMENT' || job.sync_state === 'SYNCED') throw new Error('INELIGIBLE_SYNC_STATE');
  if (job.manifest_sheet !== job.origin_agency) throw new Error('MANIFEST_ORIGIN_MISMATCH');
  if (!job.payment_request_id || !job.cash_event_id || Number(job.amount_paid) !== Number(job.amount_expected)) throw new Error('FORWARDING_CANONICAL_PAYMENT_REQUIRED');
  var classeur=SpreadsheetApp.getActiveSpreadsheet(),feuille=classeur.getSheetByName(job.origin_agency);
  if(!feuille)throw new Error('MANIFEST_SOURCE_SHEET_NOT_FOUND');
  var trace={forwardingId:job.forwarding_id,paymentRequestId:job.payment_request_id,cashEventId:job.cash_event_id,paymentDatetime:job.payment_datetime,amountPaid:job.amount_paid,originAgency:job.origin_agency,destinationAgency:job.destination_agency,manifestSheet:job.manifest_sheet,manifestSourceTrackingCode:job.manifest_source_tracking_code,manifestSourceWeight:job.manifest_source_weight,manifestSourceFingerprint:job.manifest_source_fingerprint};
  var ligne=certifierLigneManifesteForwarding_(feuille,trace),cellule=feuille.getRange(ligne,7),actuel=String(cellule.getDisplayValue()||'');
  var natif=actuel.split('\n').filter(function(ligneTexte){return ligneTexte.indexOf('ACHEMINEMENT PAYÉ')===-1;}).join('\n').trim()||'⚪ EN ATTENTE';
  var toutes=chargerTracesForwardingCertifieesPayees_().filter(function(item){return item.manifestSheet===job.origin_agency&&certifierLigneManifesteForwarding_(feuille,item)===ligne;});
  var attendu=composerPaiementAvecAcheminements_(natif,toutes);
  if(actuel!==attendu)cellule.setValue(attendu);
  SpreadsheetApp.flush();
  if(String(cellule.getDisplayValue()||'')!==attendu)throw new Error('MANIFEST_PROJECTION_NOT_CONFIRMED');
  return {success:true,outcome:'SYNCED',manifestSourceRow:ligne,manifestSourceFingerprint:job.manifest_source_fingerprint};
}
function comparaisonConstanteForwarding_(a,b){if(a.length!==b.length)return false;var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function normaliserErreurWorkerForwarding_(e){var message=String(e&&e.message||e||'MANIFEST_SYNC_UNAVAILABLE');return /^[A-Z0-9_]+$/.test(message)?message:'MANIFEST_SYNC_UNAVAILABLE';}
function reponseWorkerForwarding_(objet){return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);}
