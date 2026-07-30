# Apps Script Paiements

Copie effectuée le 2026-07-30. La référence active unique est
`canonical/Code.gs`, choisie comme version locale analysée la plus complète.
Ces fichiers sont documentaires : interdiction de les déployer directement sans
phase dédiée. Aucun secret réel n'est versionné.

| Fichier versionné | Source d'origine | SHA-256 | Octets | Lignes | Statut |
|---|---|---:|---:|---:|---|
| `canonical/Code.gs` | `/Users/macbookairm4/Documents/Code.gs` | `1d680bdb6f80051580c145439188f09494319284f03f6a3b1448ad366419ff25` | 56756 | 2721 | CANONIQUE_PROVISOIRE |
| `archive/2026-07-30-code-active-production-originale.gs` | `/Users/macbookairm4/Documents/Code-active-production.gs` | `63311fc7a82f1858ab5e293485bc0722e46dbf6f62b5277cb23b4215480f32e1` | 53835 | 2582 | ARCHIVE |
| `archive/2026-07-30-code-payment-request-id-working-originale.gs` | `/Users/macbookairm4/Documents/Code-payment-request-id-working.gs` | `58438f4ffa55d6de9dcf383ce7d1f368e55f0b00cd731ff3710d1c89a426c7cc` | 56278 | 2690 | ARCHIVE |
| `archive/2026-07-30-code-recherche-colis-solde-working-originale.gs` | `/Users/macbookairm4/Documents/Code-recherche-colis-solde-working.gs` | `1d680bdb6f80051580c145439188f09494319284f03f6a3b1448ad366419ff25` | 56756 | 2721 | ARCHIVE |

Fonctions principales : recherche de colis et de solde, enregistrement et
consultation des paiements, initialisation/maintenance des feuilles et Audit.
Le moteur dépend des feuilles Google Sheets de manifeste, paiements, soldes et
Audit. La propriété Apps Script attendue explicitement est
`PAIEMENTS_AGENTS_API_KEY`.

Défauts connus : deux déclarations `doPost` sont possibles dans `Code.gs` ;
`paymentRequestId` est écrit en colonne 16 alors que l'en-tête observé peut ne
contenir que 15 colonnes ; la devise n'est pas structurée ; aucune signature
HMAC n'est appliquée. La version distante n'est pas encore certifiée.
