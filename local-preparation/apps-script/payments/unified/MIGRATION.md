# Migration future — aucune étape exécutée

1. Corriger et publier l'application mobile pour qu'elle génère un
   `paymentRequestId` UUID v4 et conserve le même identifiant lors d'une
   nouvelle tentative de la même opération.
2. Vérifier l'adoption effective de cette version mobile et inventorier les
   versions Apps Script, Web et mobiles encore actives.
3. Rendre ensuite `paymentRequestId` obligatoire dans l'Edge Function.
4. Vérifier les feuilles `COO`, `FIH`, `LSHI` et `KLZ`, leurs 15 en-têtes
   existants et l'absence de conflit dans la colonne P, puis ajouter de manière
   contrôlée en `P1` l'en-tête exact `Payment Request ID`, sans écrire dans
   `P2:P`.
5. Sauvegarder le classeur Paiements, ses protections, formats et lignes
   existantes avant le changement de moteur.
6. Copier la source unifiée puis créer une nouvelle version du déploiement Web
   App Apps Script, sans remplacer irréversiblement la version précédente.
7. Tester `ping` et la recherche sans écriture.
8. Autoriser séparément un unique test d'écriture réel avec un UUID v4 neuf,
   puis vérifier la colonne P et l'absence de doublon.
9. Surveiller les réponses, l'idempotence et les clients actifs.
10. Retirer les alias historiques uniquement après migration de tous les
    parseurs.

En cas d'anomalie à une étape, réaffecter le déploiement à la version Apps
Script antérieure et conserver les preuves du rollback.

La migration ne doit jamais modifier MANIFESTE PUBLIC ni déduire une livraison
d'un paiement.
