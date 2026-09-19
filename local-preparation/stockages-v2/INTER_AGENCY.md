# Acheminements inter-agences — préparation Phase 2.5

Ce workflow est indépendant de Stockages, Encaissements, Caisse et Transferts. Le code colis original reste immutable. La référence métier est `CODE-ORIGINE-DESTINATION`.

Le serveur est seul autoritaire pour l’agence d’origine (profil Agent), la destination du colis, le poids canonique, le tarif et le montant attendu. Les six tarifs sont définis dans `src/server/inter-agency-routing.ts`; aucun tarif n’est envoyé comme donnée de confiance depuis le navigateur.

Étapes futures contrôlées : devis serveur, création idempotente de l’acheminement, confirmation physique du départ, confirmation physique de l’arrivée, insertion du colis dans le Stockage destination, paiement dans Encaissements avec le type `ACHEMINEMENT INTER-AGENCES`, puis crédit Caisse de l’agence d’encaissement. Aucun de ces événements ne doit utiliser le module Transferts.

La Phase 2.5 n’applique aucune migration distante et ne crée aucun acheminement réel. Le bouton de création reste donc désactivé dans la Preview jusqu’à l’autorisation d’une table et de RPC dédiées.
