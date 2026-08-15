# Contrat préparatoire d'association QR en série

Ce document prépare seulement le contrat futur. Aucun endpoint batch n'est
activé en Phase 5A et aucune association en série ne doit être exécutée.

Chaque ligne est une commande indépendante et porte obligatoirement ses trois
coordonnées explicites :

```json
{
  "items": [
    {
      "displayNumber": 1,
      "agency": "LSHI",
      "trackingCode": "CODE1",
      "expectedVersion": 1,
      "requestId": "UUID-PROPRE-A-LA-LIGNE"
    },
    {
      "displayNumber": 2,
      "agency": "KLZ",
      "trackingCode": "CODE2B",
      "expectedVersion": 1,
      "requestId": "UUID-PROPRE-A-LA-LIGNE"
    }
  ]
}
```

Le serveur devra résoudre chaque `displayNumber` vers son vrai `qrId`. Il est
interdit au navigateur de fabriquer cette correspondance. Il n'existe aucune
règle « ligne suivante = QR suivant » : l'ordre ou l'échec d'une ligne ne peut
ni créer ni décaler l'identité d'une autre ligne.

Le futur protocole devra être séparé en deux temps :

1. prévalidation sans mutation de toutes les lignes, avec résultat individuel
   (`VALID`, `INVALID`, `QR_ALREADY_ASSIGNED`, `PARCEL_NOT_FOUND`, `DUPLICATE`) ;
2. après confirmation humaine, association atomique par ligne et résultat
   individuel par ligne.

Une erreur sur une ligne interdit sa mutation, sans modifier sa correspondance
ni celle des autres lignes. Le certificateur officiel, les droits agence,
l'idempotence et l'audit restent identiques au contrat unitaire.
