# Source canonique du poids

## Sources analysées

### Manifeste d'expédition utilisé par Encaissements

Le moteur canonique Paiements lit les feuilles FIH, LSHI et KLZ du manifeste
d'expédition, avec le code en colonne B, le poids en E, le prix en F et le
statut en I. La recherche existante retourne actuellement la dernière ligne
correspondante : un doublon peut donc être masqué.

Cette source possède le code, la destination portée par la feuille et le poids
avant paiement. Elle est accessible en lecture serveur et reste disponible pour
un colis non payé. Elle est retenue comme **source principale**, mais via un
nouveau résolveur serveur strict : toutes les occurrences du code sont lues.

### Recherche Encaissements

`paiements-agents-rechercher-colis` expose déjà `codeColis`, `destinationCode`
et `poidsKg`, mais délègue au même Apps Script/manifeste. Ce n'est pas une
source indépendante. Sa validation empêche une substitution de code ou de
destination, mais son comportement « dernière occurrence » ne certifie pas
l'unicité. Elle peut être réutilisée comme façade après durcissement, pas comme
deuxième preuve.

### PAIEMENTS AGENTS

Les feuilles de paiement conservent un instantané du poids en colonne C et la
destination en H. Elles peuvent contenir plusieurs paiements pour le même colis
et ne contiennent rien pour un colis jamais payé. Elles sont retenues comme
**contrôle secondaire facultatif**, jamais comme condition de livraison et
jamais comme déclencheur de sortie.

### MANIFESTE PUBLIC statistique et source de suivi public

Les lecteurs statistiques détectent déjà codes dupliqués et poids divergents.
Les sources de suivi public peuvent contenir une autre projection ou une
fraîcheur différente. Elles servent au rapprochement et à l'anomalie, pas à
choisir silencieusement un poids.

## Algorithme certifié à préparer côté serveur

1. Normaliser le code (`trim`, majuscules, format borné).
2. Dériver l'agence depuis le profil Agent actif.
3. Lire uniquement la feuille de cette destination dans la source principale.
4. Collecter toutes les occurrences exactes du code.
5. Refuser zéro occurrence (`PARCEL_NOT_FOUND`).
6. Refuser toute occurrence d'une autre destination (`PARCEL_AGENCY_MISMATCH`).
7. Parser chaque poids strictement en kilogrammes, sans valeur par défaut.
8. Refuser poids absent, nul ou négatif (`PARCEL_WEIGHT_UNAVAILABLE`).
9. Refuser plusieurs poids distincts (`PARCEL_WEIGHT_AMBIGUOUS`).
10. Lire les instantanés PAIEMENTS AGENTS disponibles. Une divergence produit
    `PARCEL_WEIGHT_CONFLICT` ; aucun poids n'est choisi.
11. Fournir à la RPC le poids, le type de source et une référence non secrète.

Une divergence bloque uniquement `CONFIRMED_DELIVERY_RECORDED`. Le paiement
déjà réussi reste intact. Une anomalie Stockages est enregistrée pour l'Admin.
L'Agent ne saisit jamais le poids.
