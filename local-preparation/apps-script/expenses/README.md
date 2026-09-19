# Apps Script Dépenses

Copie effectuée le 2026-07-30. `canonical/Code.gs` est l'unique référence active
provisoire ; la version MIGRATION, identique par empreinte, reste une archive.
Interdiction de déployer directement sans phase dédiée. Aucun secret réel n'est
versionné.

| Fichier versionné | Source d'origine | SHA-256 | Octets | Lignes | Statut |
|---|---|---:|---:|---:|---|
| `canonical/Code.gs` | `local-preparation/DEPENSES_PUBLIC_CODE_PRODUCTION_PRET.gs` | `85977e74a8004609f9506d204f7fc5cbcf2a050728b97a5e97f6c8e69fe81bc8` | 59158 | 2812 | CANONIQUE_PROVISOIRE |
| `archive/2026-07-30-depenses-public-code-avant-migration-originale.gs` | `local-preparation/DEPENSES_PUBLIC_CODE_AVANT_MIGRATION.gs` | `683dbaca3a0d79df96ac2509dbaa44bd94416e162893a7c4fbab356a852d9ef1` | 21255 | 1088 | ARCHIVE |
| `archive/2026-07-30-depenses-public-code-migration-originale.gs` | `local-preparation/DEPENSES_PUBLIC_CODE_MIGRATION.gs` | `85977e74a8004609f9506d204f7fc5cbcf2a050728b97a5e97f6c8e69fe81bc8` | 59158 | 2812 | ARCHIVE |
| `archive/2026-07-30-depenses-public-code-actif-originale.gs` | `/Users/macbookairm4/Documents/DEPENSES_PUBLIC_CODE_ACTIF.gs` | `683dbaca3a0d79df96ac2509dbaa44bd94416e162893a7c4fbab356a852d9ef1` | 21255 | 1088 | ARCHIVE |

Fonctions principales : création et consultation de dépenses, identifiants
`expenseRequestId` et `correctionRequestId`, correction, annulation et Audit.
La nouvelle génération ajoute les contrôles et parcours de correction absents
ou incomplets dans l'ancienne génération. Le moteur dépend de ses feuilles
Google Sheets techniques. Aucune propriété Apps Script lue par
`PropertiesService.getScriptProperties().getProperty(...)` n'a été relevée
dans cette copie. La version distante reste non certifiée.
