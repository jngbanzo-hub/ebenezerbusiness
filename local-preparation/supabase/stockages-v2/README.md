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
10. `008_stockage_detailed_arrivals.sql` ;
11. après autorisation séparée, `009_paid_exit_forwarding_orchestration.sql` ;
12. validations read-only et tests transactionnels avec `ROLLBACK`.

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
- Un paiement complet à destination ne peut déclencher une sortie qu’au travers de l’orchestration durable 2.5.2, après contrôle de présence physique. Un paiement COO ne déclenche jamais cette sortie automatique.

## Paiements et acheminements — Phase 2.5.2

La migration `009` est préparatoire et ne doit pas être appliquée sans préflight distant séparé. Elle ajoute un registre durable permettant de reprendre un paiement Google Sheets déjà créé sans le rejouer avec un nouvel identifiant, ainsi qu’une finalisation PostgreSQL atomique entre le crédit Caisse et la sortie du Stockage commun.

Google Sheets et Supabase ne peuvent pas partager une transaction ACID. L’Edge Function crée donc le registre avant l’appel Apps Script, enregistre le résultat du paiement comme checkpoint, puis finalise Caisse et Stockage dans une transaction PostgreSQL. Un rejeu avec le même `requestId` reprend ce checkpoint ; un contenu différent produit `IDEMPOTENCY_CONFLICT`. Si le paiement existe mais que la sortie physique est impossible, l’état devient `COMPENSATION_REQUIRED`, une anomalie est conservée et aucun nouveau paiement automatique n’est tenté.

Les acheminements utilisent une référence `CODE-ORIGINE-DESTINATION`, conservent le code original séparément et ne modifient jamais sa destination historique. Leur création payée, leur arrivage manuel et leur remise finale sont journalisés de façon immutable. Ils restent totalement indépendants du module Transferts.

La résolution du poids est détaillée dans `../../stockages-v2/WEIGHT_SOURCE.md`.
