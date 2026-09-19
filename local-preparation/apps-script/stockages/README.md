# Apps Script Stockages

Copie effectuée le 2026-07-30. La synchronisation réelle V2 est la référence
canonique provisoire car elle représente la génération locale la plus récente et
complète. Interdiction de déployer directement sans phase dédiée. Aucun secret
réel n'est versionné.

| Fichier versionné | Source d'origine | SHA-256 | Octets | Lignes | Statut |
|---|---|---:|---:|---:|---|
| `canonical/Code.gs` | `/Users/macbookairm4/Documents/Code-STOCKAGES-PUBLIC-SYNCHRONISATION-REELLE-V2.gs` | `4d710aab6ee144a98f89c57c27ffc80d4533a9fde5371cbb1a5fc80e5db0b993` | 189424 | 7954 | CANONIQUE_PROVISOIRE |
| `archive/2026-07-30-stockages-public-avant-audit-originale.gs` | `/Users/macbookairm4/Documents/Code-STOCKAGES-PUBLIC-AVANT-AUDIT.gs` | `b3a73d44475b0e0113c1a577df04bd88a719bd436b1b246f3626be7ad585d7ae` | 66344 | 2915 | ARCHIVE |
| `archive/2026-07-30-stockages-public-apres-audit-originale.gs` | `/Users/macbookairm4/Documents/Code-STOCKAGES-PUBLIC-APRES-AUDIT.gs` | `4963f988dd364d2f4df66669733895c4d21340eb6a66a4f3236a39487b47067c` | 88266 | 3828 | ARCHIVE |
| `archive/2026-07-30-stockages-public-audit-corrige-originale.gs` | `/Users/macbookairm4/Documents/Code-STOCKAGES-PUBLIC-AUDIT-CORRIGE.gs` | `5505a5d949fb6979efae27fe770c4165ada3c8aae269862bf079986f60d64d51` | 89617 | 3885 | ARCHIVE |
| `archive/2026-07-30-stockages-public-audit-corrige-v2-originale.gs` | `/Users/macbookairm4/Documents/Code-STOCKAGES-PUBLIC-AUDIT-CORRIGE-V2.gs` | `0f6e9f8229e8a90d01df6feefa7488da9a0dad8397017170091831b07c1c5a65` | 89400 | 3879 | ARCHIVE |
| `archive/2026-07-30-stockages-public-simulation-v1-originale.gs` | `/Users/macbookairm4/Documents/Code-STOCKAGES-PUBLIC-SIMULATION-V1.gs` | `606bcfd1c165c814f3f7eaaeb10e49b4bba37c9ee5013c4abc586d3d6acd7507` | 140446 | 5923 | ARCHIVE |
| `archive/2026-07-30-stockages-public-simulation-v2-originale.gs` | `/Users/macbookairm4/Documents/Code-STOCKAGES-PUBLIC-SIMULATION-V2.gs` | `85f2296e1addcd06068d0f9f9be75edf5b936e365416b236b126a6ec13324703` | 140530 | 5925 | ARCHIVE |
| `archive/2026-07-30-stockages-public-exclusions-v1-originale.gs` | `/Users/macbookairm4/Documents/Code-STOCKAGES-PUBLIC-EXCLUSIONS-V1.gs` | `d26fddd5549a6e9bafaf3ea79de360e66c80ef8c96f677207e1fe6c7f95f8b78` | 162037 | 6787 | ARCHIVE |
| `archive/2026-07-30-stockages-public-synchronisation-reelle-v1-originale.gs` | `/Users/macbookairm4/Documents/Code-STOCKAGES-PUBLIC-SYNCHRONISATION-REELLE-V1.gs` | `623227f84d05b3ee789fb860d6d22dfd68e50988163bd85a09ae4611f2ddb8e3` | 188792 | 7928 | ARCHIVE |
| `archive/2026-07-30-stockages-public-synchronisation-reelle-v2-originale.gs` | `/Users/macbookairm4/Documents/Code-STOCKAGES-PUBLIC-SYNCHRONISATION-REELLE-V2.gs` | `4d710aab6ee144a98f89c57c27ffc80d4533a9fde5371cbb1a5fc80e5db0b993` | 189424 | 7954 | ARCHIVE |

Fonctions principales : photographie initiale, simulation, synchronisation
réelle, Status Event ID, Movement ID, exclusions, Audit et verrouillage par
`LockService`. Le moteur dépend des feuilles de manifeste/stock, de ses feuilles
techniques. Aucune propriété Apps Script lue par
`PropertiesService.getScriptProperties().getProperty(...)` n'a été relevée
dans cette copie.

Risques connus : absence de refus préventif strict du stock négatif, absence
d'API web sécurisée, version distante non certifiée.
