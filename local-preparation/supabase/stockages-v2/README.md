# Stockages V2 — préparation Supabase

Ces fichiers sont préparatoires. La Phase 2.2 ne les applique à aucun environnement distant.

## Ordre futur contrôlé

1. préflight distant en lecture seule et sauvegarde ;
2. `001_stockage_schema.sql` ;
3. création contrôlée des trois comptes `SUSPENDED` FIH, LSHI et KLZ (aucun compte COO) ;
4. `002_stockage_rls_and_views.sql` ;
5. `003_stockage_privileges_hardening.sql` ;
6. `004_stockage_opening_rpc.sql` ;
7. `005_stockage_arrival_rpc.sql` ;
8. `006_stockage_delivery_rpc.sql` ;
9. `007_stockage_admin_controls_rpc.sql` ;
10. validations read-only et tests transactionnels avec `ROLLBACK`.

Le rollback global est volontairement séparé et destructif. Il ne doit être exécuté qu'après sauvegarde et autorisation explicite. Le rollback des privilèges restaure uniquement les droits préparatoires documentés.

## Principes

- Une seule projection de Stockage par agence FIH, LSHI ou KLZ ; jamais par Agent.
- Verrou par compte agence pour éviter les pertes de mise à jour ; verrou du colis avant le compte pour une livraison.
- Une seule livraison par code colis, idempotence par `request_id`, versions séquentielles.
- Les événements et l'Audit sont immutables ; les corrections sont compensatoires.
- Les anomalies sont créées par une RPC serveur, résolues uniquement par un Admin actif,
  auditées et impossibles à supprimer silencieusement.
- Les Agents lisent uniquement leur agence. Les Admins lisent les trois agences, l'Audit et les anomalies. Toutes les écritures passent par des RPC `SECURITY DEFINER` exécutables uniquement par `service_role`.
- La date métier est fournie explicitement par le serveur selon `Africa/Porto-Novo` ; aucune vue ne choisit implicitement la date UTC.
- Le paiement peut être affiché comme contexte mais ne déclenche jamais une livraison.

La résolution du poids est détaillée dans `../../stockages-v2/WEIGHT_SOURCE.md`.
