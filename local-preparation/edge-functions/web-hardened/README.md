# Edge Functions Paiements — version Web durcie

Ces fichiers préparatoires dérivent directement des sources Supabase déployées
et certifiées dans `../deployed-snapshot/`. Ils ne sont importés par aucun
fichier de production et ne sont pas déployés par cette phase.

## Garanties ajoutées

- JWT validé auprès de Supabase Auth ;
- profil relu côté serveur par l'identité du JWT ;
- compte actif et rôle exact `AGENT` obligatoires ;
- agence issue exclusivement du profil serveur ;
- permission de recherche globale vérifiée avant Apps Script ;
- corps de requête limité à une liste stricte de clés ;
- `paymentRequestId` UUID v4 obligatoire, normalisé en minuscules et transmis
  sans remplacement ;
- réponses Apps Script projetées vers des contrats publics contrôlés ;
- aucune stack, clé ou réponse amont brute exposée.

## Autorisations séparées

### Recherche

| Agence Agent active du profil | Destinations consultables |
|---|---|
| `COTONOU` / site `COO` | `FIH`, `LSHI`, `KLZ` |
| `FIH` | `FIH`, `LSHI`, `KLZ` |
| `LSHI` | `FIH`, `LSHI`, `KLZ` |
| `KLZ` | `FIH`, `LSHI`, `KLZ` |

Le navigateur ne peut imposer ni rôle, ni agence, ni identité ou nom d'agent.
Une clé inattendue entraîne un refus avant l'appel Apps Script.

La recherche globale est une permission de consultation. Elle ne permet ni
livraison, ni changement de statut, d'agence actuelle, de destination, de prix
historique ou de frais, et ne crée aucun mouvement de stock.

### Encaissement

La fonction de paiement conserve sa règle actuelle, distincte de la recherche.
Elle reconstruit l'agence réelle d'encaissement et l'identité de l'agent depuis
le profil serveur, conserve la destination de la fiche et transmet le
`paymentRequestId`. La permission de recherche globale ne modifie pas ces
contrôles de paiement.

### Livraison future

Aucune fonction de livraison n'est fournie ici. Une future action « Livré »
devra exiger :

```text
agenceActuelleDuColis = agenceDeLAgentConnecté
```

Un paiement total ne constitue jamais une preuve de livraison : PAYÉ ≠ LIVRÉ.

## Frontières

Le paiement ne change aucun statut logistique, ne crée aucun mouvement de
stock, n'appelle pas Transferts et n'alimente pas la Caisse. Les fonctions ne
contactent Google Sheets qu'indirectement via le contrat Apps Script existant.

La version durcie d'enregistrement est compatible avec le site Web actuel, qui
émet déjà un `paymentRequestId`. Elle ne doit pas être déployée pour les clients
mobiles tant que leur compatibilité avec ce champ obligatoire n'est pas établie
dans une phase mobile distincte.
