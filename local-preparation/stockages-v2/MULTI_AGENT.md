# Multi-agents, concurrence et idempotence

## Granularité des verrous

- ouverture/arrivage/ajustement : verrou transactionnel `FOR UPDATE` sur la
  ligne `stockage_accounts` de l'agence concernée ;
- livraison : verrou sur le registre du colis puis sur le compte de son agence,
  toujours dans cet ordre ;
- aucune transaction FIH ne verrouille LSHI ou KLZ ;
- aucune utilisation d'un verrou global Apps Script.

Le verrou agence protège le solde agrégé. Le verrou colis et l'unicité de
`delivery_event_id` garantissent une seule livraison gagnante. Deux colis
différents d'une même agence peuvent être préparés en parallèle ; leur courte
section de mise à jour du compte est sérialisée sans bloquer les autres agences.

## Versions

Chaque commande fournit au RPC une version attendue lue par le serveur. Sous
verrou, la RPC relit la version, valide la transition, insère l'événement puis
incrémente la projection. Un conflit de version provoque une reprise bornée côté
serveur, jamais une écriture partielle.

## Idempotence

- `requestId` cryptographiquement sûr, généré automatiquement et invisible ;
- contenu normalisé puis `commandHash` SHA-256 ;
- contrainte unique sur `request_id` ;
- même `requestId` + même empreinte : résultat antérieur, `replayed=true` ;
- même `requestId` + empreinte différente : HTTP 409
  `IDEMPOTENCY_CONFLICT` ;
- `eventId` dérivé de l'espace de commande et du `requestId` ;
- contrainte unique de livraison par agence/code colis.

## Stock insuffisant

Une livraison verrouille le colis et le compte, vérifie : état AVAILABLE,
compte ACTIVE, au moins un colis, poids disponible >= poids canonique et version
attendue. Événement, mise à jour du colis et projection du compte appartiennent
à la même transaction.

En cas d'insuffisance : rollback complet, `INSUFFICIENT_STOCK`, aucune sortie
partielle, paiement inchangé et anomalie Admin. Une régularisation est un
événement compensatoire motivé ; aucun historique n'est réécrit.

## Scénarios simultanés

- arrivages distincts : deux événements, même compte consolidé ;
- livraisons distinctes : deux événements, identité de chaque Agent conservée ;
- même livraison : une réussite, l'autre reçoit le rejeu ou
  `PARCEL_ALREADY_DELIVERED` ;
- deux Agents/même `requestId` et contenu différent : conflit ;
- FIH, LSHI et KLZ : aucune contention mutuelle ;
- le détail par Agent est une projection, jamais un compte individuel.
