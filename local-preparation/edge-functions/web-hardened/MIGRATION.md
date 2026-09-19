# Migration future — aucune exécution dans cette phase

## Prérequis

1. confirmer à nouveau les versions Supabase actives et leurs hashes ;
2. confirmer que tous les clients autorisés envoient un UUID v4
   `paymentRequestId` ;
3. exécuter les tests locaux et de compatibilité Web ;
4. inventorier les origines CORS ;
5. sauvegarder les versions actives 3 et 4 comme point de retour arrière ;
6. maintenir les écritures métier fermées durant la fenêtre contrôlée.

## Déploiement futur

Déployer d'abord la recherche, vérifier uniquement l'authentification et les
lectures globales autorisées pour les quatre agences, puis déployer
l'enregistrement dans une fenêtre séparée après analyse dédiée de ses règles.
Ne réaliser aucun paiement réel comme simple test technique. Vérifier les codes
HTTP, les enveloppes publiques et l'absence de données sensibles.

## Retour arrière futur

En cas de régression, redéployer exactement les snapshots certifiés de
`../deployed-snapshot/` avec leurs paramètres précédents. La restauration doit
être autorisée dans une phase distante distincte. Ne modifier ni tables, ni
RLS, ni secrets pour compenser un défaut de code.

Le mobile est hors périmètre de cette phase. La fonction d'enregistrement
durcie reste non déployable pour ce client jusqu'à certification séparée de
`paymentRequestId`.
