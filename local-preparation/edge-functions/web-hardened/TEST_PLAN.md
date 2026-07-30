# Plan de tests

Le fichier `tests/hardened-edge.test.mjs` exécute les deux gestionnaires avec
des doubles locaux de Supabase et Apps Script. Aucun réseau ou service distant
n'est contacté.

Les 49 contrôles couvrent :

- JWT absent, invalide et expiré ;
- profil absent, inactif et rôle non-Agent ;
- Agent actif et identité serveur ;
- recherche globale de FIH, LSHI et KLZ pour COO/FIH/LSHI/KLZ ;
- refus avant Apps Script des agences et destinations inconnues ;
- paiement partiel COO et refus métier destination ;
- usurpation d'agence et de rôle ;
- UUID v4 obligatoire, normalisé, transmis et stable ;
- clés inattendues, code, mode et montant invalides ;
- réponses amont malformées et messages non sûrs ;
- absence de statut logistique, livraison, stock, Transferts, Caisse et écriture
  Google Sheets directe ;
- compatibilité des succès et erreurs avec le client Web existant.

Commande ciblée :

```sh
node --test local-preparation/edge-functions/web-hardened/tests/hardened-edge.test.mjs
```
