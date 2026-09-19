# Modèle de données cible

## `stockage_accounts`

- `agency` : clé primaire, `FIH | LSHI | KLZ` ;
- `status` : `SUSPENDED | ACTIVE` ;
- `current_parcel_count` : entier >= 0 ;
- `current_weight_kg` : numérique >= 0 ;
- `version` : entier positif ;
- `opened_at`, `opened_business_date`, `opened_by_admin_id` ;
- `created_at`, `updated_at`.

Une contrainte interdit COO/COTONOU. Il existe exactement au plus une ligne par
agence. L'ouverture crée `OPENING_STOCK_RECORDED` et active le compte dans la
même transaction. FIH, LSHI et KLZ s'ouvrent indépendamment.

## `stockage_events`

- `event_id` UUID/identifiant déterministe unique ;
- `request_id` unique ;
- `command_hash` SHA-256 du contenu canonique ;
- `event_type` ;
- `agency` ;
- `parcel_count` entier positif pour ouverture/arrivage, variation signée dans
  la projection ;
- `weight_kg` positif ;
- `tracking_code` nullable selon l'événement ;
- `arrival_reference` nullable ;
- `actor_user_id`, `actor_name_snapshot`, `actor_agency_snapshot` ;
- `business_date`, `occurred_at`, `created_at` ;
- `version_before`, `version_after` ;
- `source_event_id`, `reason`, `metadata JSONB`.

Types : `OPENING_STOCK_RECORDED`, `MANUAL_ARRIVAL_RECORDED`,
`CONFIRMED_DELIVERY_RECORDED`, `ADMIN_STOCK_ADJUSTMENT_RECORDED`,
`STOCK_CORRECTION_RECORDED`.

Les lignes sont immutables. Aucun UPDATE/DELETE client ou serveur ordinaire.
Une correction référence l'événement d'origine et compense sa variation.

## `stockage_parcels`

Registre d'unicité nécessaire à la livraison physique :

- `tracking_code` + `agency` uniques ;
- `canonical_weight_kg`, `weight_source`, `weight_source_reference` ;
- `state` : `AVAILABLE | DELIVERED | ANOMALY` ;
- `arrival_event_id` nullable pour un arrivage détaillé ;
- `delivery_event_id` unique et nullable ;
- `version`, `updated_at`.

Un arrivage peut rester un lot agrégé (`parcel_count`, `weight_kg`), mais tout
colis livré est inscrit/verrouillé individuellement. L'absence de preuve
d'arrivage détaillée est signalée à l'Admin ; elle n'autorise jamais à inventer
un poids.

## `stockage_admin_audit`

- `audit_id`, `request_id`, `action`, `agency` ;
- `old_value JSONB`, `new_value JSONB` ;
- `reason`, `admin_user_id`, `admin_name_snapshot`, `created_at` ;
- `event_id` ou référence de commande.

Audit immutable et obligatoire pour ouverture, ajustement et correction.

## Projections

- solde actuel par agence ;
- événements récents ;
- détail par Agent ;
- total consolidé par agence ;
- anomalies de poids, concurrence, rapprochement et stock insuffisant ;
- projection exportable vers Sheets.

Les projections sont reconstruites exclusivement depuis le journal canonique.

## Source canonique du poids

1. donnée structurée canonique du colis déjà utilisée par le moteur
   Encaissements, si elle expose une valeur validée et une référence stable ;
2. sinon MANIFESTE PUBLIC en lecture seule, avec code normalisé et destination
   concordante ;
3. aucune autre valeur ou saisie libre pour une livraison.

Si deux sources fiables divergent, si la destination diffère ou si le poids est
absent/non positif : `PARCEL_WEIGHT_CONFLICT` ou `PARCEL_WEIGHT_UNAVAILABLE`,
aucune livraison et création d'une anomalie consultable. Aucune conversion ni
valeur par défaut.
