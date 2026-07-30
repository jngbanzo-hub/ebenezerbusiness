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

## Séparation paiement et livraison

**PAIEMENT ≠ LIVRAISON.** Un événement financier ne contient aucun statut
logistique et ne produit aucun mouvement de stock. Une opération de paiement ne
peut jamais constituer une confirmation physique de livraison.

## Événements de stock

Les événements futurs documentent les mouvements `ENTREE_COO`, `SORTIE_COO`,
`ENTREE_DESTINATION`, `SORTIE_DESTINATION`, `AJUSTEMENT_ADMIN` et
`STOCK_REVERSAL`.

Les règles de domaine futures sont :

- `ENREGISTRÉ` pourra produire `ENTREE_COO` ;
- `EN_VOL` pourra produire `SORTIE_COO` ;
- `ARRIVÉ` pourra produire `ENTREE_DESTINATION` ;
- seule une confirmation physique explicite pourra produire
  `SORTIE_DESTINATION` ;
- la valeur `LIVRÉ` d'un manifeste ne constitue pas, seule, une preuve suffisante ;
- aucune arrivée implicite propre à KLZ n'est prévue ;
- un paiement ne produit jamais de `StockEvent`.

MANIFESTE PUBLIC reste strictement en lecture seule. Ces contrats ne contiennent
aucune synchronisation ni aucun accès à Google Sheets.

## Sources et identité

Les sources financières autorisées sont `PAYMENT_ENGINE`, `EXPENSE_ENGINE`,
`ADMIN`, `SYSTEM` et `LEGACY_IMPORT`. Les sources de stock sont
`MANIFEST_OBSERVATION`, `DELIVERY_CONFIRMATION`, `ADMIN`, `SYSTEM` et
`LEGACY_IMPORT`.

`movementId` identifie uniquement un mouvement de stock. `actorUserId` est
obligatoire, sauf pour une source explicitement système ou un import historique.
`requestId` suit la même exception. Les dates d'occurrence sont ISO 8601 et les
dates métier suivent `YYYY-MM-DD`.

## Métadonnées et immutabilité

Les objets retournés et leurs métadonnées sont profondément gelés. Les
métadonnées doivent être sérialisables en JSON : aucune fonction, `Date` native,
valeur `undefined`, valeur non finie, référence cyclique ou prototype spécialisé
n'est accepté. Les clés évoquant un secret, un token, une API key, un mot de
passe ou une clé privée sont refusées.

## Frontières

Le module Transferts reste totalement indépendant de ces contrats et n'est une
source d'aucun événement financier ou de stock. Aucun type ou moteur de ce
dossier n'établit de lien avec la Caisse.

## Tests locaux

Les tests ciblés couvrent les agences, les validations communes, les événements
financiers, les relevés historiques, les mouvements de stock, l'immutabilité et
les frontières de domaine. Ils utilisent uniquement des fixtures locales.
