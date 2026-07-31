# Schéma Supabase préparatoire de la Caisse

Ces fichiers ne sont pas une migration active et n'ont été appliqués à aucun
projet Supabase. Ils préparent Supabase comme source canonique. Un futur export
Google Sheets sera unidirectionnel et non autoritaire.

## Ordre futur, soumis à une autorisation séparée

1. sauvegarder le schéma et les données financières ;
2. vérifier `public.agents`, `auth.users` et les rôles `AGENT`/`ADMIN` ;
3. appliquer `001_cash_schema.sql` ;
4. contrôler que les tables sont vides et que seules FIH, LSHI et KLZ sont
   acceptées ;
5. appliquer `002_cash_rls_and_views.sql` ;
6. tester les lectures Agent/Admin et tous les refus d'écriture navigateur ;
7. seulement ensuite créer les trois comptes, via une fonction serveur auditée.

## Autorité et concurrence

Le navigateur ne fournit jamais l'agence canonique, la version, l'identité
acteur ni les identifiants d'Audit. Une future fonction serveur les calcule,
verrouille la ligne `cash_accounts` (`SELECT ... FOR UPDATE`), vérifie
`version_before`, insère l'événement puis avance la version dans une même
transaction. Les contraintes sur source, requête et version assurent
l'idempotence en cas de requêtes concurrentes.

Les événements, clôtures et audits sont immutables. Toute correction est un
événement compensatoire avec cible, ancienne valeur, nouvelle valeur, motif,
Admin et horodatage. Une réouverture produit une nouvelle version de clôture et
ne réécrit pas l'ancienne.

## Accès

- Agent actif : lecture seule de sa propre caisse FIH, LSHI ou KLZ.
- Admin actif : lecture de toutes les caisses et de l'Audit.
- navigateur : aucune écriture directe ;
- serveur contrôlé : insertions seulement, avec identité et périmètre calculés.

COO/COTONOU est interdit dans toutes les tables Caisse. La vue
`cash_coo_revenue_outside_cash` est volontairement vide : elle réserve le
contrat d'une future projection issue des Encaissements, séparée de la Caisse.

## Projections et rollback

Les vues exposent solde courant, journée, historique, détail par agent, total
agence et anomalies de rapprochement. Elles sont reconstructibles depuis les
journaux. Le rollback retire d'abord vues, politiques et triggers. Les `DROP
TABLE` destructifs restent commentés et ne doivent être envisagés qu'après
sauvegarde et décision explicite.
