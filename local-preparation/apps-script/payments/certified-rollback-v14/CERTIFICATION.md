# Certification de rollback — Paiements Agents

- Projet : `PAIEMENTS AGENTS - API SECURISEE`
- Déploiement : Web App active, Deployment ID vérifié manuellement et volontairement omis de ce dépôt
- Version servie : `14`
- Date de version : `27/07/2026 21:55`
- Rôle : cible de rollback certifiée ; ne pas utiliser comme nouvelle version
- Date de certification : `06/08/2026`
- Commit futur : à renseigner lors du versionnement autorisé

## Empreintes SHA-256

- `Code.gs` : `1d680bdb6f80051580c145439188f09494319284f03f6a3b1448ad366419ff25`
- `appsscript.json` : `723e5bb243883fbfe32187b1c1d3b6b09f2d2080da0bdd9578903122c4b26598`
- projet composite : `2dbc2540edb7a71d2e8efbc194376e397b587edf932f2f47558040e04eab369a`

L'empreinte composite est le SHA-256 du flux UTF-8 suivant : nom `Code.gs`, saut de
ligne, SHA-256 de `Code.gs`, saut de ligne, nom `appsscript.json`, saut de ligne,
SHA-256 de `appsscript.json`, saut de ligne.

## Cohérence locale

Le fichier historique `Code.gs` est identique octet pour octet à
`../canonical/Code.gs`. Il n'est pas identique à `../unified/Code.gs`.

## Procédure de rollback

Dans Google Apps Script : **Déployer → Gérer les déploiements → sélectionner le
déploiement Web App certifié → Modifier → Version 14 → Déployer**. Cette procédure
réassocie le même Deployment ID à la Version 14. Elle est documentée mais n'a pas
été exécutée pendant la certification.

Cette archive ne contient aucune URL Web App, clé API, clé Supabase, valeur de
secret ou jeton.
