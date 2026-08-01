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
- `contracts.ts` : contrats TypeScript préparatoires purs.

La migration distante, les écrans et les routes ne font pas partie de cette
phase.
