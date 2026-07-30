# Migration future — aucune étape exécutée

1. Inventorier le code et le numéro de version Apps Script réellement déployés,
   ainsi que les clients Web et mobiles actifs.
2. Sauvegarder le classeur Paiements avant toute modification.
3. Vérifier les feuilles `COO`, `FIH`, `LSHI` et `KLZ`, leurs 15 en-têtes
   existants et l'absence de conflit dans la colonne P.
4. Ajouter de manière contrôlée en `P1` l'en-tête exact
   `Payment Request ID`, sans écrire dans `P2:P`.
5. Vérifier les protections, formats, lignes existantes et sauvegarder de
   nouveau le classeur.
6. Copier la source unifiée puis créer une nouvelle version du déploiement Web
   App Apps Script, sans remplacer irréversiblement la version précédente.
7. Tester `ping`, la recherche et une simulation sans écriture.
8. Autoriser séparément un unique test d'écriture réel avec un UUID v4 neuf,
   puis vérifier la colonne P et l'absence de doublon.
9. Mettre à jour les Edge Functions seulement si leur inventaire montre qu'elles
   ne tolèrent pas les champs de compatibilité V2.
10. En cas d'anomalie, réaffecter le déploiement à la version Apps Script
    antérieure et conserver les preuves du rollback.

La migration ne doit jamais modifier MANIFESTE PUBLIC ni déduire une livraison
d'un paiement.
