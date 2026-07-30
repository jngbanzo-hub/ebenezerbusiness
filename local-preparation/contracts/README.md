# Contrats métier préparatoires

Copie documentaire créée le 2026-07-30. Statut : **CANONIQUE_PROVISOIRE**.

Ces types sont isolés dans `local-preparation` et ne sont importés par aucune
logique métier existante. Ils ne doivent pas être déployés ni connectés aux
moteurs réels sans une phase dédiée. Aucun secret réel n'est versionné ici.

## Agences et devise

Les seules agences canoniques sont `COO`, `FIH`, `LSHI` et `KLZ`. La fonction
pure préparatoire normalise `COTONOU` en `COO` et rejette toute autre valeur.
La seule devise comptable du contrat financier est `USD`.

## Contraintes financières

- `amount` doit être strictement positif.
- `occurredAt` est un instant UTC.
- `businessDate` est calculée selon `Africa/Porto-Novo`.
- `eventId` est unique et `requestId` reste stable.
- Aucun événement existant n'est modifié : correction et annulation passent
  par un événement compensatoire.
- Aucune donnée du module Transferts n'est autorisée dans ces événements.

## Contraintes de stock

- Une transition vers `ARRIVÉ` produit `ENTREE_DESTINATION`.
- Une transition vers `LIVRÉ` produit `SORTIE_DESTINATION`.
- Un paiement ne déclenche jamais directement une sortie de stock.
- MANIFESTE PUBLIC reste strictement en lecture seule.
- Aucun mouvement existant n'est modifié ; une correction crée une compensation.
- Le moteur futur devra refuser le stock négatif avant écriture.
- Un ajustement Admin exige un motif et une trace Audit.

## Fichiers

| Fichier | SHA-256 | Octets | Lignes | Statut |
|---|---:|---:|---:|---|
| `agencies.ts` | `2589831021fb2bb0a2e4b20cf6ab611383f0e75daed79635e396f6306153767c` | 420 | 19 | CANONIQUE_PROVISOIRE |
| `financial-event.ts` | `61c5475512cb9e883d70ef5e633703f421df16db9afb0c48b3cfcbb6a69d1f02` | 619 | 28 | CANONIQUE_PROVISOIRE |
| `stock-event.ts` | `a4a950f223eb3b63fee0711fb09cd8fd90da5a7c0126e26ae5bdf386ffbb4654` | 605 | 26 | CANONIQUE_PROVISOIRE |
