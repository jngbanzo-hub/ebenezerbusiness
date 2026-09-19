# Worker de projection forwarding — préparation locale

Architecture retenue : Vercel Cron toutes les dix minutes appelle une passerelle
protégée par `CRON_SECRET`. La passerelle exécute le même service que l'endpoint
manuel POST protégé par `FORWARDING_MANIFEST_WORKER_TOKEN`. Le service réclame au
maximum dix jobs via la RPC atomique 021, puis délègue la résolution et la
composition de G au Web App Apps Script dédié. Il acquitte ensuite chaque job via
la seconde RPC 021.

La configuration Cron est volontairement conservée hors de `vercel.json` : elle
ne doit être ajoutée qu'après migration, déploiement de l'endpoint et smoke test
manuel sans job. Le paiement et la Caisse ne dépendent jamais de ce worker.

## Déploiement futur

1. Exécuter le preflight 021 et certifier le rollback.
2. Appliquer 021 puis vérifier RPC, privilèges et file existante.
3. Configurer les secrets serveur et Apps Script sans les journaliser.
4. Déployer le Web App Apps Script préparé puis l'endpoint Vercel, sans cron.
5. Tester sans token, mauvais token, token valide et run sans job éligible.
6. Déployer les notifications spécialisées, toujours non bloquantes.
7. Ajouter uniquement alors le fragment Cron préparé à `vercel.json`.
8. Observer le premier run et vérifier compteurs, leases et absence de boucle.

## Rollback

- Retirer d'abord la configuration Cron.
- Revenir au déploiement Vercel précédent pour les endpoints/notifications.
- Revenir à la version Apps Script actuellement certifiée.
- N'exécuter le rollback SQL 021 qu'après absence de lease active.
- Ne jamais annuler un paiement, une écriture Caisse ou une ligne canonique du registre.
