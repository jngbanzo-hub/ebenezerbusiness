# Dix scénarios contractuels

1. Un colis inconnu est constaté physiquement à COO : `UNKNOWN → AT_AGENCY`.
2. Un colis quitte COO vers FIH : `AT_AGENCY → IN_TRANSIT`.
3. FIH confirme l'arrivée physique : `IN_TRANSIT → AT_AGENCY`.
4. FIH remet un colis non payé : la position devient `DELIVERED`, le statut
   financier reste `NON_PAYE`.
5. LSHI tente de livrer un colis physiquement à FIH : refus.
6. Un réacheminement FIH vers KLZ est proposé avec un tarif USD versionné.
7. Après approbation, FIH confirme le départ : destination initiale conservée,
   destination courante KLZ et position `IN_TRANSIT`.
8. KLZ confirme l'entrée physique : position `AT_AGENCY` à KLZ.
9. Une annulation après départ crée une compensation documentée ; aucun
   événement historique n'est supprimé.
10. La même requête et la même empreinte rejouent le résultat ; le même
    identifiant avec un contenu différent produit un conflit.
11. Un transit prévu vers FIH arrive physiquement à LSHI :
    `ARRIVAL_MISMATCH_CONFIRMED` conserve FIH comme destination courante,
    positionne le colis à LSHI, puis un réacheminement explicite permet son
    départ vers FIH.
