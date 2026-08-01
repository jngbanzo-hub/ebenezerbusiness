# Stockages V2 — préparation locale

Ce dossier décrit la migration préparatoire du système Stockages. Il n'est
importé par aucun fichier de production et n'exécute aucune lecture ou écriture
distante.

Décision d'architecture : **Supabase est le journal canonique et la projection
transactionnelle**. Google Sheets devient une projection/export en lecture et
Apps Script ne conserve que des outils d'export ou de contrôle explicitement
non autoritaires.

Principes non négociables :

- Stockages uniquement pour FIH, LSHI et KLZ ;
- un seul compte commun par agence, jamais un compte par Agent ;
- identité et agence dérivées côté serveur depuis Supabase Auth ;
- arrivage physique et livraison physique sont des commandes explicites ;
- paiement et livraison sont indépendants ;
- MANIFESTE PUBLIC ne produit aucun mouvement ;
- événements et Audit immutables ;
- correction par compensation uniquement ;
- aucune écriture directe du navigateur dans les tables canoniques.

Documents :

- `ARCHITECTURE.md` : comparaison des options et responsabilités ;
- `DATA_MODEL.md` : tables, contraintes et projections ;
- `MULTI_AGENT.md` : concurrence et idempotence ;
- `SECURITY.md` : authentification, RLS et frontières de confiance ;
- `MIGRATION_PLAN.md` : neutralisation de l'ancien moteur et ordre de migration ;
- `ROLLBACK.md` : sauvegarde, critères d'arrêt et restauration ;
- `WEIGHT_SOURCE.md` : résolution stricte du poids et gestion des divergences ;
- `weight-source.ts` : résolveur pur préparatoire et mocks des sources autorisées ;
- `contracts.ts` : contrats TypeScript préparatoires purs.

Les migrations, RPC, validations et tests SQL préparatoires sont versionnés
séparément sous `../supabase/stockages-v2/`. Leur `README.md` impose l'ordre
d'application futur et rappelle qu'aucun de ces scripts n'est actif pendant la
Phase 2.2.

La migration distante, les écrans et les routes ne font pas partie de cette
phase.
