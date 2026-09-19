# Plan de migration

## Neutralisation du moteur V1

Le code certifié est sauvegardé, pas supprimé. Avant bascule :

- conserver `SYSTEM_STATUS=BROUILLON` ;
- ne jamais installer de déclencheur pour `synchroniserStatutsStockages()` ;
- désactiver cette fonction et ses menus d'écriture dans la future version ;
- neutraliser toutes les dérivations ENREGISTRÉ/EN VOL/ARRIVÉ/LIVRÉ ;
- supprimer l'arrivée implicite KLZ du chemin actif ;
- remplacer l'activation globale par l'ouverture indépendante FIH/LSHI/KLZ ;
- exclure COO et l'exigence des quatre soldes initiaux ;
- ne réinterpréter aucune donnée V1 comme preuve physique.

## Compatibilité des feuilles

| Feuille | Rôle futur | Décision |
|---|---|---|
| PARAMETRES | trace V1 | conserver en archive ; nouveaux flags côté serveur |
| SOLDE INITIAL | brouillon V1 | archiver ; ouvertures V2 dans Supabase |
| HISTORIQUE STATUTS | aucun mouvement physique fiable | archiver sans importer |
| MOUVEMENTS STOCK | vide certifié | archiver ; projection V2 séparée si autorisée |
| STOCK JOURNALIER | vide certifié | archiver ; projection Supabase canonique |
| AUDIT | historique technique V1 | conserver en lecture, ne pas fusionner silencieusement |
| ANOMALIES MANIFESTE | contrôle statistique | conserver, indépendant du Stockage V2 |

Aucune feuille existante n'est étendue comme journal canonique. Une éventuelle
feuille d'export V2 portera un nom/version explicite et sera reconstructible.

## Phases proposées

1. **2.2 — contrats et schéma local** : SQL, RLS, RPC, rollback et tests statiques.
2. **2.3 — préflight et sauvegarde** : schéma Agents, privilèges, empreintes et GO/NO-GO.
3. **2.4 — migration distante inactive** : tables/RLS/RPC, comptes SUSPENDED, zéro mouvement.
4. **2.5 — routes et commandes** : sources autoritaires, idempotence et feature flags false.
5. **2.6 — écrans Agent/Admin** : lecture et formulaires sans activation Production.
6. **2.7 — tests multi-agents** : faux clients puis transactions rollbackées et concurrence contrôlée.
7. **2.8 — neutralisation V1 préparée** : nouvelle version Apps Script auditée, non déployée.
8. **2.9 — Preview** : Supabase V2 activé uniquement en Preview, comptes SUSPENDED.
9. **2.10 — contrôle global** : sécurité, données à zéro, sauvegardes et plan de bascule.
10. **2.11 — autorisation Production** : activation explicite des routes, sans ouverture automatique.
11. **2.12 — ouvertures individuelles** : soldes FIH/LSHI/KLZ saisis séparément par Admin.
12. **2.13 — export Sheets facultatif** : seulement après stabilisation du journal canonique.

## Tests obligatoires

- ouverture unique et indépendante ; COO et compte SUSPENDED refusés ;
- deux arrivages distincts simultanés ; rejeu et conflit d'idempotence ;
- livraisons distinctes simultanées ; deux Agents sur le même colis ;
- agence navigateur ignorée et mauvaise agence refusée ;
- poids absent, invalide ou divergent ; stock colis/kg insuffisant ;
- paiement à COO, partiel ou destination sans sortie automatique ;
- livraison physique après paiement, et paiement après arrivée ;
- Audit et identité stable ; correction compensatoire ;
- absence de toute synchronisation MANIFESTE ;
- RLS Agent/Admin/anon, absence de clé serveur client ;
- reconstruction des projections, rollback transactionnel et restauration V1.

## Critères avant bascule

Zéro mouvement V2 inattendu, comptes SUSPENDED, backups vérifiés, tests de
concurrence réussis, V1 toujours BROUILLON, flags Production false et
autorisation explicite. Un seul écart impose NO-GO.
