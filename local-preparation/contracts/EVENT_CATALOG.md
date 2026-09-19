# Catalogue préparatoire des événements

| Événement | Sens | Contraintes principales |
|---|---|---|
| `ENTREE_COO` | entrée physique COO | `agency=toAgency=COO` |
| `SORTIE_COO` | départ de COO | `fromAgency=COO`, destination distincte |
| `ENTREE_DESTINATION` | arrivée à destination | `toAgency=agency` |
| `SORTIE_REACHEMINEMENT` | départ de réacheminement | source `REROUTING` |
| `ENTREE_REACHEMINEMENT` | arrivée de réacheminement | entrée physique, source `REROUTING` |
| `ARRIVAL_MISMATCH_CONFIRMED` | arrivée physique dans une agence inattendue | source `AGENT` ou `ADMIN`, agence attendue/réelle, motif et preuve |
| `SORTIE_LIVRAISON` | remise physique | source `DELIVERY_CONFIRMATION` |
| `AJUSTEMENT_ADMIN` | correction explicite | source Admin et motif |
| `STOCK_REVERSAL` | compensation | événement compensé et motif |
| `SORTIE_DESTINATION` | historique seulement | ne pas produire pour une nouvelle opération |

Tous conservent l'identité de l'événement, du colis, de la requête, l'acteur,
les agences source/destination, les dates, les métadonnées JSON-safe et les
versions avant/après.

Les événements financiers supplémentaires sont `REROUTING_FEE_ASSESSED` et
`REROUTING_FEE_REVERSED`. Ils représentent une créance ou sa compensation, pas
un paiement.

`ARRIVAL_MISMATCH_CONFIRMED` n'est ni une `ENTREE_DESTINATION` ni un
`AJUSTEMENT_ADMIN`. Il constate une présence physique réelle différente de
`transitTo`, sans modifier automatiquement `destinationCourante`.
