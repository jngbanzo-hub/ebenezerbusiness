# Plan de validation future

Ce plan n'autorise aucune exécution distante pendant la préparation locale.

## Avant test réel

- identifier le déploiement, le classeur et les propriétaires autorisés ;
- confirmer `Payment Request ID` en `P1` sur les quatre feuilles ;
- confirmer qu'aucune donnée n'est présente en P sans provenance connue ;
- vérifier la Script Property sans afficher sa valeur ;
- préparer un colis de test explicitement autorisé et un UUID v4 neuf ;
- conserver un plan de rollback vers la version antérieure.

## Lectures

- vérifier `ping` sans information interne ;
- rechercher un colis dans chaque destination ;
- vérifier un colis inexistant et une destination invalide ;
- confirmer que la projection exclut les données personnelles et la ligne
  complète du manifeste.

## Écritures, sous autorisation séparée

- simuler COO avec paiement partiel ;
- refuser le paiement partiel dans chaque destination ;
- enregistrer une fois un paiement exact autorisé ;
- répéter le même `paymentRequestId` et confirmer l'absence de seconde ligne ;
- vérifier le verrou, les 16 colonnes et le solde ;
- confirmer que le statut du colis et MANIFESTE PUBLIC n'ont pas changé ;
- confirmer qu'aucun événement Stockages, Transferts ou Caisse n'a été créé.
- confirmer qu'un montant attendu nul ou un solde nul renvoie
  `COLIS_DEJA_SOLDE` sans écriture ;
- vérifier `ESPECES`, `ESPÈCES`, `MOBILE MONEY`, `MOBILE_MONEY`, `VIREMENT` et
  `AUTRE`.

## Réponses et rollback

- vérifier les enveloppes V2 et les champs dépréciés ;
- exécuter les parseurs Edge actuels sur les réponses de compatibilité ;
- vérifier l'absence de stack, clé API et configuration ;
- valider les clients Web et mobiles recensés ;
- en cas d'écart, arrêter les écritures et restaurer le déploiement précédent.
