# Modèle local de lecture des positions

Cette couche préparatoire transforme un historique logistique validé en vue
simple. Elle ne lit et n'écrit aucune donnée distante ou locale.

## Fonctions

- `buildParcelReadModel(events)` reconstruit une position avec le moteur
  existant, puis ajoute les informations utiles à la lecture.
- `buildParcelReadModels(groupedEvents)` reconstruit indépendamment chaque
  groupe indexé par `parcelId`.
- `formatAgentLocationLabel(model)` produit un libellé sans modifier la vue.

Aucune transition n'est dupliquée : la reconstruction utilise
`rebuildParcelPosition`, et les anomalies utilisent
`projectArrivalAnomalies`.

## Statuts Agent

- `POSITION_INCONNUE` : position `UNKNOWN`.
- `EN_ATTENTE` : colis physiquement à COO.
- `EN_TRANSIT` : colis entre `transitFrom` et `transitTo`.
- `EN_AGENCE` : colis présent dans FIH, LSHI ou KLZ.
- `LIVRE` : remise physique confirmée.

Une anomalie d'arrivée `ACTIVE` est affichée avant le libellé normal avec les
agences attendue et réelle. Une `SORTIE_REACHEMINEMENT` explicite ferme
l'anomalie ; l'événement historique reste conservé.

`deliveredAt` provient exclusivement de l'événement final
`SORTIE_LIVRAISON`, ou de `SORTIE_DESTINATION` pour l'historique legacy.

## Frontières

Un historique invalide est refusé par le moteur ; aucune position n'est
inventée. La couche ne connaît ni paiement, dette ou frais. **PAYÉ ≠ LIVRÉ.**
Elle ne dépend ni de Supabase, Google Sheets, Apps Script, Next.js, réseau,
navigateur ou mobile.
