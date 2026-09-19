# Classification des routes — fiabilité des services Web

Règle commune : les lectures peuvent être rejouées une seule fois après 401 récupérable, erreur réseau, 502, 503 ou 504. Les écritures ne sont jamais rejouées automatiquement par le nouveau helper.

| Route / famille | Module | Type | Idempotence | Refresh | Retry | Maximum | Message final |
|---|---|---|---|---|---|---:|---|
| `paiements-agents-rechercher-colis` | Encaissements COO | Lecture (POST sans écriture) | Sans objet | Oui | Oui | 1 | Erreur métier exacte ou problème temporaire |
| `/api/agent/encaissements/parcel` | Encaissements destination | Lecture | Sans objet | Oui | Oui | 1 | Erreur Stockage/métier exacte |
| `/api/agent/inter-agency-routing/quote` | Acheminements | Lecture | Sans objet | Oui | Oui | 1 | Erreur métier exacte |
| `/api/agent/stockages/payment-action` | Encaissements/Stockages | Lecture | Sans objet | Oui | Oui | 1 | Situation exacte |
| `/api/*/transferts` GET, détails, audit, code Admin | Transferts | Lecture | Sans objet | Oui | Oui | 1 | Interdit, session expirée ou panne temporaire |
| `/api/agent/stockages/*` GET | Stockages | Lecture | Sans objet | Oui | Oui | 1 | Erreur Stockage exacte |
| `/api/admin/stockages/*` GET | Stockages Admin | Lecture | Sans objet | Oui | Oui | 1 | Interdit, session expirée ou panne temporaire |
| `/api/agent/manifest`, `/api/agent/reception-statistics` | Manifeste/statistiques | Lecture | Sans objet | Oui | Oui | 1 | Erreur de filtre/métier exacte |
| `/api/*/statistics/*`, `/api/agent/coo-report` | Rapports/statistiques | Lecture | Sans objet | Oui | Oui | 1 | Erreur de filtre/métier exacte |
| `/api/notifications` GET, `/api/agent/profile`, `/api/*/cash` GET | Notifications/profil/caisse | Lecture | Sans objet | Oui | Oui | 1 | Vide normal, interdit, session expirée ou panne temporaire |
| Paiements COO/destination/acheminements | Encaissements | Écriture | `paymentRequestId` certifié | Vérification avant envoi uniquement | Non ajouté | 0 | Erreur métier exacte |
| Dépenses | Dépenses | Écriture | `expenseRequestId` existant | Vérification avant envoi uniquement | Non ajouté | 0 | Erreur métier exacte |
| Arrivages/sorties/remises | Stockages | Écriture | `requestId` existant | JWT vérifié avant envoi | Non ajouté | 0 | Erreur métier exacte |
| Création/actions/correction Transfert | Transferts | Écriture | Selon commande existante | Vérification existante | Non ajouté | 0 | Erreur métier exacte |
| Contrôles/ouverture Caisse | Caisse | Écriture | `requestId` existant | Vérification existante | Non ajouté | 0 | Erreur métier exacte |
| Notes/corrections Admin | Rapports/Admin | Écriture | Selon commande existante | Vérification existante | Non ajouté | 0 | Erreur métier exacte |

Le helper `authenticatedRead` impose la méthode de l’appel de lecture, reconstruit le Bearer après refresh, et plafonne à une seule nouvelle tentative. Il n’est pas utilisé par les écritures métier.
