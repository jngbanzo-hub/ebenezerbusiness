# Plan de sécurité préparatoire

Ces fichiers SQL sont locaux, non actifs et n’ont été appliqués à aucun projet
Supabase. Une autorisation distincte restera obligatoire avant toute migration.

## Identité et lecture par agence

Le code existant établit que le profil professionnel est lu dans
`public.agents`, avec `id = auth.users.id`, puis valide `actif`, `role` et
`agence`. La politique reprend cette source serveur : elle utilise `auth.uid()`
et ne lit jamais une agence fournie par le navigateur.

La migration exige `public.agents(id, agence, role, actif)`. Elle normalise
`COTONOU` vers `COO`. Cette dépendance doit être vérifiée sur une copie du
schéma réel, notamment les types de `id` et les propres politiques RLS de
`agents`, avant toute exécution.

`agency_scope` contient les agences autorisées à lire l’historique complet d’un
colis. Cette valeur doit être calculée et validée par le serveur à partir des
événements logistiques. Elle ne doit jamais provenir directement d’une requête
du navigateur.

## Écritures et immutabilité

Les clients `anon` n’ont aucun droit. Les clients `authenticated` ont uniquement
`SELECT` et aucune politique `INSERT`, `UPDATE` ou `DELETE`. Une future fonction
serveur contrôlée pourra utiliser `service_role` pour insérer un événement.

La clé événement `id` rend l’insertion idempotente. L’unicité
`(parcel_id, version_after)` contrôle la concurrence de version. Un déclencheur
refuse toute modification ou suppression d’un événement existant, y compris
par le rôle de service : toute correction doit être un nouvel événement
compensatoire.

## Frontière métier

PAYÉ n’est jamais équivalent à LIVRÉ. `logistics_events` décrit uniquement des
faits logistiques immuables et ne contient aucun montant, devise, frais ou
statut de paiement. MANIFESTE PUBLIC n’est pas une preuve de position physique.

## Procédure avant migration

1. Faire une sauvegarde complète et chiffrée du schéma et des données.
2. Restaurer cette sauvegarde dans un environnement isolé et vérifier son
   intégrité.
3. Vérifier la structure réelle de `public.agents` et son lien avec
   `auth.users`.
4. Si la version `001` existe déjà, calculer `agency_scope` côté serveur,
   contrôler chaque valeur, puis seulement imposer `NOT NULL`.
5. Exécuter les validations statiques et faire relire le SQL.

## Vérifications après migration

1. Confirmer que RLS est activé et forcé.
2. Vérifier qu’un utilisateur anonyme ne peut ni lire ni écrire.
3. Vérifier qu’un Agent actif ne lit que les colis présents dans son
   `agency_scope`.
4. Vérifier qu’un Agent inactif, sans profil ou d’une autre agence ne lit rien.
5. Vérifier qu’un client authentifié ne peut ni insérer, modifier ou supprimer.
6. Tester deux insertions avec le même `id`, puis deux versions concurrentes,
   dans un environnement isolé et avec transaction annulée.
7. Comparer les comptes et empreintes avec la sauvegarde.

## Rollback

Le script `002_logistics_events_rls.rollback.sql` révoque les droits, supprime la
politique, le déclencheur, la fonction et l’index spécifique, puis désactive
RLS. La suppression de la table est commentée et réservée au dernier recours,
après restauration vérifiée et autorisation explicite.
