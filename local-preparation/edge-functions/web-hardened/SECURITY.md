# Sécurité

## Identité et autorisation

`Authorization: Bearer <JWT>` est obligatoire. `getUser(token)` valide le jeton
auprès de Supabase Auth. Le profil `public.agents` est ensuite chargé avec l'ID
authentifié. Seuls `actif=true`, `role=AGENT` et une agence reconnue sont
acceptés. `ADMIN` n'est pas autorisé implicitement : un futur parcours Admin
devra être séparé.

La recherche autorise tout Agent actif de COO/COTONOU, FIH, LSHI ou KLZ à
consulter FIH, LSHI et KLZ. Cette permission de lecture ne s'étend pas au
paiement ou à la livraison. Le paiement conserve ses propres contrôles
agence/destination. Les propriétés navigateur pouvant usurper le rôle, l'agence
ou l'agent sont rejetées comme clés inattendues.

La future livraison devra contrôler l'agence actuelle du colis séparément. Un
paiement, même total, ne doit jamais produire implicitement une livraison.

## Erreurs

Les erreurs publiques utilisent les codes historiques reconnus par le site :
`SESSION_EXPIREE`, `COMPTE_DESACTIVE`, `ACCES_REFUSE`,
`COLIS_INTROUVABLE`, `DESTINATION_INVALIDE`, `AGENCE_INVALIDE`,
`MONTANT_INVALIDE`, `MODE_PAIEMENT_INVALIDE`,
`PAYMENT_REQUEST_ID_INVALIDE`, `PAIEMENT_DEJA_ENREGISTRE`,
`COLIS_DEJA_SOLDE`, `MONTANT_SUPERIEUR_SOLDE`,
`PAIEMENT_PARTIEL_INTERDIT`, `PAIEMENT_REFUSE` et
`SERVICE_INDISPONIBLE`.

Les exceptions, erreurs Supabase, réponses Apps Script inconnues et détails
internes deviennent des erreurs contrôlées. Un JWT absent, invalide ou expiré
retourne HTTP 401 avec `SESSION_EXPIREE`.

## CORS

Le déploiement certifié utilise actuellement
`Access-Control-Allow-Origin: *`. Le JWT reste obligatoire, mais une liste
blanche sera préférable après inventaire complet :

- domaine Web de production ;
- domaines Preview Vercel nécessaires ;
- origines locales de développement et de tests autorisées.

Une évolution future pourra lire une configuration explicite telle que
`WEB_ALLOWED_ORIGINS`, comparer strictement l'en-tête `Origin`, répondre avec
l'origine validée et ajouter `Vary: Origin`. Aucun durcissement dynamique n'est
activé ici afin de ne pas casser les Preview non inventoriées.

## Secrets et journaux

Les clés restent dans les secrets Edge. Aucune valeur n'est loguée ou renvoyée.
Les tests utilisent uniquement des valeurs factices. Aucun corps de paiement,
JWT, clé API ou réponse brute ne doit être ajouté aux journaux.
