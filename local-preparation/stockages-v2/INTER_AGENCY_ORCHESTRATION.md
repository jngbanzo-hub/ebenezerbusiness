# Orchestration inter-agences — préparation 009

Ce flux est préparatoire. La migration 009 n’est pas appliquée par cette phase.

## Contrat public

La création accepte uniquement `sourceAgency`, `trackingCode`, `paymentMode`,
`optionalReference`, `optionalObservation` et `paymentRequestId`. L’agence de
destination vient de l’identité Agent authentifiée. Le poids, le tarif, le
montant, la référence et l’état sont recalculés côté serveur.

Le `paymentRequestId` est créé une fois par tentative. Il est conservé après
une réponse réseau ambiguë et n’est remplacé qu’après un succès confirmé, une
annulation explicite ou une nouvelle recherche/route.

## Paiement canonique

Après les préconditions, l’adaptateur serveur appelle exclusivement l’Edge
Function `paiements-agents-enregistrer-paiement`. La route d’acheminement
n’appelle ni `record_cash_payment_credit`, ni `cash_events`. Le résultat du
moteur Encaissements est enregistré comme checkpoint avant la création de
l’acheminement.

La frontière interne signée distingue quatre valeurs qui ne sont jamais
acceptées comme autorités depuis le navigateur :

- `sourceDestinationCode` sélectionne la feuille source du colis ;
- `collectionSiteCode` est l’agence authentifiée qui encaisse et crédite sa
  Caisse canonique ;
- `forwardingDestinationCode` est cette même agence, destination physique de
  l’acheminement ;
- `operationType` vaut `STANDARD_PAYMENT` ou `INTER_AGENCY_FORWARDING`.

Les paiements standards conservent leur contrat historique. Pour un
acheminement, le serveur Next signe le contexte avec la clé serveur existante,
l’Edge Function vérifie la signature et Apps Script recherche le colis dans la
feuille de `sourceDestinationCode` tout en écrivant le paiement dans la feuille
de `collectionSiteCode`. Le même `paymentRequestId` traverse les trois couches.
Un rejeu identique après une perte de réponse récupère le paiement existant ;
un contenu différent est un conflit d’idempotence.

## Sources Apps Script et retour arrière

La source déployée de référence reste
`local-preparation/apps-script/payments/canonical/Code.gs` (avant). La version
préparatoire adaptée est
`local-preparation/apps-script/payments/unified/Code.gs` (après). Le diff Git
entre ces sources et la copie distante certifiée doit être revu avant tout
déploiement Apps Script. Le retour arrière consiste uniquement à republier la
version certifiée précédente ; aucune donnée Sheets, propriété ou migration
n’est modifiée automatiquement par cette préparation locale.

## Préconditions

Avant l’appel Encaissements : Agent actif, route distincte et autorisée, Caisse
`ACTIVE` avec `OPENING_BALANCE_RECORDED`, Stockage `ACTIVE` avec
`opened_business_date`, et statut source admissible.

Statuts source admis : `EN ATTENTE`, `ENREGISTRE`/`ENREGISTRÉ`, `EN VOL`,
`EN TRANSIT`, `ARRIVE`/`ARRIVÉ`.
Les états `LIVRÉ`, `ANNULÉ`, `SORTI`, clôturés ou inconnus
sont refusés. Un cycle actif identique est également refusé.

## États

Chemin normal : `QUOTE_READY` → `PAYMENT_IN_PROGRESS` →
`PAID_AWAITING_ARRIVAL` → `ARRIVAL_CONFIRMED` → `READY_FOR_DELIVERY` →
`DELIVERED`.

Les échecs partiels après paiement deviennent `ANOMALY_REQUIRES_ADMIN` et sont
tracés dans `stockage_forwarding_anomalies`. Une future compensation Admin peut
produire `CANCELLED_BY_COMPENSATION`; aucun historique financier n’est modifié.

## Transaction de préflight

La migration principale ne contient aucun `BEGIN` ou `COMMIT`. Le fichier
`009_paid_exit_forwarding_orchestration.preflight.sql` l’inclut dans une
transaction externe, vérifie les objets, exécute `ROLLBACK`, puis confirme leur
absence. Il ne doit jamais être lancé contre la Production sans autorisation.
