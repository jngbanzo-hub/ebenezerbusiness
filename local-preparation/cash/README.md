# Phase Caisse 0

Ce dossier contient uniquement une architecture locale préparatoire et pure.
Il n'est importé par aucun fichier de production et n'effectue ni lecture, ni
écriture, ni appel réseau.

- `cash-contract.ts` définit les agences, événements immutables, règles COO et
  devise canonique.
- `cash-projection.ts` calcule le solde quotidien, la ventilation multi-agents,
  la clôture et les capacités Agent/Admin.
- `fixtures.ts` fournit des objets locaux de test.
- `cash.test.ts` certifie les règles métier.
- `ARCHITECTURE.md` documente l'audit et les futures interactions.

Décisions structurantes : une seule caisse par agence FIH/LSHI/KLZ, aucune
caisse COO, USD uniquement sans conversion automatique, agents en lecture
seule, Admin responsable des opérations de caisse, corrections compensatoires
et audit immutable.
