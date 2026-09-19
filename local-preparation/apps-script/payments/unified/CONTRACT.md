# Contrat Paiements Agents V2

## Transport

Les requêtes utilisent `POST` avec un corps JSON. La Script Property temporaire
`PAIEMENTS_AGENTS_API_KEY` est transmise dans `apiKey`. Aucun secret n'apparaît
dans une réponse ou un journal. Apps Script pouvant répondre techniquement HTTP
200 même pour une erreur métier, `ok` est l'indicateur contractuel.

## Enveloppes

Succès :

```json
{"ok":true,"data":{},"requestId":"uuid"}
```

Erreur :

```json
{"ok":false,"error":{"code":"CODE_STABLE","message":"Message public","requestId":"uuid"}}
```

`requestId` est généré par le service pour tracer la requête/réponse.
`paymentRequestId` est fourni par le client pour l'idempotence métier. Il est
obligatoire pour `enregistrerPaiement`, doit être un UUID v4 et est renvoyé
après succès. Les deux identifiants ne sont pas interchangeables.

## Actions

### `ping`

Requête : `action`, `apiKey`.

`data` contient uniquement `service: "paiements-agents"`,
`status: "available"` et `contractVersion: "2"`.

### `rechercherColis`

Requête : `action`, `apiKey`, `destinationCode`, `codeColis`.

La destination est `FIH`, `LSHI` ou `KLZ`. La projection contient seulement le
code, la destination, la date, le poids, le montant attendu, le montant payé, le
solde et le statut du colis en lecture seule.

### `enregistrerPaiement`

Requête : `action`, `apiKey`, `destinationCode`, `codeColis`,
`agenceEncaissement`, `agent`, `modePaiement`, `montantPaye`,
`paymentRequestId`, et facultativement `referencePaiement`, `observation`,
`simulation`.

## Compatibilité dépréciée

Les succès ajoutent temporairement `success` et `succes`. Une recherche ajoute
`found` et `colis`; un paiement ajoute `simulation`, `paiement` et
`paymentRequestId`. Le paiement historique expose `nouveauSolde` et
`soldeRestant` avec la même valeur. La valeur interne V2
`PARTIELLEMENT_PAYE` devient temporairement `PARTIELLEMENT PAYE` dans cet alias,
conformément au parseur Edge actuel. `SOLDE` reste `SOLDE`.

Les erreurs ajoutent temporairement `success: false`, `succes: false`, `code`,
`message` et `erreur`. `COLIS_INTROUVABLE` ajoute `found: false`. Tous ces
champs sont dérivés de l'enveloppe principale, ne représentent pas un second
contrat et seront retirés après migration des clients.

Deux codes V2 nécessitent un nom historique différent dans l'alias de premier
niveau : `MONTANT_SUPERIEUR_AU_SOLDE` devient
`MONTANT_SUPERIEUR_SOLDE`, et `PAIEMENT_PARTIEL_NON_AUTORISE` devient
`PAIEMENT_PARTIEL_INTERDIT`. L'objet `error` conserve toujours le code V2 ;
la table d'adaptation est unique, explicite et limitée au parseur Edge actuel.

## Erreurs stables

- `REQUETE_INVALIDE`
- `JSON_INVALIDE`
- `ACCES_REFUSE`
- `ACTION_NON_AUTORISEE`
- `DESTINATION_INVALIDE`
- `CODE_COLIS_INVALIDE`
- `COLIS_INTROUVABLE`
- `COLIS_DEJA_SOLDE`
- `AGENCE_INVALIDE`
- `AGENT_INVALIDE`
- `MODE_PAIEMENT_INVALIDE`
- `MONTANT_INVALIDE`
- `MONTANT_SUPERIEUR_AU_SOLDE`
- `PAIEMENT_PARTIEL_NON_AUTORISE`
- `PAYMENT_REQUEST_ID_INVALIDE`
- `PAIEMENT_DEJA_ENREGISTRE`
- `STRUCTURE_FEUILLE_INVALIDE`
- `VERROU_INDISPONIBLE`
- `SERVICE_INDISPONIBLE`
- `ERREUR_INTERNE`

Les messages sont publics, bornés et ne contiennent ni stack, ni valeur
sensible, ni détail de configuration.
