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

## Arrivée dans la mauvaise agence

Le moteur refuse `ENTREE_DESTINATION` lorsque l'agence réelle diffère de
`transitTo`. Le catalogue n'est pas élargi pendant cette phase.

La recommandation pour une phase dédiée est `ARRIVAL_MISMATCH_CONFIRMED`, avec
autorisation Agent de l'agence constatante et validation serveur renforcée,
agences attendue/réelle, motif, preuve physique, puis réacheminement explicite.
Ce choix décrit correctement la réalité, rend l'anomalie visible dans l'audit
et les statistiques, et évite d'utiliser une correction Admin pour masquer une
entrée physique légitime. `AJUSTEMENT_ADMIN` reste réservé aux corrections.

## Limites

Le moteur ne persiste rien, ne calcule aucun paiement ou frais, n'autorise aucun
acteur et ne remplace pas les contrôles serveur futurs. Il ne dépend ni de
Paiements, Transferts, Dépenses, Caisse, Supabase, Apps Script, Next.js,
Google Sheets, Vercel, navigateur ou mobile.
