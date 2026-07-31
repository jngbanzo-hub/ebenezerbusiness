# Runbook préparatoire `logistics_events`

Ce dossier est un plan local. Aucun script n’exécute ou ne déclenche une
migration Supabase. Toute application exigera une autorisation distincte, une
fenêtre de maintenance et un opérateur habilité.

## Fichiers

- `00_preflight_read_only.sql` : inspection avant migration, en lecture seule.
- `01_post_migration_read_only.sql` : vérification du résultat, en lecture seule.
- `02_transactional_verification.sql` : contrôles non destructifs dans une
  transaction explicitement annulée.
- Les scripts à appliquer ultérieurement restent
  `../001_logistics_events.sql` puis `../002_logistics_events_rls.sql`.
- Le retour arrière préparatoire reste
  `../002_logistics_events_rls.rollback.sql`.

## Prérequis

1. Autorisation explicite de migration et fenêtre de maintenance approuvée.
2. Accès administrateur contrôlé, journalisé et limité à cette opération.
3. Sauvegarde complète, chiffrée, datée et restaurée avec succès dans un
   environnement isolé.
4. Empreinte et nombre de lignes des tables concernées consignés avant action.
5. Résultat entièrement vert de `00_preflight_read_only.sql`.
6. Confirmation que `public.agents` possède exactement les colonnes utiles
   `id`, `agence`, `role`, `actif`.
7. Confirmation du type réel de chaque colonne et de la compatibilité
   `public.agents.id::text = auth.users.id::text`.
8. Aucun profil orphelin, rôle inattendu ou agence inconnue non résolu.

## Contrôle du modèle Agent

Le profil d’autorité est `public.agents`, jamais une agence reçue du navigateur.
Le préflight doit confirmer :

- un `id` relié à `auth.users.id` ;
- `actif` booléen ;
- `role` textuel avec uniquement les rôles attendus ;
- `agence` textuelle ;
- les agences `COO`, `COTONOU`, `FIH`, `LSHI` et `KLZ` uniquement ;
- la normalisation serveur `COTONOU → COO`.

Toute autre valeur est `NO-GO`.

## Préparation de `agency_scope`

`agency_scope` doit contenir les agences autorisées à lire l’historique complet
du colis. Il est calculé côté serveur à partir des événements logistiques et
n’est jamais accepté depuis le navigateur.

- Si `logistics_events` n’existe pas ou est vide, `002` peut ajouter et imposer
  cette colonne après les contrôles de la première fenêtre.
- Si une table issue de `001` contient des lignes, la migration est `NO-GO`.
  Il faut préparer, revoir et autoriser séparément un backfill transactionnel,
  puis vérifier chaque scope avant de reprendre.
- Les seules valeurs canoniques sont `COO`, `FIH`, `LSHI`, `KLZ`.

## Application en deux temps

### Fenêtre 1 — structure

1. Geler les futures écritures logistiques côté serveur.
2. Refaire la sauvegarde et consigner son empreinte.
3. Exécuter le préflight en lecture seule.
4. Appliquer `001_logistics_events.sql` uniquement si la table est absente.
5. Exécuter les contrôles de présence, colonnes, contraintes et index.
6. Si des lignes préexistent, arrêter et préparer le backfill séparé.
7. Lever la fenêtre sans activer de nouvelle source applicative.

### Fenêtre 2 — sécurité

1. Confirmer une nouvelle sauvegarde restaurable.
2. Rejouer le préflight et confirmer les critères `GO`.
3. Vérifier que `agency_scope` est complet, canonique et produit côté serveur.
4. Appliquer `002_logistics_events_rls.sql`.
5. Exécuter `01_post_migration_read_only.sql`.
6. Exécuter `02_transactional_verification.sql`.
7. Ne pas activer l’adaptateur applicatif tant que les tests RLS ne sont pas
   entièrement conformes.

## Validations après création

- Table et colonnes attendues présentes.
- Aucun champ financier.
- Identifiant événement unique.
- Unicité `(parcel_id, version_after)`.
- Index `tracking_code`, `parcel_id`, chronologique et `agency_scope`.
- RLS activé et forcé.
- Politique `logistics_events_agent_read` présente.
- `anon` sans privilège.
- `authenticated` limité à `SELECT`.
- `service_role` limité à `SELECT` et `INSERT`.
- Déclencheur d’immutabilité présent.

## Tests d’accès contrôlés

Ces tests exigent des comptes de test dédiés sans données réelles :

1. Un Agent actif lit un colis dont son agence appartient à `agency_scope`.
2. Le même Agent ne lit pas un colis hors de son scope.
3. Un Agent inactif, un profil absent et un rôle inattendu ne lisent rien.
4. Une session anonyme ne lit rien.
5. Une session `authenticated` ne peut ni insérer, modifier ni supprimer.
6. Une insertion serveur avec un `id` déjà utilisé échoue.
7. Une version concurrente pour le même colis échoue.
8. Aucune vérification ne transforme un paiement en livraison :
   **PAYÉ ≠ LIVRÉ**.

## Rollback

1. Suspendre toute activation applicative.
2. Faire et vérifier une nouvelle sauvegarde.
3. Exécuter uniquement le rollback préparatoire après approbation.
4. Vérifier la révocation des droits et la suppression de la politique, du
   déclencheur, de la fonction et de l’index spécifique.
5. Ne supprimer la table qu’en dernier recours, avec autorisation explicite et
   sauvegarde restaurable.
6. Rejouer les contrôles de cohérence et comparer les empreintes.

## Critères GO

- Sauvegarde restaurée avec succès.
- Préflight sans absence de colonne ni type incompatible.
- Aucun profil orphelin.
- Aucune agence ou rôle inattendu.
- `agency_scope` complet, canonique et contrôlé côté serveur.
- Tests statiques et relecture SQL réussis.
- Plan de rollback validé par un second opérateur.

## Critères NO-GO

- Sauvegarde non restaurée ou non vérifiable.
- Structure réelle différente du contrat.
- Profil Agent orphelin ou ambigu.
- Valeur d’agence ou rôle inattendu.
- Ligne existante sans `agency_scope`.
- Besoin d’utiliser une agence fournie par le navigateur.
- Échec d’un contrôle RLS, de privilège ou d’immutabilité.
- Absence d’autorisation explicite pour la fenêtre concernée.
