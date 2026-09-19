# Sauvegarde et rollback

## Avant migration

1. Copier intégralement `STOCKAGES PUBLIC` avec horodatage.
2. Exporter le classeur en XLSX.
3. Exporter en CSV PARAMETRES, SOLDE INITIAL, HISTORIQUE STATUTS, MOUVEMENTS
   STOCK, STOCK JOURNALIER et AUDIT.
4. Exporter `Code.gs` et `appsscript.json` du projet certifié.
5. Recalculer les SHA-256, dont `Code.gs` attendu :
   `4d710aab6ee144a98f89c57c27ffc80d4533a9fde5371cbb1a5fc80e5db0b993`.
6. Capturer versions, déploiements et déclencheurs Apps Script.
7. Capturer HEAD/origin, variables Vercel sans valeurs et état Supabase.
8. Sauvegarder le schéma/données Supabase avant chaque migration distante.

## Critères d'arrêt

- empreinte V1 différente ;
- écriture ou déclencheur non attendu ;
- solde/mouvement réel apparu avant ouverture ;
- schéma Agents incompatible ;
- RLS ou privilèges non conformes ;
- test de concurrence, idempotence ou stock négatif échoué ;
- impossibilité de restaurer les sauvegardes.

## Rollback

1. Désactiver les flags V2 et refuser toute nouvelle commande.
2. Laisser les comptes V2 SUSPENDED ; ne supprimer aucun événement réel.
3. Exporter les événements déjà reçus pour rapprochement manuel.
4. Désactiver les RPC/routes/composants nouveaux ; appliquer les rollbacks SQL
   versionnés uniquement après validation de leur impact.
5. Restaurer les variables précédentes.
6. Restaurer le projet Apps Script certifié et sa copie de classeur si une
   modification a eu lieu.
7. Maintenir V1 en `BROUILLON` : le rollback ne doit pas réactiver
   automatiquement la synchronisation MANIFESTE.
8. Vérifier les empreintes, l'absence de perte et les compteurs par agence.

Si des événements V2 réels existent, la suppression de tables est interdite :
on conserve le journal en lecture seule et on réalise un rapprochement contrôlé.
