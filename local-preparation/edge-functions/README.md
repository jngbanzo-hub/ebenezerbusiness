# Edge Functions Paiements

Copies documentaires effectuées le 2026-07-30. Statut :
**CANONIQUE_PROVISOIRE**. Interdiction de déployer directement sans phase
dédiée. Aucun secret réel n'est versionné ; seules les références aux variables
d'environnement attendues par le code sont conservées.

| Fichier versionné | Source d'origine | SHA-256 | Octets | Lignes |
|---|---|---:|---:|---:|
| `paiements-agents-rechercher-colis/index.ts` | `/Users/macbookairm4/Documents/Codex/ebenezerbusiness-mobile-payment-request-id/supabase/functions/paiements-agents-rechercher-colis/index.ts` | `a347319e4c42ccbe835f8f9690be26f08dc1050e1853897bef35ee71d6db5d0b` | 10092 | 336 |
| `paiements-agents-enregistrer-paiement/index.ts` | `/Users/macbookairm4/Documents/Codex/ebenezerbusiness-mobile-payment-request-id/supabase/functions/paiements-agents-enregistrer-paiement/index.ts` | `1cbcb2b7cd6e927ec268c086f94329e53a4a885d09b03c36bbb4f09b5b485c9a` | 18309 | 665 |

Fonctions principales : recherche autorisée d'un colis et enregistrement
idempotent d'un paiement via Apps Script. Elles dépendent de Supabase, d'un JWT
utilisateur et des variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`PAIEMENTS_AGENTS_APPS_SCRIPT_URL`, `PAIEMENTS_AGENTS_API_KEY` et
`PAIEMENTS_AGENTS_TIMEOUT_MS`.

Défauts connus : version distante non certifiée ; contrôle de l'identité,
de l'activité et de l'agence mais validation explicite du rôle absente dans le
parcours d'enregistrement observé ; devise non structurée ; absence de HMAC vers
Apps Script.
