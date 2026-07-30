# Catalogue préparatoire des événements

| Événement | Sens | Contraintes principales |
|---|---|---|
| `ENTREE_COO` | entrée physique COO | `agency=toAgency=COO` |
| `SORTIE_COO` | départ de COO | `fromAgency=COO`, destination distincte |
| `ENTREE_DESTINATION` | arrivée à destination | `toAgency=agency` |
| `SORTIE_REACHEMINEMENT` | départ de réacheminement | source `REROUTING` |
| `ENTREE_REACHEMINEMENT` | arrivée de réacheminement | entrée physique, source `REROUTING` |
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
