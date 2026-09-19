# Moteur local de position physique

Ce moteur est une préparation locale pure. Il n'est importé par aucun fichier
du site et ne contacte aucun service, stockage, réseau, navigateur ou mobile.

## Algorithme

`applyLogisticsEvent(position, event)` valide l'identité du colis, la version,
l'ordre temporel et l'absence de rejeu, puis applique une transition explicite.
L'objet d'entrée et l'événement ne sont jamais mutés ; la nouvelle projection
est créée et profondément gelée par le contrat `ParcelPosition`.

`rebuildParcelPosition(events)` exige un historique déjà ordonné. Il ne trie
jamais silencieusement. Le premier événement doit porter
`metadata.destinationInitiale`, nécessaire parce qu'un événement de mouvement
ne suffit pas à déduire la destination commerciale initiale.

## Versions et ordre

Pour chaque événement :

- `versionBefore` doit égaler la version courante ;
- `versionAfter` doit valoir `versionBefore + 1` ;
- `occurredAt` ne peut pas précéder la projection ou l'événement précédent ;
- un `eventId` ne peut apparaître qu'une fois.

Le moteur conserve `parcelId`, `trackingCode`, `destinationInitiale`,
`lastEventId` et `updatedAt`.

## Transitions

- `ENTREE_COO` : `UNKNOWN → AT_AGENCY COO`.
- `SORTIE_COO` : `AT_AGENCY COO → IN_TRANSIT` vers `destinationCourante`.
- `ENTREE_DESTINATION` : arrivée uniquement à `transitTo`.
- `ARRIVAL_MISMATCH_CONFIRMED` : arrivée physique dans une agence différente,
  sans modification des destinations.
- `SORTIE_REACHEMINEMENT` : départ de l'agence physique et mise à jour de
  `destinationCourante`.
- `ENTREE_REACHEMINEMENT` : entrée uniquement à `transitTo`.
- `SORTIE_LIVRAISON` : remise depuis l'agence physique, puis `DELIVERED`.
- `SORTIE_DESTINATION` est accepté pour reconstruire l'historique legacy.

Le statut financier n'est ni lu ni écrit. **PAYÉ ≠ LIVRÉ** : un solde restant
n'empêche pas une remise physique valide.

## Compensations Admin

`AJUSTEMENT_ADMIN` et `STOCK_REVERSAL` exigent source et identité Admin, motif,
`compensatesEventId`, ainsi que `metadata.beforePosition` et
`metadata.afterPosition`. L'état avant doit correspondre à la projection
courante. L'événement d'origine reste dans l'historique.

## Arrivée dans une agence inattendue

`ENTREE_DESTINATION` reste refusé lorsque l'agence réelle diffère de
`transitTo`. `ARRIVAL_MISMATCH_CONFIRMED` représente ce constat séparément :
`expectedAgency` doit égaler `transitTo`, `actualAgency` doit être différente,
et l'agence déclarée du confirmateur doit égaler l'agence réelle. Une présence
physique, un motif, une identité et une référence de preuve sont obligatoires.

La position devient `AT_AGENCY` à `actualAgency`, sans modification de
`destinationInitiale` ou `destinationCourante`. Aucun réacheminement n'est créé
automatiquement.

`projectArrivalAnomalies(events)` produit une projection séparée destinée aux
futurs audit et statistiques. L'anomalie reste `ACTIVE` jusqu'à une
`SORTIE_REACHEMINEMENT` explicite depuis l'agence réelle, puis devient
`CLOSED_BY_REROUTING`. L'événement original demeure dans l'historique.

Cette projection séparée évite de surcharger `ParcelPosition`, qui reste une
description stricte de la position physique. `AJUSTEMENT_ADMIN` demeure réservé
aux corrections et ne remplace pas un constat physique légitime.

## Limites

Le moteur ne persiste rien, ne calcule aucun paiement ou frais, n'autorise aucun
acteur et ne remplace pas les contrôles serveur futurs. Il ne dépend ni de
Paiements, Transferts, Dépenses, Caisse, Supabase, Apps Script, Next.js,
Google Sheets, Vercel, navigateur ou mobile.

Une future API pourra employer un `arrivalMismatchRequestId` distinct pour
l'idempotence de commande. Cette Phase B.1 n'en ajoute pas : l'unicité de
`eventId` suffit au moteur local.
