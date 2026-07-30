# Contrats métier préparatoires

Ces contrats sont une préparation locale, sans connexion à la production. Ils
ne sont importés par aucun moteur Apps Script, aucune Edge Function, aucune
route et aucun composant du site. Ils ne doivent pas être déployés ou connectés
à un moteur réel sans une phase dédiée.

## Agences

Les agences canoniques uniques sont `COO`, `FIH`, `LSHI` et `KLZ`.
La normalisation supprime les espaces extérieurs, normalise la casse et convertit
`COTONOU` en `COO`. Toute valeur vide, non textuelle ou inconnue est refusée avec
`INVALID_AGENCY`. La variante `COT` n'est pas acceptée, car elle n'a pas été
trouvée dans les sources historiques auditées.

## Événements financiers

Un nouvel événement financier canonique utilise exclusivement `USD`, un montant
strictement positif avec au maximum deux décimales et des identifiants distincts :

- `eventId` identifie l'événement immutable ;
- `sourceId` identifie l'objet métier qui a produit l'événement ;
- `requestId` identifie la requête idempotente et n'est pas interchangeable avec
  les deux identifiants précédents.

`EXPENSE_RECORDED` représente la saisie initiale. `EXPENSE_APPROVED` et
`EXPENSE_REJECTED` représentent respectivement une validation et un refus
ultérieurs : ils restent donc trois événements distincts. Une correction ou une
annulation ne modifie pas un événement existant ; `FINANCIAL_REVERSAL` crée un
événement compensatoire et référence l'événement compensé dans `reversalOf`.

Les relevés historiques USD, FCFA et CDF utilisent `LegacyFinancialRecord`.
Le montant et la devise d'origine sont conservés sans conversion automatique.
Un relevé historique ne peut pas être transmis à `createFinancialEvent`.

## Vocabulaire, destination et position

`destinationInitiale` est l'agence prévue à la création et reste immutable.
`destinationCourante` est le lieu de retrait prévu après d'éventuels
réacheminements. `currentAgency` décrit uniquement l'agence où le colis est
physiquement présent. Ces trois notions ne sont jamais interchangeables.

`ParcelPosition` est une projection versionnée (`version` commence à zéro ou
plus) : `AT_AGENCY` exige `currentAgency`, `IN_TRANSIT` exige `transitFrom` et
`transitTo`, tandis que `DELIVERED` et `UNKNOWN` n'exposent aucune agence
physique. Une commande fournit `expectedPositionVersion` pour détecter une
écriture concurrente.

## Séparation paiement et livraison

**PAYÉ ≠ LIVRÉ.** Un événement financier ne contient aucun statut
logistique et ne produit aucun mouvement de stock. Une opération de paiement ne
peut jamais constituer une confirmation physique de livraison. Les statuts
`NON_PAYE`, `PARTIELLEMENT_PAYE` et `PAYE` restent financiers. Une livraison
physique valide n'est donc pas conditionnée par `PAYE` et ne modifie aucun de
ces statuts.

## Événements de stock

Les événements futurs documentent les mouvements `ENTREE_COO`, `SORTIE_COO`,
`ENTREE_DESTINATION`, `SORTIE_REACHEMINEMENT`, `ENTREE_REACHEMINEMENT`,
`ARRIVAL_MISMATCH_CONFIRMED`, `SORTIE_LIVRAISON`, `AJUSTEMENT_ADMIN` et
`STOCK_REVERSAL`.
`SORTIE_DESTINATION` reste accepté uniquement pour relire l'historique ; toute
nouvelle livraison doit utiliser `SORTIE_LIVRAISON`.

Les règles de domaine futures sont :

- `ENREGISTRÉ` pourra produire `ENTREE_COO` ;
- `EN_VOL` pourra produire `SORTIE_COO` ;
- `ARRIVÉ` pourra produire `ENTREE_DESTINATION` ;
- seule une remise physique explicite pourra produire `SORTIE_LIVRAISON` ;
- la valeur `LIVRÉ` d'un manifeste ne constitue pas, seule, une preuve suffisante ;
- aucune arrivée implicite propre à KLZ n'est prévue ;
- un paiement ne produit jamais de `StockEvent`.

MANIFESTE PUBLIC reste strictement en lecture seule. Ces contrats ne contiennent
aucune synchronisation ni aucun accès à Google Sheets.

### Arrivée physique inattendue

`ARRIVAL_MISMATCH_CONFIRMED` constate qu'un colis en transit est reçu dans une
agence différente de `transitTo`. `expectedAgency` conserve l'agence attendue,
`actualAgency` l'agence physique réelle. La source est strictement `AGENT` ou
`ADMIN`. L'identité, l'agence du confirmateur, un motif, la confirmation
physique et une référence de preuve textuelle sont obligatoires.

L'événement ne change ni `destinationInitiale` ni `destinationCourante` et ne
crée automatiquement ni réacheminement, frais ou paiement. Un Agent pourra
ultérieurement être autorisé côté serveur seulement si son profil authentifié
correspond à `actualAgency`. Le contrat local représente les données nécessaires
mais n'effectue aucune authentification.

## Sources et identité

Les sources financières autorisées sont `PAYMENT_ENGINE`, `EXPENSE_ENGINE`,
`ADMIN`, `SYSTEM` et `LEGACY_IMPORT`. Les sources de stock sont
`MANIFEST_OBSERVATION`, `DELIVERY_CONFIRMATION`, `ADMIN`, `SYSTEM` et
`LEGACY_IMPORT`.

`deliveryRequestId`, `reroutingRequestId`, `stockMovementRequestId` et
`financialRequestId` sont distincts et ne réutilisent jamais
`paymentRequestId`. L'agence déclarée par un navigateur n'est pas une autorité :
une future couche serveur devra la comparer au profil authentifié.

Même identifiant et même empreinte rejouent le résultat initial (`REPLAYED`) ;
le même identifiant avec une empreinte différente produit `CONFLICT`. Une
nouvelle empreinte produit `CREATED`.

## Livraison, réacheminement et frais

Une livraison exige une position `AT_AGENCY`, la même agence physique que
l'agence serveur de l'acteur et une remise physique confirmée. Elle produit
`SORTIE_LIVRAISON`, puis une position `DELIVERED`. Le résultat conserve les
positions avant/après et l'état d'idempotence.

Un réacheminement suit `PROPOSED`, `APPROVED`, `DEPARTED`, `ARRIVED` ou
`CANCELLED`. Le départ crée une sortie puis une position `IN_TRANSIT`; l'arrivée
exige une entrée physique et produit `AT_AGENCY`. La destination initiale reste
inchangée. Toute annulation après engagement exige une compensation documentée.

Les frais utilisent `REROUTING_FEE_ASSESSED` et
`REROUTING_FEE_REVERSED`. Ce sont des créances, jamais des paiements. Le tarif
USD est identifié et versionné ; un Agent sélectionne un tarif mais ne fixe pas
librement un montant exécutoire. `montantInitial` est immutable, tandis que
`totalDu` et `nouveauSolde` sont des projections. Une future dérogation exigera
une identité Admin et un motif.

## Transitions et compensations

Les transitions ordinaires sont `UNKNOWN → AT_AGENCY`,
`AT_AGENCY → IN_TRANSIT`, `IN_TRANSIT → AT_AGENCY` et
`AT_AGENCY → DELIVERED`. Sont refusés : livraison en transit, livraison par une
autre agence, déplacement direct d'agence à agence et retour depuis `DELIVERED`
sans correction Admin compensatoire.

Les événements sont immutables et ne sont jamais supprimés. Une correction
utilise `AJUSTEMENT_ADMIN` ou `STOCK_REVERSAL`, référence l'événement compensé,
conserve état/version avant et après, identité Admin, date et motif.

## Métadonnées et immutabilité

Les objets retournés et leurs métadonnées sont profondément gelés. Les
métadonnées doivent être sérialisables en JSON : aucune fonction, `Date` native,
valeur `undefined`, valeur non finie, référence cyclique ou prototype spécialisé
n'est accepté. Leur profondeur maximale est de 8 niveaux, leur nombre total de
propriétés et d'éléments est limité à 200, chaque chaîne à 4 000 caractères et
chaque clé à 100 caractères.

La validation technique interdit une liste explicite de clés sensibles :
`password`, `passwd`, `secret`, `token`, `access_token`, `refresh_token`,
`authorization`, `bearer`, `api_key`, `api-key`, `private_key`, `private-key`,
`hmac_secret` et `service_role_key`. La comparaison est insensible à la casse et
aux séparateurs espace, tiret et underscore. Elle porte sur la clé entière après
normalisation : une clé métier comme `secretariat` reste donc autorisée. Toute
liste fermée peut néanmoins produire des faux positifs si un producteur utilise
exactement un nom réservé dans un autre sens.

Cette validation garantit la structure JSON-safe, les limites indiquées et le
refus de ces clés. Elle n'analyse pas sémantiquement les textes libres et ne peut
pas reconnaître de façon fiable un véritable token, mot de passe ou secret
dissimulé sous une clé neutre. Le contrat métier interdit malgré tout de placer
dans les métadonnées une API key, un token, un mot de passe, un JWT, une clé
privée, un secret HMAC, un contenu d'authentification ou une variable
d'environnement sensible. Les producteurs d'événements sont responsables du
respect de cette interdiction, complétée par la revue de code et la détection de
secrets dans Git.

## Frontières

Le module Transferts reste totalement indépendant de ces contrats et n'est une
source d'aucun événement financier ou de stock. Aucun type ou moteur de ce
dossier n'établit de lien avec la Caisse ou Dépenses. MANIFESTE PUBLIC reste une
observation en lecture seule. Aucun contrat ne dépend du navigateur, du mobile,
d'Apps Script, de Supabase ou de Vercel.

## Tests locaux

Les tests ciblés couvrent les agences, les validations communes, les événements
financiers, les relevés historiques, les mouvements de stock, l'immutabilité et
les frontières de domaine. Ils utilisent uniquement des fixtures locales.
