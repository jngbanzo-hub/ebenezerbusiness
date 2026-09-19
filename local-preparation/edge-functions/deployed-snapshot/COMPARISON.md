# Certification des Edge Functions Paiements

Récupération en lecture seule effectuée le `2026-07-30T21:46:27Z` avec
`supabase functions download --use-api`. Aucun appel métier n'a été exécuté.

| Fonction | Version | État | SHA-256 déployé | SHA-256 CANONIQUE_PROVISOIRE | Résultat |
|---|---:|---|---|---|---|
| `paiements-agents-rechercher-colis` | 3 | ACTIVE | `a347319e4c42ccbe835f8f9690be26f08dc1050e1853897bef35ee71d6db5d0b` | `a347319e4c42ccbe835f8f9690be26f08dc1050e1853897bef35ee71d6db5d0b` | IDENTIQUE |
| `paiements-agents-enregistrer-paiement` | 4 | ACTIVE | `1cbcb2b7cd6e927ec268c086f94329e53a4a885d09b03c36bbb4f09b5b485c9a` | `1cbcb2b7cd6e927ec268c086f94329e53a4a885d09b03c36bbb4f09b5b485c9a` | IDENTIQUE |

Chaque fonction déployée contient un seul fichier `index.ts`. Les snapshots sont
des copies byte-for-byte de ces fichiers. Le manifeste ne contient ni clé, ni
jeton, ni valeur de secret.
