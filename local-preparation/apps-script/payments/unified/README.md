# Moteur Paiements unifié — préparation locale

Cette version est une préparation locale non déployée. Elle ne modifie ni Apps
Script distant, ni Google Sheets, ni Edge Function, ni application Web/mobile.
La source canonique reste intacte.

## Pourquoi unifier

La source canonique contient deux déclarations `doPost`. En JavaScript, la
dernière déclaration remplace la précédente : le comportement dépend donc de
l'ordre du fichier et deux contrats concurrents peuvent sembler actifs alors
qu'un seul l'est réellement. Cette version possède un point d'entrée unique,
parse le JSON une fois et route explicitement `ping`, `rechercherColis` et
`enregistrerPaiement` avec un `switch`.

## Contrat et compatibilité

Le format principal V2 utilise `ok`, `data` et `requestId`, ou `ok: false` avec
un objet `error`. Apps Script peut néanmoins répondre avec un statut HTTP
technique 200 ; les clients doivent donc lire `ok`.

Pendant une transition contrôlée, les champs dépréciés `success` et `succes`
sont dérivés de `ok`. Une recherche ajoute `found` et `colis`, et un paiement
ajoute `simulation` et `paiement`. Les erreurs ajoutent temporairement `code`,
`message` et `erreur` au premier niveau ; un colis introuvable ajoute aussi
`found: false`. Tous ces alias sont dérivés de l'unique enveloppe V2. Il
n'existe aucune seconde logique métier.

`requestId` trace une requête et sa réponse. `paymentRequestId` est un UUID v4
obligatoire, normalisé en minuscules, qui garantit l'idempotence d'un paiement.
Ces identifiants sont distincts.

Le site Web génère déjà cet UUID automatiquement et le conserve pour une
nouvelle tentative identique. L'application mobile actuelle ne transmet pas
encore `paymentRequestId`. Le moteur unifié ne peut donc pas être déployé tant
que le mobile n'a pas été corrigé dans une phase séparée pour générer et
conserver le même UUID lors d'une nouvelle tentative. L'Edge Function devra
ensuite rendre ce champ obligatoire.

## Feuilles et colonne 16

Les feuilles d'encaissement attendues sont `COO`, `FIH`, `LSHI` et `KLZ`.
Leur colonne 16 (`P1`) est officiellement `Payment Request ID`. Avant chaque
paiement, les 16 en-têtes des quatre feuilles sont contrôlés sous verrou. Une
feuille absente, un en-tête vide ou différent bloque l'écriture avec
`STRUCTURE_FEUILLE_INVALIDE`.

Cette source ne crée ni en-tête ni feuille. La migration de `P1` doit être
réalisée séparément avant tout futur déploiement.

## Règles d'encaissement

- destinations : `FIH`, `LSHI`, `KLZ` ;
- agences d'encaissement : `COO`, `FIH`, `LSHI`, `KLZ` ;
- `COTONOU` est normalisé vers `COO` ;
- COO peut encaisser pour les trois destinations et accepter un paiement
  partiel ;
- FIH, LSHI et KLZ encaissent uniquement leur propre destination et exigent le
  solde exact ;
- le montant est strictement positif, limité à deux décimales et ne dépasse
  jamais le solde ;
- les seuls modes conservés de la source canonique sont `ESPÈCES`,
  `MOBILE MONEY`, `VIREMENT` et `AUTRE`.

Les entrées `ESPECES` et `ESPÈCES` sont normalisées vers `ESPECES`.
`MOBILE_MONEY` et `MOBILE MONEY` sont normalisés vers `MOBILE MONEY`, ce qui
préserve à la fois le site Web et les clients historiques. Google Sheets reçoit
toujours `ESPÈCES`, `MOBILE MONEY`, `VIREMENT` ou `AUTRE`.

Le verrou Apps Script couvre validation de structure, contrôle d'idempotence sur
les quatre feuilles, relecture du colis et du solde, validation, écriture et
confirmation.

Un montant attendu nul ou un solde nul est une erreur métier
`COLIS_DEJA_SOLDE`, jamais une indisponibilité technique. Aucune ligne n'est
écrite. Le statut du colis, y compris `LIVRÉ`, n'intervient pas dans cette
décision.

## Frontières

**PAIEMENT ≠ LIVRAISON.** Le manifeste est lu uniquement comme contexte. Ce
moteur ne modifie aucun statut de colis, ne produit ni `LIVRÉ`, ni
`DELIVERY_CONFIRMED`, ni `SORTIE_DESTINATION`, et ne crée aucun `StockEvent`.
Il n'importe aucune logique Stockages. Il n'existe aucun raccordement au module
Transferts ni à la Caisse.

La liste fermée de clés d'erreur et les réponses publiques n'exposent ni stack,
ni clé API, ni configuration interne. La comparaison de la clé API est effectuée
sur toute la longueur et la clé n'est jamais journalisée.
