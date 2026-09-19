# Sécurité

## Frontières de confiance

Le navigateur transmet uniquement les champs métier autorisés et une
confirmation finale. Il ne fournit jamais de preuve d'autorisation pour :
agence, rôle, identité acteur, eventId, version, poids canonique ou état du
compte.

Le serveur :

1. vérifie le JWT Supabase ;
2. charge `public.agents` par `auth.uid()` ;
3. exige `actif = true` et un rôle exact ;
4. normalise COTONOU vers COO seulement pour reconnaître puis refuser COO dans
   le domaine Stockages ;
5. dérive l'agence de l'Agent ;
6. appelle la RPC avec une clé `service_role` confinée au serveur.

## Autorisations

- Agent actif FIH/LSHI/KLZ : lecture et commandes physiques de sa propre agence ;
- Agent COO : aucune caisse ni commande Stockages ;
- Admin actif : lecture des trois agences, ouverture, ajustement et correction ;
- aucune écriture directe `anon` ou `authenticated` ;
- RLS sur toutes les tables, vues `security_invoker` ou RPC de lecture filtrées ;
- privilèges minimaux et aucun secret dans le bundle client.

Les routes Admin ne font jamais confiance à `role=ADMIN` reçu. Le rôle est relu
dans Supabase. Les métadonnées sont JSON-safe et refusent secrets, tokens, mots
de passe et clés.

## Immutabilité et Audit

Les événements et audits n'acceptent ni UPDATE ni DELETE. Les fonctions serveur
ne peuvent insérer que les types autorisés et doivent ajouter l'Audit Admin dans
la même transaction. Les erreurs publiques contiennent un code stable, sans
stack trace, secret, token ou configuration locale.

## Paiement et MANIFESTE

Le paiement peut être affiché comme information avant remise, mais ne crée
jamais `CONFIRMED_DELIVERY_RECORDED`. MANIFESTE PUBLIC et ses statuts restent en
lecture seule et ne déclenchent aucun événement Stockages.
