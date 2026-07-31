# Architecture préparatoire de la Caisse

## Frontières

La caisse est un agrégat financier unique par agence pour `FIH`, `LSHI` et
`KLZ`. Elle n'est jamais créée par agent. Les agents de l'agence alimentent le
même total, mais les encaissements restent ventilés par `actorUserId` et
`actorName`. Les agents auront une lecture seule ; l'ouverture, la clôture et
les corrections relèvent de l'Admin.

`COO` ne possède aucune caisse. Ses paiements sont des **Recettes COO hors
caisse**. Ses dépenses restent enregistrées par le module Dépenses existant et
sont classées comme financées directement par le PDG, sans débit de caisse.

## Sources existantes à réutiliser

### Encaissements

Le parcours Agent recherche un colis puis enregistre un paiement idempotent.
Les données disponibles incluent `paymentRequestId`, code colis, date, montant,
agence d'encaissement, destination, agent, mode, référence et observation.
L'Admin dispose déjà de filtres par période, agence, destination, colis et
agent, ainsi que des totaux montant/nombre/poids par agence. Il manque une
projection de solde journalier et une ventilation statistique native par agent.

La future intégration devra transformer chaque paiement confirmé en
`PAYMENT_CREDIT_RECORDED`, avec `sourceId` issu de la ligne métier et `requestId`
issu de `paymentRequestId`. Aucun paiement ne sera dupliqué ou réécrit.

### Dépenses

Le module existant fournit `expenseRequestId`, agence et identité serveur de
l'acteur, catégorie, description, montant, devise, mode, référence,
observation, corrections, annulations, statistiques par période/site/devise et
Audit. La future intégration transformera uniquement une dépense USD effective
de FIH/LSHI/KLZ en `EXPENSE_DEBIT_RECORDED`. Les dépenses COO restent hors
caisse. FCFA et CDF restent historiques et ne sont jamais convertis
automatiquement.

### Stockages et logistique

Ils peuvent fournir du contexte opérationnel mais ne constituent jamais une
source de mouvement de caisse. `PAYÉ ≠ LIVRÉ` et aucun événement de stock ne
crédite ou débite la caisse.

## Projection quotidienne

```text
solde actuel = solde d'hier + encaissements du jour - dépenses du jour
               + corrections compensatoires nettes
```

Le solde initial est un événement audité. Une clôture quotidienne capture le
solde calculé sans modifier les événements sources. L'historique est immutable.
Une correction ajoute un événement compensatoire référant l'événement corrigé
et exige un motif ; elle ne supprime ni ne remplace l'original.

## Multi-agents

La projection regroupe les crédits de paiement par identité stable de l'agent,
puis calcule le nombre et le montant encaissé. La somme de ces groupes est le
total de l'unique caisse de l'agence. Une future ingestion devra exiger un
`actorUserId` fiable côté serveur ; le nom seul actuellement exposé dans les
lectures Admin ne suffit pas comme identité durable.

## Persistance future (non créée dans cette phase)

Une future migration pourra séparer : événements immutables, clôtures
journalières, projection courante et audit. Les clés d'idempotence des sources
seront uniques. Aucun écran, aucune table, aucune API et aucune connexion aux
modules actuels ne sont créés ici.
