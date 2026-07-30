# Machine d'états préparatoire

Cette machine est locale, pure et non connectée à la production.

## Position physique

| Depuis | Vers | Preuve minimale |
|---|---|---|
| `UNKNOWN` | `AT_AGENCY` | entrée physique confirmée |
| `AT_AGENCY` | `IN_TRANSIT` | sortie depuis `currentAgency` |
| `IN_TRANSIT` | `AT_AGENCY` | entrée à `transitTo` |
| `AT_AGENCY` | `DELIVERED` | remise physique dans la même agence |

`DELIVERED → AT_AGENCY` exige une correction Admin compensatoire. Sont refusés
en opération normale : `IN_TRANSIT → DELIVERED`, une livraison par une agence
différente et `AT_AGENCY → AT_AGENCY` dans une autre agence.

## Réacheminement

`PROPOSED → APPROVED → DEPARTED → ARRIVED`.

Une proposition peut être annulée. Une annulation après départ exige une
compensation ou une procédure Admin documentée. `ARRIVED` exige une entrée
physique confirmée.

## Concurrence

Chaque commande compare `expectedPositionVersion` à la version courante. Une
réussite incrémente exactement la version de un. La destination initiale ne
change jamais.
