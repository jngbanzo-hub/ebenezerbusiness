# Architecture cible

## Comparaison

| Critère | A — Sheets + Apps Script | B — Supabase canonique | C — Supabase + Sheets projection |
|---|---|---|---|
| Sécurité | identité Apps Script ambiguë, droits du classeur larges | Auth, RLS et commandes serveur | identique à B si Sheets reste non autoritaire |
| Multi-agents | verrou global ou orchestration fragile | transactions et verrous ciblés | transactions Supabase ; export asynchrone |
| Concurrence | pas de transaction multi-feuilles | verrou de ligne agence + unicité colis | identique à B |
| Idempotence | index reconstruits dans les feuilles | contraintes uniques et empreinte de commande | identique à B |
| Stock négatif | détecté après recalcul | refus atomique avant insertion | identique à B |
| Exploitation | interface familière mais fragile | modèle cohérent et observable | lecture Sheets familière conservée |
| Maintenance | code volumineux et couplé aux colonnes | migrations versionnées et fonctions testables | projection supplémentaire à surveiller |
| Rollback | copie de classeur simple, reprise concurrente difficile | migration/flags et sauvegarde SQL | rollback Supabase + suspension de l'export |
| Dépendance Apps Script | forte | aucune pour le moteur | limitée à l'export facultatif |
| Coût initial | faible | moyen | moyen à élevé |
| Divergence | élevée | faible | maîtrisée si Sheets est explicitement non autoritaire |

## Recommandation

**Option C**, comprise comme l'option B pour le moteur canonique avec une
projection Google Sheets facultative et reconstructible.

Supabase est l'unique source de vérité. La projection Sheets n'est jamais lue
pour décider un arrivage, une livraison, un solde ou une correction. Cette
solution combine les transactions nécessaires au multi-agents avec les rapports
opérationnels déjà familiers, sans maintenir deux moteurs.

## Responsabilités

### Serveur du site

- authentifier avec Supabase Auth ;
- charger le profil actif et dériver son rôle et son agence ;
- calculer `requestId`, `eventId`, empreinte et versions ;
- résoudre le colis et son poids canonique ;
- appeler une RPC transactionnelle avec `service_role` côté serveur seulement ;
- transformer les erreurs en codes métier stables ;
- ne jamais journaliser token, secret ou poids inventé.

Routes futures :

- `POST /api/agent/stockages/arrivals` ;
- `POST /api/agent/stockages/deliveries/[trackingCode]` ;
- `GET /api/agent/stockages` et historique de sa propre agence ;
- `POST /api/admin/stockages/opening` ;
- `POST /api/admin/stockages/adjustments` ;
- `POST /api/admin/stockages/corrections` ;
- `GET /api/admin/stockages`, anomalies et Audit.

### Supabase

- journal immutable, comptes, registre de colis et Audit ;
- RLS de lecture ; aucune écriture client ;
- RPC `SECURITY DEFINER` réservées au rôle serveur ;
- contraintes d'unicité, verrous de lignes et versions optimistes ;
- projections par agence et par Agent.

### Google Sheets

- `MANIFESTE PUBLIC` : lecture consultative/statistique seulement ;
- `STOCKAGES PUBLIC` : archive V1 puis projection/export V2 facultatif ;
- aucune écriture depuis le navigateur ;
- aucune décision métier fondée sur une formule ou un statut de feuille.

### Apps Script

- le moteur V1 reste gelé pour rollback ;
- aucune synchronisation de statut après bascule ;
- éventuellement un export Supabase vers une copie de rapport, jamais vers le
  journal canonique et jamais dans le chemin critique d'une commande.

## Tableaux de bord

Agent : sa propre agence, compte/poids, arrivages et livraisons récents, détail
des Agents de la même agence selon la politique validée, état SUSPENDED et deux
commandes physiques. Agent COO : aucun Stockage.

Admin : FIH/LSHI/KLZ, ouverture indépendante, projections, détail par Agent,
anomalies, ajustements, corrections compensatoires, historique et Audit. Le
rapprochement avec les statistiques d'expédition est consultatif uniquement.
