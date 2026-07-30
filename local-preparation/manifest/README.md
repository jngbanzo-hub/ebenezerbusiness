# Manifestes — cadrage documentaire

Document préparatoire créé le 2026-07-30. Aucun code de manifeste ni formule
n'est modifié ou déployé. Aucun secret réel n'est versionné.

## Manifeste principal

Le **Manifeste De L’Expédition COO** reste la source métier principale actuelle
pour le code colis, l'expéditeur, le bénéficiaire, le poids, le prix à payer, le
paiement affiché et le statut logistique affiché. Son code et ses formules ne
sont pas encore versionnés intégralement.

## MANIFESTE PUBLIC

MANIFESTE PUBLIC est un miroir importé strictement en lecture seule. Aucun
moteur futur ne doit écrire dans K, L ou toute autre colonne. Il ne doit jamais
servir de lieu de confirmation physique.

## Paiement et livraison

Le paiement est une information financière. `PAYÉ`, `SOLDÉ` ou la présence
d'une ligne de paiement ne prouvent pas une remise physique. Le statut `LIVRÉ`
ne doit pas être déduit automatiquement d'une présence dans une feuille de
paiement. La méthode définitive de confirmation de livraison sera choisie dans
une phase séparée ; aucune option de livraison n'est implémentée en Phase 0A.
