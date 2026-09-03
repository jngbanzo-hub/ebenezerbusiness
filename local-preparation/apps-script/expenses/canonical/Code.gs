/**
 * CLASSEUR : DEPENSES PUBLIC
 *
 * Feuilles opérationnelles :
 * - COO
 * - FIH
 * - LSHI
 * - KLZ
 *
 * Feuilles techniques :
 * - PARAMETRES
 * - STAT DEPENSES
 *
 * Le script :
 * - ne supprime aucune dépense existante ;
 * - crée les feuilles manquantes ;
 * - installe les catégories et listes déroulantes ;
 * - calcule les dépenses journalières et mensuelles ;
 * - calcule les totaux de chaque site ;
 * - calcule les totaux des quatre sites ;
 * - sépare FCFA, USD et CDF ;
 * - exclut les dépenses ayant le statut ANNULÉE.
 */

const CONFIG_DEPENSES = {
  fuseauHoraire: 'Africa/Porto-Novo',
  locale: 'fr_BJ',
  nombreLignesPreparees: 1000,

  feuillesAgences: ['COO', 'FIH', 'LSHI', 'KLZ'],

  feuilleParametres: 'PARAMETRES',
  feuilleStatistiques: 'STAT DEPENSES',
  feuilleCorrections: 'CORRECTIONS DEPENSES',
  feuilleAudit: 'AUDIT DEPENSES',
  proprieteCleApi: 'DEPENSES_PUBLIC_API_KEY',
  deviseParDefaut: 'USD',

  categories: [
    'Aéroport',
    'Expédition FIH',
    'Expédition LSHI',
    'Expédition KLZ',
    'Expédition LKS',
    'Déclarant',
    'Manutention',
    'Barrière',
    'Entrepôt',
    'Transport',
    'Crédit',
    'Connexion',
    'Pasteur Sera',
    'Ma Vanela',
    'Pasteur Jacques',
    'TF Bénin',
    'TF LSHI',
    'TF FIH',
    "Frais d’envoi",
    'Frais de retrait',
    'Commission clients',
    'Scotch',
    'Sacs',
    'Loyer',
    'Eau',
    'Électricité',
    'Filmage',
    'Poubelle',
    'Chauffeur',
    'Salaire',
    'Prime',
    'Dette',
    'Impression',
    'Autres'
  ],

  modesPaiement: [
    'ESPÈCES',
    'MOBILE MONEY',
    'VIREMENT',
    'CARTE',
    'CRÉDIT',
    'AUTRE'
  ],

  statuts: [
    'ACTIVE',
    'CORRECTION_DEMANDEE',
    'CORRIGEE',
    'ANNULEE'
  ],

  devises: [
    'USD',
    'FCFA',
    'CDF'
  ],

  entetes: [
    'Date et heure',
    'Expense Request ID',
    'Agence',
    'Catégorie',
    'Description',
    'Montant',
    'Devise',
    'Mode de paiement',
    'Référence',
    'Agent',
    'Observation',
    'Statut courant',
    'Montant initial',
    'Catégorie initiale',
    'Description initiale',
    'Motif de la dernière correction',
    'Dernière correction demandée par',
    'Date de la dernière demande',
    'Dernière décision prise par',
    'Date de la dernière décision',
    'Dernier Correction Request ID'
  ]
};

const ENTETES_CORRECTIONS_DEPENSES = [
  'Correction Request ID',
  'Expense Request ID',
  'Agence',
  'Feuille source',
  'Statut de la demande',
  'Motif de correction',
  'Demandée par ID',
  'Demandée par',
  'Date de demande',
  'Catégorie avant',
  'Description avant',
  'Montant avant',
  'Devise avant',
  'Mode de paiement avant',
  'Référence avant',
  'Observation avant',
  'Catégorie demandée',
  'Description demandée',
  'Montant demandé',
  'Devise demandée',
  'Mode de paiement demandé',
  'Référence demandée',
  'Observation demandée',
  'Décision',
  'Motif de décision',
  'Décision prise par ID',
  'Décision prise par',
  'Date de décision',
  'Catégorie appliquée',
  'Description appliquée',
  'Montant appliqué',
  'Devise appliquée',
  'Mode de paiement appliqué',
  'Référence appliquée',
  'Observation appliquée'
];

const ENTETES_AUDIT_DEPENSES = [
  'Audit Event ID',
  'Type événement',
  'Date et heure',
  'Expense Request ID',
  'Correction Request ID',
  'Agence',
  'Feuille source',
  'Acteur ID',
  'Acteur',
  'Rôle acteur',
  'Statut avant',
  'Statut après',
  'Catégorie avant',
  'Catégorie après',
  'Description avant',
  'Description après',
  'Montant avant',
  'Montant après',
  'Devise avant',
  'Devise après',
  'Mode de paiement avant',
  'Mode de paiement après',
  'Référence avant',
  'Référence après',
  'Observation avant',
  'Observation après',
  'Motif',
  'Résultat',
  'Référence technique'
];

const UUID_V4_DEPENSES_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Menu visible à l’ouverture du fichier.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Dépenses Public')
    .addItem('Initialiser le classeur', 'initialiserDepensesPublic')
    .addSeparator()
    .addItem(
      'Actualiser les statistiques',
      'recalculerStatistiquesDepenses'
    )
    .addItem(
      'Réinstaller les listes déroulantes',
      'installerValidationsDepenses'
    )
    .addToUi();
}

/**
 * Actualisation automatique après une modification manuelle
 * dans COO, FIH, LSHI ou KLZ.
 */
function onEdit(e) {
  if (!e || !e.range) {
    return;
  }

  const feuille = e.range.getSheet();
  const nomFeuille = feuille.getName();

  if (!CONFIG_DEPENSES.feuillesAgences.includes(nomFeuille)) {
    return;
  }

  if (e.range.getRow() < 2) {
    return;
  }

  if (e.range.getColumn() > 12) {
    return;
  }

  recalculerStatistiquesDepenses();
}

/**
 * Initialisation complète.
 */
function initialiserDepensesPublic() {
  initialiserStructureDepensesPublic();
  initialiserValidationsDepensesPublic();
  initialiserProtectionsDepensesPublic();
  initialiserStatistiquesDepensesPublic();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    [
      'Les feuilles COO, FIH, LSHI et KLZ sont prêtes.',
      'STAT DEPENSES a été reconstruite.'
    ].join(' '),
    'Initialisation terminée',
    8
  );
}

/**
 * Étape 1 idempotente : feuilles, en-têtes et formats bornés.
 */
function initialiserStructureDepensesPublic() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();

  classeur.setSpreadsheetTimeZone(
    CONFIG_DEPENSES.fuseauHoraire
  );

  classeur.setSpreadsheetLocale(
    CONFIG_DEPENSES.locale
  );

  const feuilleParametres =
    creerOuMettreAJourParametres_(classeur);

  CONFIG_DEPENSES.feuillesAgences.forEach(function (nomAgence) {
    preparerFeuilleAgence_(
      classeur,
      feuilleParametres,
      nomAgence
    );
  });

  creerOuPreparerFeuilleTechnique_(
    classeur,
    CONFIG_DEPENSES.feuilleCorrections,
    ENTETES_CORRECTIONS_DEPENSES
  );

  creerOuPreparerFeuilleTechnique_(
    classeur,
    CONFIG_DEPENSES.feuilleAudit,
    ENTETES_AUDIT_DEPENSES
  );

  creerOuPreparerFeuilleStatistiques_(classeur);
}

/**
 * Étape 2 idempotente : listes déroulantes bornées.
 */
function initialiserValidationsDepensesPublic() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const feuilleParametres = exigerFeuilleDepenses_(
    classeur,
    CONFIG_DEPENSES.feuilleParametres
  );

  CONFIG_DEPENSES.feuillesAgences.forEach(
    function (nomAgence) {
      const feuille = exigerFeuilleDepenses_(
        classeur,
        nomAgence
      );

      installerValidationsSurFeuille_(
        feuille,
        feuilleParametres,
        nomAgence
      );
    }
  );
}

/**
 * Étape 3 idempotente : protections, sans toucher aux données.
 */
function initialiserProtectionsDepensesPublic() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();

  CONFIG_DEPENSES.feuillesAgences.forEach(
    function (nomAgence) {
      protegerColonnesTechniques_(
        exigerFeuilleDepenses_(classeur, nomAgence)
      );
    }
  );

  protegerFeuilleTechnique_(
    exigerFeuilleDepenses_(
      classeur,
      CONFIG_DEPENSES.feuilleCorrections
    )
  );
  protegerFeuilleTechnique_(
    exigerFeuilleDepenses_(
      classeur,
      CONFIG_DEPENSES.feuilleAudit
    )
  );
}

/**
 * Étape 4 idempotente : reconstruction des statistiques dérivées.
 */
function initialiserStatistiquesDepensesPublic() {
  recalculerStatistiquesDepenses();
}

/**
 * Création ou mise à jour de PARAMETRES.
 */
function creerOuMettreAJourParametres_(classeur) {
  let feuille = classeur.getSheetByName(
    CONFIG_DEPENSES.feuilleParametres
  );

  if (!feuille) {
    feuille = classeur.insertSheet(
      CONFIG_DEPENSES.feuilleParametres
    );
  }

  const entetesParametres = [
    'CATÉGORIES',
    'MODES DE PAIEMENT',
    'STATUTS',
    'DEVISES'
  ];

  const nombreLignes = Math.max(
    CONFIG_DEPENSES.categories.length,
    CONFIG_DEPENSES.modesPaiement.length,
    CONFIG_DEPENSES.statuts.length,
    CONFIG_DEPENSES.devises.length
  );

  const valeurs = [];

  for (let index = 0; index < nombreLignes; index++) {
    valeurs.push([
      CONFIG_DEPENSES.categories[index] || '',
      CONFIG_DEPENSES.modesPaiement[index] || '',
      CONFIG_DEPENSES.statuts[index] || '',
      CONFIG_DEPENSES.devises[index] || ''
    ]);
  }

  feuille
    .getRange(1, 1, valeurs.length + 1, 4)
    .setValues([entetesParametres].concat(valeurs));

  feuille.setFrozenRows(1);

  feuille
    .getRange(1, 1, 1, 4)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setBackground('#17324d')
    .setFontColor('#ffffff');

  feuille.setColumnWidth(1, 220);
  feuille.setColumnWidth(2, 190);
  feuille.setColumnWidth(3, 150);
  feuille.setColumnWidth(4, 110);

  return feuille;
}

/**
 * Prépare une feuille d’agence sans supprimer les dépenses.
 */
function preparerFeuilleAgence_(
  classeur,
  feuilleParametres,
  nomAgence
) {
  let feuille = classeur.getSheetByName(nomAgence);

  if (!feuille) {
    feuille = classeur.insertSheet(nomAgence);
  }

  const nombreColonnes =
    CONFIG_DEPENSES.entetes.length;
  assurerNombreLignesPreparees_(feuille);
  const derniereLignePreparee =
    feuille.getMaxRows();

  feuille
    .getRange(1, 1, 1, nombreColonnes)
    .setValues([CONFIG_DEPENSES.entetes]);

  feuille.setFrozenRows(1);

  feuille
    .getRange(1, 1, 1, nombreColonnes)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground('#17324d')
    .setFontColor('#ffffff');

  feuille.setRowHeight(1, 38);

  feuille.setColumnWidth(1, 165);
  feuille.setColumnWidth(2, 260);
  feuille.setColumnWidth(3, 100);
  feuille.setColumnWidth(4, 200);
  feuille.setColumnWidth(5, 260);
  feuille.setColumnWidth(6, 120);
  feuille.setColumnWidth(7, 90);
  feuille.setColumnWidth(8, 170);
  feuille.setColumnWidth(9, 180);
  feuille.setColumnWidth(10, 180);
  feuille.setColumnWidth(11, 260);
  feuille.setColumnWidth(12, 130);
  feuille.setColumnWidth(13, 130);
  feuille.setColumnWidth(14, 200);
  feuille.setColumnWidth(15, 260);
  feuille.setColumnWidth(16, 260);
  feuille.setColumnWidth(17, 210);
  feuille.setColumnWidth(18, 165);
  feuille.setColumnWidth(19, 210);
  feuille.setColumnWidth(20, 165);
  feuille.setColumnWidth(21, 260);

  feuille
    .getRange(
      2,
      1,
      derniereLignePreparee - 1,
      1
    )
    .setNumberFormat('dd/mm/yyyy hh:mm:ss');

  feuille
    .getRange(
      2,
      6,
      derniereLignePreparee - 1,
      1
    )
    .setNumberFormat('#,##0.00');

  feuille
    .getRange(
      2,
      2,
      derniereLignePreparee - 1,
      1
    )
    .setNumberFormat('@');

  feuille
    .getRange(
      2,
      9,
      derniereLignePreparee - 1,
      1
    )
    .setNumberFormat('@');

  feuille
    .getRange(
      2,
      12,
      derniereLignePreparee - 1,
      1
    )
    .setHorizontalAlignment('center');

  feuille
    .getRange(
      2,
      13,
      derniereLignePreparee - 1,
      1
    )
    .setNumberFormat('#,##0.00');

  feuille
    .getRange(
      2,
      18,
      derniereLignePreparee - 1,
      1
    )
    .setNumberFormat('dd/mm/yyyy hh:mm:ss');

  feuille
    .getRange(
      2,
      20,
      derniereLignePreparee - 1,
      1
    )
    .setNumberFormat('dd/mm/yyyy hh:mm:ss');

  installerFiltre_(feuille, nombreColonnes);
}

/**
 * Crée une feuille technique append-only sans effacer les lignes existantes.
 */
function creerOuPreparerFeuilleTechnique_(
  classeur,
  nomFeuille,
  entetes
) {
  let feuille = classeur.getSheetByName(nomFeuille);

  if (!feuille) {
    feuille = classeur.insertSheet(nomFeuille);
  }

  feuille
    .getRange(1, 1, 1, entetes.length)
    .setValues([entetes])
    .setFontWeight('bold')
    .setBackground('#17324d')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  feuille.setFrozenRows(1);
  assurerNombreLignesPreparees_(feuille);
  const nombreLignes = feuille.getMaxRows();

  feuille
    .getRange(1, 1, nombreLignes, 1)
    .setNumberFormat('@');
  feuille
    .getRange(1, 2, nombreLignes, 1)
    .setNumberFormat('@');
  feuille
    .getRange(1, 3, nombreLignes, 1)
    .setNumberFormat('@');

  if (
    nomFeuille ===
    CONFIG_DEPENSES.feuilleCorrections
  ) {
    feuille
      .getRange(2, 9, nombreLignes - 1, 1)
      .setNumberFormat('dd/mm/yyyy hh:mm:ss');
    feuille
      .getRange(2, 28, nombreLignes - 1, 1)
      .setNumberFormat('dd/mm/yyyy hh:mm:ss');
  } else {
    feuille
      .getRange(2, 3, nombreLignes - 1, 1)
      .setNumberFormat('dd/mm/yyyy hh:mm:ss');
  }

  return feuille;
}

/**
 * Ajoute uniquement les lignes manquantes. Ne réduit jamais une feuille.
 */
function assurerNombreLignesPreparees_(feuille) {
  const nombreActuel = feuille.getMaxRows();

  if (
    nombreActuel <
    CONFIG_DEPENSES.nombreLignesPreparees
  ) {
    feuille.insertRowsAfter(
      nombreActuel,
      CONFIG_DEPENSES.nombreLignesPreparees -
        nombreActuel
    );
  }
}

/**
 * Création ou préparation de STAT DEPENSES.
 */
function creerOuPreparerFeuilleStatistiques_(classeur) {
  let feuille = classeur.getSheetByName(
    CONFIG_DEPENSES.feuilleStatistiques
  );

  if (!feuille) {
    feuille = classeur.insertSheet(
      CONFIG_DEPENSES.feuilleStatistiques
    );
  }

  feuille.setFrozenRows(3);

  feuille.setColumnWidth(1, 160);
  feuille.setColumnWidth(2, 170);
  feuille.setColumnWidth(3, 120);
  feuille.setColumnWidth(4, 110);
  feuille.setColumnWidth(5, 160);
  feuille.setColumnWidth(6, 160);

  return feuille;
}

/**
 * Recalcule toutes les statistiques depuis les quatre feuilles.
 */
function recalculerStatistiquesDepenses() {
  const verrou = LockService.getScriptLock();

  try {
    verrou.waitLock(30000);

    const classeur =
      SpreadsheetApp.getActiveSpreadsheet();

    const feuilleStatistiques =
      creerOuPreparerFeuilleStatistiques_(classeur);

    const statistiquesJournalieres = new Map();
    const statistiquesMensuelles = new Map();

    const anomalies = {
      datesInvalides: 0,
      montantsInvalides: 0,
      devisesInvalides: 0,
      statutsInconnus: 0
    };

    CONFIG_DEPENSES.feuillesAgences.forEach(
      function (nomAgence) {
        const feuille =
          classeur.getSheetByName(nomAgence);

        if (!feuille) {
          return;
        }

        const derniereLigne = feuille.getLastRow();

        if (derniereLigne < 2) {
          return;
        }

        const lignes = feuille
          .getRange(
            2,
            1,
            derniereLigne - 1,
            CONFIG_DEPENSES.entetes.length
          )
          .getValues();

        lignes.forEach(function (ligne) {
          traiterLigneStatistique_(
            ligne,
            nomAgence,
            statistiquesJournalieres,
            statistiquesMensuelles,
            anomalies
          );
        });
      }
    );

    const lignesJournalieres =
      convertirStatistiquesEnLignes_(
        statistiquesJournalieres,
        'JOURNALIER'
      );

    const lignesMensuelles =
      convertirStatistiquesEnLignes_(
        statistiquesMensuelles,
        'MENSUEL'
      );

    ecrireStatistiques_(
      feuilleStatistiques,
      lignesJournalieres,
      lignesMensuelles,
      anomalies
    );

    SpreadsheetApp.flush();
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Analyse une ligne de dépense.
 *
 * Colonnes :
 * A Date
 * B ID
 * C Agence
 * D Catégorie
 * E Description
 * F Montant
 * G Devise
 * H Mode
 * I Référence
 * J Agent
 * K Observation
 * L Statut courant
 * M Montant initial
 * N Catégorie initiale
 * O Description initiale
 * P Motif dernière correction
 * Q Demandeur dernière correction
 * R Date dernière demande
 * S Décideur
 * T Date décision
 * U Dernier Correction Request ID
 */
function traiterLigneStatistique_(
  ligne,
  nomAgence,
  statistiquesJournalieres,
  statistiquesMensuelles,
  anomalies
) {
  const dateSource = ligne[0];
  const montantSource = ligne[5];
  const deviseSource = ligne[6];
  const statutSource = ligne[11];

  const ligneEntierementVide = ligne.every(function (valeur) {
    return valeur === '' || valeur === null;
  });

  if (ligneEntierementVide) {
    return;
  }

  const statut = normaliserTexte_(statutSource);

  if (statut === 'ANNULÉE' || statut === 'ANNULEE') {
    return;
  }

  if (
    statut !== 'ACTIVE' &&
    statut !== 'CORRECTION_DEMANDEE' &&
    statut !== 'CORRIGEE'
  ) {
    anomalies.statutsInconnus++;
    return;
  }

  const date = analyserDateDepense_(dateSource);

  if (!date) {
    anomalies.datesInvalides++;
    return;
  }

  const montant = analyserMontantDepense_(
    montantSource
  );

  if (montant === null) {
    anomalies.montantsInvalides++;
    return;
  }

  const devise = normaliserTexte_(deviseSource);

  if (!CONFIG_DEPENSES.devises.includes(devise)) {
    anomalies.devisesInvalides++;
    return;
  }

  const cleJour = Utilities.formatDate(
    date,
    CONFIG_DEPENSES.fuseauHoraire,
    'yyyy-MM-dd'
  );

  const cleMois = Utilities.formatDate(
    date,
    CONFIG_DEPENSES.fuseauHoraire,
    'yyyy-MM'
  );

  ajouterStatistique_(
    statistiquesJournalieres,
    cleJour,
    nomAgence,
    devise,
    montant
  );

  ajouterStatistique_(
    statistiquesJournalieres,
    cleJour,
    'TOUS LES SITES',
    devise,
    montant
  );

  ajouterStatistique_(
    statistiquesMensuelles,
    cleMois,
    nomAgence,
    devise,
    montant
  );

  ajouterStatistique_(
    statistiquesMensuelles,
    cleMois,
    'TOUS LES SITES',
    devise,
    montant
  );
}

/**
 * Ajoute un montant dans un groupe statistique.
 */
function ajouterStatistique_(
  statistiques,
  periode,
  site,
  devise,
  montant
) {
  const cle = [periode, site, devise].join('|');

  const valeurActuelle = statistiques.get(cle) || {
    periode: periode,
    site: site,
    devise: devise,
    total: 0,
    nombreOperations: 0
  };

  valeurActuelle.total += montant;
  valeurActuelle.nombreOperations += 1;

  statistiques.set(cle, valeurActuelle);
}

/**
 * Transforme les Map en lignes triées.
 */
function convertirStatistiquesEnLignes_(
  statistiques,
  type
) {
  return Array.from(statistiques.values())
    .sort(function (a, b) {
      if (a.periode !== b.periode) {
        return b.periode.localeCompare(a.periode);
      }

      if (a.site !== b.site) {
        if (a.site === 'TOUS LES SITES') {
          return -1;
        }

        if (b.site === 'TOUS LES SITES') {
          return 1;
        }

        return a.site.localeCompare(b.site);
      }

      return a.devise.localeCompare(b.devise);
    })
    .map(function (element) {
      return [
        type,
        element.periode,
        element.site,
        element.devise,
        element.total,
        element.nombreOperations
      ];
    });
}

/**
 * Écrit les statistiques dans STAT DEPENSES.
 */
function ecrireStatistiques_(
  feuille,
  lignesJournalieres,
  lignesMensuelles,
  anomalies
) {
  const derniereLigneExistante = Math.max(
    feuille.getLastRow(),
    12
  );
  const derniereColonneExistante = Math.max(
    feuille.getLastColumn(),
    6
  );

  feuille
    .getRange(
      1,
      1,
      derniereLigneExistante,
      derniereColonneExistante
    )
    .clearContent()
    .clearFormat();

  feuille
    .getRange('A1:F1')
    .merge()
    .setValue('TABLEAU DE BORD DES DÉPENSES')
    .setFontSize(16)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setBackground('#17324d')
    .setFontColor('#ffffff');

  feuille
    .getRange('A2:F2')
    .merge()
    .setValue(
      'Dernière actualisation : ' +
      Utilities.formatDate(
        new Date(),
        CONFIG_DEPENSES.fuseauHoraire,
        'dd/MM/yyyy HH:mm:ss'
      )
    )
    .setHorizontalAlignment('center')
    .setBackground('#d9eaf7');

  const entetesStatistiques = [
    'Type',
    'Période',
    'Site',
    'Devise',
    'Total dépenses',
    "Nombre d’opérations"
  ];

  let ligneCourante = 4;

  feuille
    .getRange(ligneCourante, 1, 1, 6)
    .setValues([entetesStatistiques])
    .setFontWeight('bold')
    .setBackground('#17324d')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  ligneCourante++;

  const toutesLesLignes = lignesJournalieres.concat(
    lignesMensuelles
  );

  if (toutesLesLignes.length > 0) {
    feuille
      .getRange(
        ligneCourante,
        1,
        toutesLesLignes.length,
        6
      )
      .setValues(toutesLesLignes);

    feuille
      .getRange(
        ligneCourante,
        5,
        toutesLesLignes.length,
        1
      )
      .setNumberFormat('#,##0.00');

    toutesLesLignes.forEach(function (ligne, index) {
      if (ligne[2] === 'TOUS LES SITES') {
        feuille
          .getRange(ligneCourante + index, 1, 1, 6)
          .setFontWeight('bold')
          .setBackground('#e8f4d4');
      }
    });

    ligneCourante += toutesLesLignes.length + 2;
  } else {
    feuille
      .getRange(ligneCourante, 1, 1, 6)
      .merge()
      .setValue('Aucune dépense valide enregistrée.');

    ligneCourante += 3;
  }

  feuille
    .getRange(ligneCourante, 1, 1, 6)
    .merge()
    .setValue('RAPPORT DE CONTRÔLE')
    .setFontWeight('bold')
    .setBackground('#fff2cc');

  ligneCourante++;

  const lignesAnomalies = [
    ['Dates invalides ou absentes', anomalies.datesInvalides],
    ['Montants invalides', anomalies.montantsInvalides],
    ['Devises invalides', anomalies.devisesInvalides],
    ['Statuts inconnus', anomalies.statutsInconnus]
  ];

  feuille
    .getRange(
      ligneCourante,
      1,
      lignesAnomalies.length,
      2
    )
    .setValues(lignesAnomalies);

  feuille.setFrozenRows(4);

  feuille.autoResizeRows(
    1,
    Math.max(feuille.getLastRow(), 1)
  );

  installerFiltreStatistiques_(feuille);
}

/**
 * Validation stricte d’une date.
 */
function analyserDateDepense_(valeur) {
  if (
    Object.prototype.toString.call(valeur) ===
      '[object Date]' &&
    !isNaN(valeur.getTime())
  ) {
    return valeur;
  }

  if (typeof valeur !== 'string') {
    return null;
  }

  const texte = valeur.trim();

  const correspondance = texte.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!correspondance) {
    return null;
  }

  const jour = Number(correspondance[1]);
  const mois = Number(correspondance[2]);
  const annee = Number(correspondance[3]);
  const heure = Number(correspondance[4] || 0);
  const minute = Number(correspondance[5] || 0);
  const seconde = Number(correspondance[6] || 0);

  if (
    annee < 2000 ||
    annee > 2100 ||
    mois < 1 ||
    mois > 12 ||
    heure < 0 ||
    heure > 23 ||
    minute < 0 ||
    minute > 59 ||
    seconde < 0 ||
    seconde > 59
  ) {
    return null;
  }

  const date = new Date(
    annee,
    mois - 1,
    jour,
    heure,
    minute,
    seconde
  );

  if (
    date.getFullYear() !== annee ||
    date.getMonth() !== mois - 1 ||
    date.getDate() !== jour
  ) {
    return null;
  }

  return date;
}

/**
 * Validation stricte d’un montant positif.
 */
function analyserMontantDepense_(valeur) {
  if (
    typeof valeur === 'number' &&
    Number.isFinite(valeur) &&
    valeur > 0
  ) {
    return valeur;
  }

  if (typeof valeur !== 'string') {
    return null;
  }

  const texte = valeur
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.');

  if (!/^\d+(?:\.\d{1,2})?$/.test(texte)) {
    return null;
  }

  const montant = Number(texte);

  if (!Number.isFinite(montant) || montant <= 0) {
    return null;
  }

  return montant;
}

/**
 * Normalisation d’un texte.
 */
function normaliserTexte_(valeur) {
  return String(valeur || '')
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Réinstalle les listes déroulantes.
 */
function installerValidationsDepenses() {
  const classeur =
    SpreadsheetApp.getActiveSpreadsheet();

  const feuilleParametres =
    classeur.getSheetByName(
      CONFIG_DEPENSES.feuilleParametres
    );

  if (!feuilleParametres) {
    throw new Error(
      'La feuille PARAMETRES est absente. Exécutez initialiserDepensesPublic().'
    );
  }

  CONFIG_DEPENSES.feuillesAgences.forEach(
    function (nomAgence) {
      const feuille =
        classeur.getSheetByName(nomAgence);

      if (feuille) {
        installerValidationsSurFeuille_(
          feuille,
          feuilleParametres,
          nomAgence
        );
      }
    }
  );

  SpreadsheetApp.flush();

  classeur.toast(
    'Les listes déroulantes ont été réinstallées.',
    'Validations terminées',
    5
  );
}

/**
 * Installe les validations sur une feuille d’agence.
 */
function installerValidationsSurFeuille_(
  feuille,
  feuilleParametres,
  nomAgence
) {
  assurerNombreLignesPreparees_(feuille);
  const nombreLignes = feuille.getMaxRows() - 1;

  const plageCategories =
    feuilleParametres.getRange(
      2,
      1,
      CONFIG_DEPENSES.categories.length,
      1
    );

  const plageModes =
    feuilleParametres.getRange(
      2,
      2,
      CONFIG_DEPENSES.modesPaiement.length,
      1
    );

  const plageStatuts =
    feuilleParametres.getRange(
      2,
      3,
      CONFIG_DEPENSES.statuts.length,
      1
    );

  const plageDevises =
    feuilleParametres.getRange(
      2,
      4,
      CONFIG_DEPENSES.devises.length,
      1
    );

  const validationCategorie =
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(plageCategories, true)
      .setAllowInvalid(false)
      .setHelpText(
        'Sélectionnez une catégorie.'
      )
      .build();

  const validationMode =
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(plageModes, true)
      .setAllowInvalid(false)
      .setHelpText(
        'Sélectionnez un mode de paiement.'
      )
      .build();

  const validationStatut =
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(plageStatuts, true)
      .setAllowInvalid(false)
      .setHelpText(
        'Sélectionnez le statut.'
      )
      .build();

  const validationDevise =
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(plageDevises, true)
      .setAllowInvalid(false)
      .setHelpText(
        'Sélectionnez la devise.'
      )
      .build();

  feuille
    .getRange(2, 3, nombreLignes, 1)
    .clearDataValidations();

  feuille
    .getRange(2, 4, nombreLignes, 1)
    .setDataValidation(validationCategorie);

  feuille
    .getRange(2, 7, nombreLignes, 1)
    .setDataValidation(validationDevise);

  feuille
    .getRange(2, 8, nombreLignes, 1)
    .setDataValidation(validationMode);

  feuille
    .getRange(2, 12, nombreLignes, 1)
    .setDataValidation(validationStatut);
}

/**
 * Filtre des feuilles COO, FIH, LSHI et KLZ.
 */
function installerFiltre_(feuille, nombreColonnes) {
  const filtreExistant = feuille.getFilter();

  if (filtreExistant) {
    filtreExistant.remove();
  }

  const derniereLigne = Math.max(
    feuille.getLastRow(),
    2
  );

  feuille
    .getRange(
      1,
      1,
      derniereLigne,
      nombreColonnes
    )
    .createFilter();
}

/**
 * Filtre de la feuille STAT DEPENSES.
 */
function installerFiltreStatistiques_(feuille) {
  const filtreExistant = feuille.getFilter();

  if (filtreExistant) {
    filtreExistant.remove();
  }

  const derniereLigne = feuille.getLastRow();

  if (derniereLigne >= 5) {
    feuille
      .getRange(
        4,
        1,
        derniereLigne - 3,
        6
      )
      .createFilter();
  }
}

/**
 * API serveur-à-serveur. Le navigateur ne doit jamais appeler cette
 * Web App directement ni connaître DEPENSES_PUBLIC_API_KEY.
 */
function doGet() {
  return reponseJsonDepenses_({
    success: true,
    service: 'DEPENSES PUBLIC',
    lectureSeule: true,
    deviseParDefaut:
      CONFIG_DEPENSES.deviseParDefaut,
    devisesAutorisees:
      CONFIG_DEPENSES.devises.slice()
  });
}

function doPost(e) {
  try {
    const body = lireCorpsJsonDepenses_(e);
    verifierCleApiDepenses_(body.apiKey);
    validerProprietesObjet_(
      body,
      ['apiKey', 'action', 'acteur', 'donnees'],
      'REQUETE_INVALIDE'
    );

    const action = normaliserTexte_(body.action);
    const acteur = validerActeurServeur_(body.acteur);
    const donnees = body.donnees || {};

    if (action === 'LISTER_DEPENSES_ADMIN') {
      exigerRoleDepenses_(acteur, 'ADMIN');
      return reponseJsonDepenses_(
        listerDepensesAdmin_(donnees)
      );
    }

    if (action === 'ENREGISTRER_DEPENSE') {
      exigerRoleDepenses_(acteur, 'AGENT');
      return reponseJsonDepenses_(
        enregistrerDepenseSecurisee_(acteur, donnees)
      );
    }

    if (action === 'DEMANDER_CORRECTION') {
      exigerRoleDepenses_(acteur, 'AGENT');
      return reponseJsonDepenses_(
        demanderCorrectionDepense_(acteur, donnees)
      );
    }

    if (action === 'DECIDER_CORRECTION') {
      exigerRoleDepenses_(acteur, 'ADMIN');
      return reponseJsonDepenses_(
        deciderCorrectionDepense_(acteur, donnees)
      );
    }

    if (action === 'ANNULER_DEPENSE') {
      exigerRoleDepenses_(acteur, 'ADMIN');
      return reponseJsonDepenses_(
        annulerDepense_(acteur, donnees)
      );
    }

    throw erreurDepenses_(
      'ACTION_INCONNUE',
      'Action inconnue.'
    );
  } catch (erreur) {
    return reponseJsonDepenses_({
      success: false,
      code: erreur.code || 'ERREUR_INTERNE',
      message:
        erreur.message ||
        'Une erreur interne est survenue.'
    });
  }
}

/**
 * Lecture Admin paginée. Cette fonction ne prend aucun verrou et n'appelle
 * aucune primitive d'écriture Google Sheets.
 */
function listerDepensesAdmin_(donnees) {
  validerProprietesObjet_(
    donnees,
    [
      'dateDebut',
      'dateFin',
      'agence',
      'categorie',
      'devise',
      'agent',
      'statut',
      'reference',
      'page',
      'pageSize'
    ],
    'FILTRES_ADMIN_INVALIDES'
  );

  const filtres = validerFiltresDepensesAdmin_(donnees);
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const resultats = [];

  CONFIG_DEPENSES.feuillesAgences.forEach(function(agence) {
    if (filtres.agence && filtres.agence !== agence) {
      return;
    }

    const feuille = classeur.getSheetByName(agence);
    if (!feuille || feuille.getLastRow() < 2) {
      return;
    }

    const lignes = feuille
      .getRange(
        2,
        1,
        feuille.getLastRow() - 1,
        CONFIG_DEPENSES.entetes.length
      )
      .getValues();

    lignes.forEach(function(ligne) {
      const depense = convertirLigneDepenseAdmin_(ligne, agence);
      if (depense && correspondFiltresDepensesAdmin_(depense, filtres)) {
        resultats.push(depense);
      }
    });
  });

  resultats.sort(function(a, b) {
    if (a.dateHeure !== b.dateHeure) {
      return b.dateHeure.localeCompare(a.dateHeure);
    }
    return a.expenseRequestId.localeCompare(b.expenseRequestId);
  });

  const total = resultats.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / filtres.pageSize);
  const debut = (filtres.page - 1) * filtres.pageSize;

  return {
    success: true,
    code: 'DEPENSES_ADMIN_LISTEES',
    lectureSeule: true,
    depenses: resultats.slice(debut, debut + filtres.pageSize),
    pagination: {
      page: filtres.page,
      pageSize: filtres.pageSize,
      total: total,
      totalPages: totalPages
    },
    totaux: calculerTotauxDepensesAdmin_(resultats)
  };
}

function validerFiltresDepensesAdmin_(donnees) {
  const dateDebut = validerDateFiltreDepensesAdmin_(
    donnees.dateDebut,
    'DATE_DEBUT_INVALIDE'
  );
  const dateFin = validerDateFiltreDepensesAdmin_(
    donnees.dateFin,
    'DATE_FIN_INVALIDE'
  );

  if (dateDebut && dateFin && dateDebut > dateFin) {
    throw erreurDepenses_(
      'PERIODE_INVALIDE',
      'La période est invalide.'
    );
  }

  const agence = validerFiltreConfigureDepensesAdmin_(
    donnees.agence,
    CONFIG_DEPENSES.feuillesAgences,
    'AGENCE_INVALIDE'
  );
  const categorie = validerFiltreConfigureDepensesAdmin_(
    donnees.categorie,
    CONFIG_DEPENSES.categories,
    'CATEGORIE_INVALIDE'
  );
  const devise = validerFiltreConfigureDepensesAdmin_(
    donnees.devise,
    CONFIG_DEPENSES.devises,
    'DEVISE_INVALIDE'
  );
  const statut = validerFiltreConfigureDepensesAdmin_(
    donnees.statut,
    CONFIG_DEPENSES.statuts,
    'STATUT_INVALIDE'
  );
  const page = donnees.page === undefined ? 1 : Number(donnees.page);
  const pageSize = donnees.pageSize === undefined
    ? 50
    : Number(donnees.pageSize);

  if (!Number.isInteger(page) || page < 1) {
    throw erreurDepenses_('PAGE_INVALIDE', 'Page invalide.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw erreurDepenses_(
      'PAGE_SIZE_INVALIDE',
      'La taille de page doit être comprise entre 1 et 100.'
    );
  }

  return {
    dateDebut: dateDebut,
    dateFin: dateFin,
    agence: agence,
    categorie: categorie,
    devise: devise,
    agent: validerTexteMetierDepenses_(
      donnees.agent,
      'AGENT_INVALIDE',
      200,
      true
    ).toUpperCase(),
    statut: statut,
    reference: validerTexteMetierDepenses_(
      donnees.reference,
      'REFERENCE_INVALIDE',
      200,
      true
    ).toUpperCase(),
    page: page,
    pageSize: pageSize
  };
}

function validerDateFiltreDepensesAdmin_(valeur, codeErreur) {
  if (valeur === undefined || valeur === null || valeur === '') {
    return '';
  }
  const texte = String(valeur).trim();
  const correspondance = texte.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!correspondance) {
    throw erreurDepenses_(codeErreur, 'Date invalide.');
  }
  const date = new Date(
    Number(correspondance[1]),
    Number(correspondance[2]) - 1,
    Number(correspondance[3])
  );
  if (
    date.getFullYear() !== Number(correspondance[1]) ||
    date.getMonth() !== Number(correspondance[2]) - 1 ||
    date.getDate() !== Number(correspondance[3])
  ) {
    throw erreurDepenses_(codeErreur, 'Date invalide.');
  }
  return texte;
}

function validerFiltreConfigureDepensesAdmin_(valeur, valeurs, codeErreur) {
  const filtre = normaliserTexte_(valeur);
  if (!filtre || filtre === 'ALL') {
    return '';
  }
  for (let index = 0; index < valeurs.length; index++) {
    if (normaliserTexte_(valeurs[index]) === filtre) {
      return valeurs[index];
    }
  }
  throw erreurDepenses_(codeErreur, 'Valeur de filtre invalide.');
}

function convertirLigneDepenseAdmin_(ligne, agence) {
  const date = analyserDateDepense_(ligne[0]);
  const expenseRequestId = normaliserUuidDepenses_(ligne[1]);
  const montant = analyserMontantDepense_(ligne[5]);
  if (!date || !expenseRequestId || montant === null) {
    return null;
  }
  const statut = normaliserTexte_(ligne[11]);
  const dateMiseAJour = analyserDateDepense_(ligne[19]) ||
    analyserDateDepense_(ligne[17]) || date;
  return {
    id: expenseRequestId,
    expenseRequestId: expenseRequestId,
    date: Utilities.formatDate(date, CONFIG_DEPENSES.fuseauHoraire, 'yyyy-MM-dd'),
    dateHeure: date.toISOString(),
    agence: agence,
    categorie: String(ligne[3] || ''),
    montant: montant,
    devise: normaliserTexte_(ligne[6]),
    description: String(ligne[4] || ''),
    observation: String(ligne[10] || ''),
    agent: String(ligne[9] || ''),
    statut: statut,
    reference: String(ligne[8] || ''),
    dateCreation: date.toISOString(),
    dateMiseAJour: dateMiseAJour.toISOString(),
    annulee: statut === 'ANNULEE' || statut === 'ANNULÉE',
    corrigee: statut === 'CORRIGEE'
  };
}

function correspondFiltresDepensesAdmin_(depense, filtres) {
  return (
    (!filtres.dateDebut || depense.date >= filtres.dateDebut) &&
    (!filtres.dateFin || depense.date <= filtres.dateFin) &&
    (!filtres.categorie || depense.categorie === filtres.categorie) &&
    (!filtres.devise || depense.devise === filtres.devise) &&
    (!filtres.statut || depense.statut === normaliserTexte_(filtres.statut)) &&
    (!filtres.agent || normaliserTexte_(depense.agent).includes(filtres.agent)) &&
    (!filtres.reference || normaliserTexte_(depense.reference).includes(filtres.reference))
  );
}

function calculerTotauxDepensesAdmin_(depenses) {
  const parDevise = {};
  const parAgence = {};
  const parCategorie = {};
  depenses.forEach(function(depense) {
    parDevise[depense.devise] =
      (parDevise[depense.devise] || 0) + depense.montant;
    if (!parAgence[depense.agence]) {
      parAgence[depense.agence] = {};
    }
    parAgence[depense.agence][depense.devise] =
      (parAgence[depense.agence][depense.devise] || 0) + depense.montant;
    if (!parCategorie[depense.categorie]) {
      parCategorie[depense.categorie] = {};
    }
    parCategorie[depense.categorie][depense.devise] =
      (parCategorie[depense.categorie][depense.devise] || 0) + depense.montant;
  });
  return {
    nombreDepenses: depenses.length,
    parDevise: parDevise,
    parAgence: parAgence,
    parCategorie: parCategorie
  };
}

/**
 * Enregistre une dépense sous le même verrou que la recherche
 * d'idempotence et l'écriture de l'audit.
 */
function enregistrerDepenseSecurisee_(acteur, donnees) {
  validerProprietesObjet_(
    donnees,
    [
      'expenseRequestId',
      'categorie',
      'description',
      'montant',
      'devise',
      'modePaiement',
      'reference',
      'observation'
    ],
    'DEPENSE_INVALIDE'
  );

  const expenseRequestId = validerUuidV4Depenses_(
    donnees.expenseRequestId,
    'EXPENSE_REQUEST_ID_INVALIDE'
  );
  const categorie = validerCategorieDepenses_(
    donnees.categorie
  );
  const description = validerTexteMetierDepenses_(
    donnees.description,
    'DESCRIPTION_INVALIDE',
    500,
    false
  );
  const montant = exigerMontantDepenses_(
    donnees.montant
  );
  const devise = validerValeurConfigureeDepenses_(
    donnees.devise,
    CONFIG_DEPENSES.devises,
    'DEVISE_INVALIDE'
  );
  const modePaiement =
    validerValeurConfigureeDepenses_(
      donnees.modePaiement,
      CONFIG_DEPENSES.modesPaiement,
      'MODE_PAIEMENT_INVALIDE'
    );
  const reference = validerTexteMetierDepenses_(
    donnees.reference,
    'REFERENCE_INVALIDE',
    200,
    true
  );
  const observation = validerTexteMetierDepenses_(
    donnees.observation,
    'OBSERVATION_INVALIDE',
    1000,
    true
  );
  const feuilleAgence = agenceVersFeuilleDepenses_(
    acteur.agence
  );
  const verrou = LockService.getScriptLock();
  const performanceDepenses = {
    debut: Date.now(),
    etapes: {},
    resultat: 'ERROR',
    cheminStatistiques: null,
    raisonFallback: null,
    appelsSheets: {
      textFinder: 0,
      getRange: 0,
      getValues: 0,
      setValue: 0,
      setValues: 0,
      insertRows: 0,
      clear: 0,
      formatage: 0,
      autoResize: 0,
      flush: 0,
      autres: 0
    }
  };

  try {
    mesurerEtapeDepenses_(
      performanceDepenses,
      'attente_verrou',
      function() {
        verrou.waitLock(30000);
      }
    );

    const classeur =
      SpreadsheetApp.getActiveSpreadsheet();
    compterAppelDepenses_(performanceDepenses, 'autres');
    const existante = mesurerEtapeDepenses_(
      performanceDepenses,
      'recherche_idempotence',
      function() {
        return trouverDepenseParId_(
          classeur,
          expenseRequestId,
          performanceDepenses
        );
      }
    );

    if (existante) {
      if (
        existante.feuille.getName() !==
        feuilleAgence
      ) {
        throw erreurDepenses_(
          'EXPENSE_REQUEST_ID_CONFLIT',
          'Identifiant déjà utilisé par une autre agence.'
        );
      }

      performanceDepenses.resultat = 'SUCCESS';
      return {
        success: true,
        code: 'DEPENSE_DEJA_ENREGISTREE',
        expenseRequestId: expenseRequestId,
        performanceTelemetry: performanceDepenses
      };
    }

    const feuille = exigerFeuilleDepenses_(
      classeur,
      feuilleAgence
    );
    const dateHeure = new Date();
    const ligne = [
      dateHeure,
      expenseRequestId,
      feuilleAgence,
      categorie,
      description,
      montant,
      devise,
      modePaiement,
      reference,
      acteur.nom,
      observation,
      'ACTIVE',
      montant,
      categorie,
      description,
      '',
      '',
      '',
      '',
      '',
      ''
    ];

    mesurerEtapeDepenses_(
      performanceDepenses,
      'ecriture_depense',
      function() {
        compterAppelDepenses_(performanceDepenses, 'getRange');
        compterAppelDepenses_(performanceDepenses, 'setValues');
        feuille
          .getRange(
            feuille.getLastRow() + 1,
            1,
            1,
            CONFIG_DEPENSES.entetes.length
          )
          .setValues([ligne]);
      }
    );

    mesurerEtapeDepenses_(
      performanceDepenses,
      'ecriture_audit',
      function() {
        ajouterAuditDepenses_(classeur, {
          typeEvenement: 'CREATION',
          dateHeure: dateHeure,
          expenseRequestId: expenseRequestId,
          correctionRequestId: '',
          agence: feuilleAgence,
          feuilleSource: feuilleAgence,
          acteur: acteur,
          statutAvant: '',
          statutApres: 'ACTIVE',
          avant: null,
          apres: valeursMetierDepuisLigne_(ligne),
          motif: '',
          resultat: 'SUCCES',
          referenceTechnique: expenseRequestId
        }, performanceDepenses);
      }
    );

    mesurerEtapeDepenses_(
      performanceDepenses,
      'statistiques',
      function() {
        mettreAJourStatistiquesDepensesCibleesSousVerrou_(
          classeur,
          ligne,
          feuilleAgence,
          performanceDepenses
        );
      }
    );

    performanceDepenses.resultat = 'SUCCESS';
    return {
      success: true,
      code: 'DEPENSE_ENREGISTREE',
      expenseRequestId: expenseRequestId,
      performanceTelemetry: performanceDepenses
    };
  } finally {
    journaliserPerformanceDepenses_(performanceDepenses);
    verrou.releaseLock();
  }
}

function mesurerEtapeDepenses_(performanceDepenses, nom, action) {
  const debut = Date.now();
  try {
    return action();
  } finally {
    performanceDepenses.etapes[nom] = Date.now() - debut;
  }
}

function journaliserPerformanceDepenses_(performanceDepenses) {
  performanceDepenses.fin = Date.now();
  performanceDepenses.startedAt = new Date(
    performanceDepenses.debut
  ).toISOString();
  performanceDepenses.finishedAt = new Date(
    performanceDepenses.fin
  ).toISOString();
  performanceDepenses.totalMs =
    performanceDepenses.fin - performanceDepenses.debut;
  performanceDepenses.stepsMs = performanceDepenses.etapes;
  performanceDepenses.statisticsPath =
    performanceDepenses.cheminStatistiques;
  performanceDepenses.fallbackReason =
    performanceDepenses.raisonFallback;
  performanceDepenses.sheetCalls =
    performanceDepenses.appelsSheets;
  console.info(JSON.stringify({
    type: 'depenses_apps_script_performance',
    resultat: performanceDepenses.resultat,
    durationsMs: performanceDepenses.etapes,
    totalMs: Date.now() - performanceDepenses.debut
  }));
}

function compterAppelDepenses_(performanceDepenses, type, nombre) {
  if (!performanceDepenses || !performanceDepenses.appelsSheets) {
    return;
  }
  performanceDepenses.appelsSheets[type] += nombre || 1;
}

/**
 * Crée une demande immuable et place la dépense en attente.
 */
function demanderCorrectionDepense_(acteur, donnees) {
  validerProprietesObjet_(
    donnees,
    [
      'expenseRequestId',
      'correctionRequestId',
      'motif',
      'valeursDemandees'
    ],
    'CORRECTION_INVALIDE'
  );

  const expenseRequestId = validerUuidV4Depenses_(
    donnees.expenseRequestId,
    'EXPENSE_REQUEST_ID_INVALIDE'
  );
  const correctionRequestId =
    validerUuidV4Depenses_(
      donnees.correctionRequestId,
      'CORRECTION_REQUEST_ID_INVALIDE'
    );
  const motif = validerTexteMetierDepenses_(
    donnees.motif,
    'MOTIF_CORRECTION_OBLIGATOIRE',
    1000,
    false
  );
  const valeursDemandees =
    validerValeursCorrectionDepenses_(
      donnees.valeursDemandees
    );
  const feuilleAgence = agenceVersFeuilleDepenses_(
    acteur.agence
  );
  const verrou = LockService.getScriptLock();

  try {
    verrou.waitLock(30000);

    const classeur =
      SpreadsheetApp.getActiveSpreadsheet();
    const correctionExistante =
      trouverCorrectionParId_(
        classeur,
        correctionRequestId
      );

    if (correctionExistante) {
      if (
        normaliserUuidDepenses_(
          correctionExistante.valeurs[1]
        ) !== expenseRequestId ||
        correctionExistante.valeurs[6] !== acteur.id
      ) {
        throw erreurDepenses_(
          'CORRECTION_REQUEST_ID_CONFLIT',
          'Identifiant de correction déjà utilisé.'
        );
      }

      return {
        success: true,
        code: 'CORRECTION_DEJA_DEMANDEE',
        correctionRequestId: correctionRequestId
      };
    }

    const depense = trouverDepenseParId_(
      classeur,
      expenseRequestId
    );

    if (!depense) {
      throw erreurDepenses_(
        'DEPENSE_INTROUVABLE',
        'La dépense est introuvable.'
      );
    }

    if (depense.feuille.getName() !== feuilleAgence) {
      throw erreurDepenses_(
        'AGENCE_INTERDITE',
        'Cette dépense appartient à une autre agence.'
      );
    }

    const ligneAvant = depense.valeurs;
    const statutAvant = normaliserTexte_(
      ligneAvant[11]
    );

    if (
      statutAvant !== 'ACTIVE' &&
      statutAvant !== 'CORRIGEE'
    ) {
      throw erreurDepenses_(
        'CORRECTION_NON_AUTORISEE',
        'Cette dépense ne peut pas être corrigée.'
      );
    }

    const dateDemande = new Date();
    const avant =
      valeursMetierDepuisLigne_(ligneAvant);
    const feuilleCorrections =
      exigerFeuilleDepenses_(
        classeur,
        CONFIG_DEPENSES.feuilleCorrections
      );
    const ligneCorrection = [
      correctionRequestId,
      expenseRequestId,
      feuilleAgence,
      feuilleAgence,
      'CORRECTION_DEMANDEE',
      motif,
      acteur.id,
      acteur.nom,
      dateDemande,
      avant.categorie,
      avant.description,
      avant.montant,
      avant.devise,
      avant.modePaiement,
      avant.reference,
      avant.observation,
      valeursDemandees.categorie,
      valeursDemandees.description,
      valeursDemandees.montant,
      valeursDemandees.devise,
      valeursDemandees.modePaiement,
      valeursDemandees.reference,
      valeursDemandees.observation,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ];

    feuilleCorrections
      .getRange(
        feuilleCorrections.getLastRow() + 1,
        1,
        1,
        ENTETES_CORRECTIONS_DEPENSES.length
      )
      .setValues([ligneCorrection]);

    depense.feuille
      .getRange(depense.ligne, 12)
      .setValue('CORRECTION_DEMANDEE');
    depense.feuille
      .getRange(depense.ligne, 16, 1, 6)
      .setValues([[
        motif,
        acteur.nom,
        dateDemande,
        '',
        '',
        correctionRequestId
      ]]);

    ajouterAuditDepenses_(classeur, {
      typeEvenement: 'DEMANDE_CORRECTION',
      dateHeure: dateDemande,
      expenseRequestId: expenseRequestId,
      correctionRequestId: correctionRequestId,
      agence: feuilleAgence,
      feuilleSource: feuilleAgence,
      acteur: acteur,
      statutAvant: statutAvant,
      statutApres: 'CORRECTION_DEMANDEE',
      avant: avant,
      apres: valeursDemandees,
      motif: motif,
      resultat: 'EN_ATTENTE',
      referenceTechnique: correctionRequestId
    });

    recalculerStatistiquesDepensesSousVerrou_(
      classeur
    );

    return {
      success: true,
      code: 'CORRECTION_DEMANDEE',
      correctionRequestId: correctionRequestId
    };
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Approuve ou refuse une demande. Un refus remet la dépense à ACTIVE.
 */
function deciderCorrectionDepense_(acteur, donnees) {
  validerProprietesObjet_(
    donnees,
    [
      'correctionRequestId',
      'decision',
      'motifDecision'
    ],
    'DECISION_INVALIDE'
  );

  const correctionRequestId =
    validerUuidV4Depenses_(
      donnees.correctionRequestId,
      'CORRECTION_REQUEST_ID_INVALIDE'
    );
  const decision = normaliserTexte_(
    donnees.decision
  );

  if (
    decision !== 'APPROUVER' &&
    decision !== 'REFUSER'
  ) {
    throw erreurDepenses_(
      'DECISION_INVALIDE',
      'La décision doit être APPROUVER ou REFUSER.'
    );
  }

  const motifDecision =
    validerTexteMetierDepenses_(
      donnees.motifDecision,
      decision === 'REFUSER'
        ? 'MOTIF_REFUS_OBLIGATOIRE'
        : 'MOTIF_DECISION_INVALIDE',
      1000,
      decision !== 'REFUSER'
    );
  const verrou = LockService.getScriptLock();

  try {
    verrou.waitLock(30000);

    const classeur =
      SpreadsheetApp.getActiveSpreadsheet();
    const correction = trouverCorrectionParId_(
      classeur,
      correctionRequestId
    );

    if (!correction) {
      throw erreurDepenses_(
        'CORRECTION_INTROUVABLE',
        'La demande de correction est introuvable.'
      );
    }

    const statutDemande = normaliserTexte_(
      correction.valeurs[4]
    );

    if (statutDemande !== 'CORRECTION_DEMANDEE') {
      return {
        success: true,
        code: 'CORRECTION_DEJA_TRAITEE',
        correctionRequestId: correctionRequestId
      };
    }

    const expenseRequestId =
      validerUuidV4Depenses_(
        correction.valeurs[1],
        'EXPENSE_REQUEST_ID_INVALIDE'
      );
    const depense = trouverDepenseParId_(
      classeur,
      expenseRequestId
    );

    if (!depense) {
      throw erreurDepenses_(
        'DEPENSE_INTROUVABLE',
        'La dépense liée est introuvable.'
      );
    }

    if (
      normaliserTexte_(depense.valeurs[11]) !==
      'CORRECTION_DEMANDEE'
    ) {
      throw erreurDepenses_(
        'ETAT_DEPENSE_INCOHERENT',
        'La dépense n’est plus en attente de correction.'
      );
    }

    const dateDecision = new Date();
    const avant =
      valeursMetierDepuisLigne_(depense.valeurs);
    const demandees = {
      categorie: correction.valeurs[16],
      description: correction.valeurs[17],
      montant: correction.valeurs[18],
      devise: correction.valeurs[19],
      modePaiement: correction.valeurs[20],
      reference: correction.valeurs[21],
      observation: correction.valeurs[22]
    };
    let statutApres;
    let statutCorrection;
    let appliquees;
    let typeEvenement;
    let codeReponse;
    let resultatAudit;
    let decisionEnregistree;

    if (decision === 'APPROUVER') {
      statutApres = 'CORRIGEE';
      statutCorrection = 'CORRIGEE';
      typeEvenement = 'APPROBATION_CORRECTION';
      codeReponse = 'CORRECTION_APPROUVEE';
      resultatAudit = 'SUCCESS';
      decisionEnregistree = 'APPROUVEE';
      appliquees = demandees;

      depense.feuille
        .getRange(depense.ligne, 4, 1, 6)
        .setValues([[
          demandees.categorie,
          demandees.description,
          demandees.montant,
          demandees.devise,
          demandees.modePaiement,
          demandees.reference
        ]]);
      depense.feuille
        .getRange(depense.ligne, 11)
        .setValue(demandees.observation);
    } else {
      statutApres = 'ACTIVE';
      statutCorrection = 'CORRECTION_REFUSEE';
      typeEvenement = 'REFUS_CORRECTION';
      codeReponse = 'CORRECTION_REFUSEE';
      resultatAudit = 'CORRECTION_REFUSEE';
      decisionEnregistree = 'REFUSEE';
      appliquees = avant;
    }

    depense.feuille
      .getRange(depense.ligne, 12)
      .setValue(statutApres);
    depense.feuille
      .getRange(depense.ligne, 19, 1, 3)
      .setValues([[
        acteur.nom,
        dateDecision,
        correctionRequestId
      ]]);

    correction.feuille
      .getRange(correction.ligne, 5)
      .setValue(statutCorrection);
    correction.feuille
      .getRange(correction.ligne, 24, 1, 12)
      .setValues([[
        decisionEnregistree,
        motifDecision,
        acteur.id,
        acteur.nom,
        dateDecision,
        appliquees.categorie,
        appliquees.description,
        appliquees.montant,
        appliquees.devise,
        appliquees.modePaiement,
        appliquees.reference,
        appliquees.observation
      ]]);

    ajouterAuditDepenses_(classeur, {
      typeEvenement: typeEvenement,
      dateHeure: dateDecision,
      expenseRequestId: expenseRequestId,
      correctionRequestId: correctionRequestId,
      agence: depense.feuille.getName(),
      feuilleSource: depense.feuille.getName(),
      acteur: acteur,
      statutAvant: 'CORRECTION_DEMANDEE',
      statutApres: statutApres,
      avant: avant,
      apres: appliquees,
      motif: motifDecision,
      resultat: resultatAudit,
      referenceTechnique: correctionRequestId
    });

    recalculerStatistiquesDepensesSousVerrou_(
      classeur
    );

    return {
      success: true,
      code: codeReponse,
      correctionRequestId: correctionRequestId
    };
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Annule sans supprimer. Le motif ADMIN est obligatoire.
 */
function annulerDepense_(acteur, donnees) {
  validerProprietesObjet_(
    donnees,
    ['expenseRequestId', 'motif'],
    'ANNULATION_INVALIDE'
  );

  const expenseRequestId = validerUuidV4Depenses_(
    donnees.expenseRequestId,
    'EXPENSE_REQUEST_ID_INVALIDE'
  );
  const motif = validerTexteMetierDepenses_(
    donnees.motif,
    'MOTIF_ANNULATION_OBLIGATOIRE',
    1000,
    false
  );
  const verrou = LockService.getScriptLock();

  try {
    verrou.waitLock(30000);

    const classeur =
      SpreadsheetApp.getActiveSpreadsheet();
    const depense = trouverDepenseParId_(
      classeur,
      expenseRequestId
    );

    if (!depense) {
      throw erreurDepenses_(
        'DEPENSE_INTROUVABLE',
        'La dépense est introuvable.'
      );
    }

    const statutAvant = normaliserTexte_(
      depense.valeurs[11]
    );

    if (
      statutAvant === 'ANNULEE' ||
      statutAvant === 'ANNULÉE' ||
      annulationDejaAuditee_(
        classeur,
        expenseRequestId
      )
    ) {
      return {
        success: true,
        code: 'DEPENSE_DEJA_ANNULEE',
        expenseRequestId: expenseRequestId
      };
    }

    if (
      statutAvant !== 'ACTIVE' &&
      statutAvant !== 'CORRIGEE'
    ) {
      throw erreurDepenses_(
        'ANNULATION_NON_AUTORISEE',
        'Cette dépense ne peut pas être annulée.'
      );
    }

    const dateAnnulation = new Date();
    const avant =
      valeursMetierDepuisLigne_(depense.valeurs);

    depense.feuille
      .getRange(depense.ligne, 12)
      .setValue('ANNULEE');
    depense.feuille
      .getRange(depense.ligne, 19, 1, 2)
      .setValues([[acteur.nom, dateAnnulation]]);

    ajouterAuditDepenses_(classeur, {
      typeEvenement: 'ANNULATION',
      dateHeure: dateAnnulation,
      expenseRequestId: expenseRequestId,
      correctionRequestId: '',
      agence: depense.feuille.getName(),
      feuilleSource: depense.feuille.getName(),
      acteur: acteur,
      statutAvant: statutAvant,
      statutApres: 'ANNULEE',
      avant: avant,
      apres: avant,
      motif: motif,
      resultat: 'ANNULEE',
      referenceTechnique: expenseRequestId
    });

    recalculerStatistiquesDepensesSousVerrou_(
      classeur
    );

    return {
      success: true,
      code: 'DEPENSE_ANNULEE',
      expenseRequestId: expenseRequestId
    };
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Confirme l'idempotence d'une annulation déjà journalisée.
 * Cette lecture seule est exécutée sous le même verrou que l'annulation.
 */
function annulationDejaAuditee_(
  classeur,
  expenseRequestId
) {
  const feuille = classeur.getSheetByName(
    CONFIG_DEPENSES.feuilleAudit
  );

  if (!feuille || feuille.getLastRow() < 2) {
    return false;
  }

  const lignes = feuille
    .getRange(2, 2, feuille.getLastRow() - 1, 3)
    .getDisplayValues();

  return lignes.some(function(ligne) {
    return (
      normaliserTexte_(ligne[0]) === 'ANNULATION' &&
      normaliserUuidDepenses_(ligne[2]) ===
        expenseRequestId
    );
  });
}

/**
 * Recalcul interne appelé lorsqu'un verrou de script est déjà détenu.
 * Évite de tenter d'acquérir un second verrou.
 */
function recalculerStatistiquesDepensesSousVerrou_(
  classeur
) {
  const feuilleStatistiques =
    creerOuPreparerFeuilleStatistiques_(classeur);
  const statistiquesJournalieres = new Map();
  const statistiquesMensuelles = new Map();
  const anomalies = {
    datesInvalides: 0,
    montantsInvalides: 0,
    devisesInvalides: 0,
    statutsInconnus: 0
  };

  CONFIG_DEPENSES.feuillesAgences.forEach(
    function (nomAgence) {
      const feuille =
        classeur.getSheetByName(nomAgence);

      if (!feuille || feuille.getLastRow() < 2) {
        return;
      }

      const lignes = feuille
        .getRange(
          2,
          1,
          feuille.getLastRow() - 1,
          CONFIG_DEPENSES.entetes.length
        )
        .getValues();

      lignes.forEach(function (ligne) {
        traiterLigneStatistique_(
          ligne,
          nomAgence,
          statistiquesJournalieres,
          statistiquesMensuelles,
          anomalies
        );
      });
    }
  );

  ecrireStatistiques_(
    feuilleStatistiques,
    convertirStatistiquesEnLignes_(
      statistiquesJournalieres,
      'JOURNALIER'
    ),
    convertirStatistiquesEnLignes_(
      statistiquesMensuelles,
      'MENSUEL'
    ),
    anomalies
  );
}

/**
 * Met à jour le résumé après une création sans relire l'historique complet.
 * Si le résumé existant n'est pas strictement exploitable, le recalcul
 * intégral reste le repli sûr sous le verrou déjà détenu.
 */
function mettreAJourStatistiquesDepensesCibleesSousVerrou_(
  classeur,
  ligne,
  nomAgence,
  performanceDepenses
) {
  const feuilleStatistiques =
    creerOuPreparerFeuilleStatistiques_(classeur);
  const resume = mesurerEtapeDepenses_(
    performanceDepenses,
    'lecture_validation_statistiques',
    function() {
      return lireResumeStatistiquesDepenses_(
        feuilleStatistiques,
        performanceDepenses
      );
    }
  );

  if (!resume) {
    performanceDepenses.cheminStatistiques = 'FULL_FALLBACK';
    performanceDepenses.raisonFallback =
      'RESUME_ABSENT_OU_STRUCTURE_INVALIDE';
    recalculerStatistiquesDepensesSousVerrou_(classeur);
    return;
  }

  const misesAJour = preparerMisesAJourStatistiquesDepenses_(
    ligne,
    nomAgence,
    resume,
    performanceDepenses
  );

  if (!misesAJour) {
    performanceDepenses.cheminStatistiques = 'FULL_FALLBACK';
    recalculerStatistiquesDepensesSousVerrou_(classeur);
    return;
  }

  performanceDepenses.cheminStatistiques = 'INCREMENTAL';
  mesurerEtapeDepenses_(
    performanceDepenses,
    'mise_a_jour_statistiques',
    function() {
      misesAJour.forEach(function(miseAJour) {
        compterAppelDepenses_(performanceDepenses, 'getRange');
        compterAppelDepenses_(performanceDepenses, 'setValues');
        feuilleStatistiques
          .getRange(miseAJour.ligne, 5, 1, 2)
          .setValues([[
            miseAJour.total,
            miseAJour.nombreOperations
          ]]);
      });

      compterAppelDepenses_(performanceDepenses, 'getRange');
      compterAppelDepenses_(performanceDepenses, 'setValue');
      feuilleStatistiques
        .getRange('A2:F2')
        .setValue(
          'Dernière actualisation : ' +
          Utilities.formatDate(
            new Date(),
            CONFIG_DEPENSES.fuseauHoraire,
            'dd/MM/yyyy HH:mm:ss'
          )
        );
    }
  );
}

/**
 * Prépare les quatre mises à jour affectées par une création : jour/mois,
 * agence/tous les sites. Toute structure absente ou incohérente impose le
 * recalcul intégral existant.
 */
function preparerMisesAJourStatistiquesDepenses_(
  ligne,
  nomAgence,
  resume,
  performanceDepenses
) {
  const date = analyserDateDepense_(ligne[0]);
  const montant = analyserMontantDepense_(ligne[5]);
  const devise = normaliserTexte_(ligne[6]);
  const statut = normaliserTexte_(ligne[11]);

  if (
    !date
  ) {
    performanceDepenses.raisonFallback = 'DATE_INVALIDE';
    return null;
  }
  if (montant === null) {
    performanceDepenses.raisonFallback = 'MONTANT_INVALIDE';
    return null;
  }
  if (!CONFIG_DEPENSES.devises.includes(devise)) {
    performanceDepenses.raisonFallback = 'DEVISE_INVALIDE';
    return null;
  }
  if (statut !== 'ACTIVE') {
    performanceDepenses.raisonFallback = 'STATUT_INVALIDE';
    return null;
  }

  const jour = Utilities.formatDate(
    date,
    CONFIG_DEPENSES.fuseauHoraire,
    'yyyy-MM-dd'
  );
  const mois = Utilities.formatDate(
    date,
    CONFIG_DEPENSES.fuseauHoraire,
    'yyyy-MM'
  );
  const cles = [
    ['JOURNALIER', jour, nomAgence],
    ['JOURNALIER', jour, 'TOUS LES SITES'],
    ['MENSUEL', mois, nomAgence],
    ['MENSUEL', mois, 'TOUS LES SITES']
  ];
  const misesAJour = [];

  for (let index = 0; index < cles.length; index++) {
    const type = cles[index][0];
    const periode = cles[index][1];
    const site = cles[index][2];
    const cle = [type, periode, site, devise].join('|');
    const entree = resume.lignesParCle.get(cle);

    if (
      !entree
    ) {
      performanceDepenses.raisonFallback = type === 'JOURNALIER'
        ? 'AGREGAT_JOURNALIER_ABSENT'
        : 'AGREGAT_MENSUEL_ABSENT';
      return null;
    }
    if (
      !Number.isFinite(entree.total) ||
      !Number.isInteger(entree.nombreOperations) ||
      entree.nombreOperations < 0
    ) {
      performanceDepenses.raisonFallback = 'AGREGAT_INVALIDE';
      return null;
    }

    misesAJour.push({
      ligne: entree.ligne,
      total: entree.total + montant,
      nombreOperations: entree.nombreOperations + 1
    });
  }

  return misesAJour;
}

/**
 * Normalise une période matérialisée dans STAT DEPENSES sans interpréter
 * les chaînes ambiguës. Google Sheets renvoie les cellules de date comme de
 * vrais objets Date avec getValues(), tandis que les périodes mensuelles et
 * certains historiques peuvent déjà être des chaînes normalisées.
 */
function normaliserPeriodeStatistique_(valeur, type) {
  const format = type === 'JOURNALIER'
    ? 'yyyy-MM-dd'
    : type === 'MENSUEL'
      ? 'yyyy-MM'
      : null;

  if (!format) {
    return null;
  }

  if (valeur instanceof Date) {
    if (!Number.isFinite(valeur.getTime())) {
      return null;
    }
    return Utilities.formatDate(
      valeur,
      CONFIG_DEPENSES.fuseauHoraire,
      format
    );
  }

  if (typeof valeur !== 'string') {
    return null;
  }

  const periode = valeur.trim();
  const formatValide = type === 'JOURNALIER'
    ? /^\d{4}-\d{2}-\d{2}$/.test(periode)
    : /^\d{4}-\d{2}$/.test(periode);

  return formatValide ? periode : null;
}

/**
 * Relit uniquement le petit résumé matérialisé. Toute incohérence force le
 * repli vers le recalcul intégral afin de ne jamais propager un agrégat douteux.
 */
function lireResumeStatistiquesDepenses_(feuille, performanceDepenses) {
  if (feuille.getLastRow() < 8) {
    return null;
  }

  compterAppelDepenses_(performanceDepenses, 'getRange');
  compterAppelDepenses_(performanceDepenses, 'getValues');
  const lignes = feuille
    .getRange(5, 1, feuille.getLastRow() - 4, 6)
    .getValues();
  const statistiquesJournalieres = new Map();
  const statistiquesMensuelles = new Map();
  const lignesParCle = new Map();
  const anomalies = {
    datesInvalides: null,
    montantsInvalides: null,
    devisesInvalides: null,
    statutsInconnus: null
  };
  const libellesAnomalies = {
    'Dates invalides ou absentes': 'datesInvalides',
    'Montants invalides': 'montantsInvalides',
    'Devises invalides': 'devisesInvalides',
    'Statuts inconnus': 'statutsInconnus'
  };
  let invalide = false;

  lignes.forEach(function(ligne, index) {
    if (invalide) {
      return;
    }

    const type = String(ligne[0] || '').trim();
    const cleAnomalie = libellesAnomalies[type];

    if (cleAnomalie) {
      const nombre = Number(ligne[1]);
      if (
        anomalies[cleAnomalie] !== null ||
        !Number.isInteger(nombre) ||
        nombre < 0
      ) {
        invalide = true;
        return;
      }
      anomalies[cleAnomalie] = nombre;
      return;
    }

    if (type !== 'JOURNALIER' && type !== 'MENSUEL') {
      return;
    }

    const periode = normaliserPeriodeStatistique_(ligne[1], type);
    const site = String(ligne[2] || '').trim();
    const devise = String(ligne[3] || '').trim();
    const total = Number(ligne[4]);
    const nombreOperations = Number(ligne[5]);
    const siteValide =
      site === 'TOUS LES SITES' ||
      CONFIG_DEPENSES.feuillesAgences.includes(site);

    if (
      !periode ||
      !siteValide ||
      !CONFIG_DEPENSES.devises.includes(devise) ||
      !Number.isFinite(total) ||
      !Number.isInteger(nombreOperations) ||
      nombreOperations < 0
    ) {
      invalide = true;
      return;
    }

    const statistiques = type === 'JOURNALIER'
      ? statistiquesJournalieres
      : statistiquesMensuelles;
    const cle = [periode, site, devise].join('|');
    const cleAvecType = [type, periode, site, devise]
      .join('|');

    if (
      statistiques.has(cle) ||
      lignesParCle.has(cleAvecType)
    ) {
      invalide = true;
      return;
    }

    const valeur = {
      periode: periode,
      site: site,
      devise: devise,
      total: total,
      nombreOperations: nombreOperations
    };
    statistiques.set(cle, valeur);
    lignesParCle.set(cleAvecType, {
      ligne: index + 5,
      total: total,
      nombreOperations: nombreOperations
    });
  });

  const anomaliesCompletes = Object.keys(anomalies)
    .every(function(cle) {
      return anomalies[cle] !== null;
    });

  if (invalide || !anomaliesCompletes) {
    return null;
  }

  return {
    statistiquesJournalieres: statistiquesJournalieres,
    statistiquesMensuelles: statistiquesMensuelles,
    anomalies: anomalies,
    lignesParCle: lignesParCle
  };
}

function trouverDepenseParId_(
  classeur,
  expenseRequestId,
  performanceDepenses
) {
  for (
    let index = 0;
    index < CONFIG_DEPENSES.feuillesAgences.length;
    index++
  ) {
    const nomFeuille =
      CONFIG_DEPENSES.feuillesAgences[index];
    const feuille =
      classeur.getSheetByName(nomFeuille);

    if (!feuille || feuille.getLastRow() < 2) {
      continue;
    }

    compterAppelDepenses_(performanceDepenses, 'getRange');
    compterAppelDepenses_(performanceDepenses, 'textFinder');
    const cellule = feuille
      .getRange(2, 2, feuille.getLastRow() - 1, 1)
      .createTextFinder(expenseRequestId)
      .matchCase(false)
      .matchEntireCell(true)
      .useRegularExpression(false)
      .findNext();

    if (cellule) {
      const numeroLigne = cellule.getRow();
      compterAppelDepenses_(performanceDepenses, 'getRange');
      compterAppelDepenses_(performanceDepenses, 'getValues');
      return {
        feuille: feuille,
        ligne: numeroLigne,
        valeurs: feuille
          .getRange(
            numeroLigne,
            1,
            1,
            CONFIG_DEPENSES.entetes.length
          )
          .getValues()[0]
      };
    }
  }

  return null;
}

function trouverCorrectionParId_(
  classeur,
  correctionRequestId
) {
  const feuille =
    classeur.getSheetByName(
      CONFIG_DEPENSES.feuilleCorrections
    );

  if (!feuille || feuille.getLastRow() < 2) {
    return null;
  }

  const ids = feuille
    .getRange(2, 1, feuille.getLastRow() - 1, 1)
    .getDisplayValues();

  for (let ligne = 0; ligne < ids.length; ligne++) {
    if (
      normaliserUuidDepenses_(ids[ligne][0]) ===
      correctionRequestId
    ) {
      return {
        feuille: feuille,
        ligne: ligne + 2,
        valeurs: feuille
          .getRange(
            ligne + 2,
            1,
            1,
            ENTETES_CORRECTIONS_DEPENSES.length
          )
          .getValues()[0]
      };
    }
  }

  return null;
}

function ajouterAuditDepenses_(classeur, evenement, performanceDepenses) {
  const feuille = exigerFeuilleDepenses_(
    classeur,
    CONFIG_DEPENSES.feuilleAudit
  );
  const avant = evenement.avant || {};
  const apres = evenement.apres || {};
  const auditEventId =
    Utilities.getUuid().toLowerCase();
  const ligne = [
    auditEventId,
    evenement.typeEvenement,
    evenement.dateHeure,
    evenement.expenseRequestId,
    evenement.correctionRequestId || '',
    evenement.agence,
    evenement.feuilleSource,
    evenement.acteur.id,
    evenement.acteur.nom,
    evenement.acteur.role,
    evenement.statutAvant,
    evenement.statutApres,
    avant.categorie || '',
    apres.categorie || '',
    avant.description || '',
    apres.description || '',
    avant.montant || '',
    apres.montant || '',
    avant.devise || '',
    apres.devise || '',
    avant.modePaiement || '',
    apres.modePaiement || '',
    avant.reference || '',
    apres.reference || '',
    avant.observation || '',
    apres.observation || '',
    evenement.motif || '',
    evenement.resultat,
    evenement.referenceTechnique || ''
  ];

  compterAppelDepenses_(performanceDepenses, 'getRange');
  compterAppelDepenses_(performanceDepenses, 'setValues');
  feuille
    .getRange(
      feuille.getLastRow() + 1,
      1,
      1,
      ENTETES_AUDIT_DEPENSES.length
    )
    .setValues([ligne]);
}

function valeursMetierDepuisLigne_(ligne) {
  return {
    categorie: ligne[3],
    description: ligne[4],
    montant: ligne[5],
    devise: ligne[6],
    modePaiement: ligne[7],
    reference: ligne[8] || '',
    observation: ligne[10] || ''
  };
}

function validerValeursCorrectionDepenses_(valeurs) {
  validerProprietesObjet_(
    valeurs,
    [
      'categorie',
      'description',
      'montant',
      'devise',
      'modePaiement',
      'reference',
      'observation'
    ],
    'VALEURS_CORRECTION_INVALIDES'
  );

  return {
    categorie: validerCategorieDepenses_(
      valeurs.categorie
    ),
    description: validerTexteMetierDepenses_(
      valeurs.description,
      'DESCRIPTION_INVALIDE',
      500,
      false
    ),
    montant: exigerMontantDepenses_(
      valeurs.montant
    ),
    devise: validerValeurConfigureeDepenses_(
      valeurs.devise,
      CONFIG_DEPENSES.devises,
      'DEVISE_INVALIDE'
    ),
    modePaiement:
      validerValeurConfigureeDepenses_(
        valeurs.modePaiement,
        CONFIG_DEPENSES.modesPaiement,
        'MODE_PAIEMENT_INVALIDE'
      ),
    reference: validerTexteMetierDepenses_(
      valeurs.reference,
      'REFERENCE_INVALIDE',
      200,
      true
    ),
    observation: validerTexteMetierDepenses_(
      valeurs.observation,
      'OBSERVATION_INVALIDE',
      1000,
      true
    )
  };
}

function validerActeurServeur_(valeur) {
  validerProprietesObjet_(
    valeur,
    ['id', 'nom', 'role', 'actif', 'agence'],
    'ACTEUR_INVALIDE'
  );

  const id = validerUuidV4Depenses_(
    valeur.id,
    'ACTEUR_INVALIDE'
  );
  const nom = validerTexteMetierDepenses_(
    valeur.nom,
    'ACTEUR_INVALIDE',
    200,
    false
  );
  const role = normaliserTexte_(valeur.role);

  if (
    valeur.actif !== true ||
    (role !== 'AGENT' && role !== 'ADMIN')
  ) {
    throw erreurDepenses_(
      'ACTEUR_NON_AUTORISE',
      'Profil non autorisé.'
    );
  }

  return {
    id: id,
    nom: nom,
    role: role,
    actif: true,
    agence: normaliserTexte_(valeur.agence)
  };
}

function exigerRoleDepenses_(acteur, role) {
  if (acteur.role !== role || acteur.actif !== true) {
    throw erreurDepenses_(
      'ROLE_INTERDIT',
      'Rôle non autorisé pour cette action.'
    );
  }
}

function agenceVersFeuilleDepenses_(agence) {
  const agenceNormalisee = normaliserTexte_(agence);
  const feuille =
    agenceNormalisee === 'COTONOU'
      ? 'COO'
      : agenceNormalisee;

  if (!CONFIG_DEPENSES.feuillesAgences.includes(feuille)) {
    throw erreurDepenses_(
      'AGENCE_INVALIDE',
      'Agence invalide.'
    );
  }

  return feuille;
}

function validerCategorieDepenses_(valeur) {
  return validerValeurConfigureeDepenses_(
    valeur,
    CONFIG_DEPENSES.categories,
    'CATEGORIE_INVALIDE'
  );
}

function validerValeurConfigureeDepenses_(
  valeur,
  valeursAutorisees,
  codeErreur
) {
  const normalisee = normaliserTexte_(valeur);

  for (
    let index = 0;
    index < valeursAutorisees.length;
    index++
  ) {
    if (
      normaliserTexte_(valeursAutorisees[index]) ===
      normalisee
    ) {
      return valeursAutorisees[index];
    }
  }

  throw erreurDepenses_(
    codeErreur,
    'Valeur non autorisée.'
  );
}

function exigerMontantDepenses_(valeur) {
  const montant = analyserMontantDepense_(valeur);

  if (montant === null) {
    throw erreurDepenses_(
      'MONTANT_INVALIDE',
      'Le montant doit être strictement positif.'
    );
  }

  return montant;
}

function validerTexteMetierDepenses_(
  valeur,
  codeErreur,
  longueurMaximale,
  facultatif
) {
  const texte =
    valeur === null || valeur === undefined
      ? ''
      : String(valeur)
        .normalize('NFC')
        .replace(/\u00A0/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

  if (!texte && !facultatif) {
    throw erreurDepenses_(
      codeErreur,
      'Ce champ est obligatoire.'
    );
  }

  if (
    texte.length > longueurMaximale ||
    /^[=+\-@]/.test(texte)
  ) {
    throw erreurDepenses_(
      codeErreur,
      'Valeur invalide.'
    );
  }

  return texte;
}

function validerUuidV4Depenses_(valeur, codeErreur) {
  const uuid = normaliserUuidDepenses_(valeur);

  if (!UUID_V4_DEPENSES_REGEX.test(uuid)) {
    throw erreurDepenses_(
      codeErreur,
      'Identifiant UUID v4 invalide.'
    );
  }

  return uuid;
}

function normaliserUuidDepenses_(valeur) {
  return String(valeur || '')
    .trim()
    .toLowerCase();
}

function validerProprietesObjet_(
  valeur,
  proprietesAutorisees,
  codeErreur
) {
  if (
    !valeur ||
    Object.prototype.toString.call(valeur) !==
      '[object Object]'
  ) {
    throw erreurDepenses_(
      codeErreur,
      'Objet invalide.'
    );
  }

  Object.keys(valeur).forEach(function (cle) {
    if (!proprietesAutorisees.includes(cle)) {
      throw erreurDepenses_(
        codeErreur,
        'Propriété non autorisée : ' + cle
      );
    }
  });
}

function lireCorpsJsonDepenses_(e) {
  if (
    !e ||
    !e.postData ||
    typeof e.postData.contents !== 'string'
  ) {
    throw erreurDepenses_(
      'REQUETE_INVALIDE',
      'Corps JSON absent.'
    );
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (erreur) {
    throw erreurDepenses_(
      'JSON_INVALIDE',
      'Le corps JSON est invalide.'
    );
  }
}

function verifierCleApiDepenses_(cleFournie) {
  const cleAttendue = PropertiesService
    .getScriptProperties()
    .getProperty(CONFIG_DEPENSES.proprieteCleApi);

  if (
    !cleAttendue ||
    typeof cleFournie !== 'string' ||
    cleFournie.length !== cleAttendue.length ||
    !comparaisonConstanteDepenses_(
      cleFournie,
      cleAttendue
    )
  ) {
    throw erreurDepenses_(
      'NON_AUTORISE',
      'Accès non autorisé.'
    );
  }
}

function comparaisonConstanteDepenses_(a, b) {
  let difference = 0;

  for (let index = 0; index < a.length; index++) {
    difference |=
      a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return difference === 0;
}

function exigerFeuilleDepenses_(classeur, nomFeuille) {
  const feuille = classeur.getSheetByName(nomFeuille);

  if (!feuille) {
    throw erreurDepenses_(
      'FEUILLE_ABSENTE',
      'Une feuille requise est absente.'
    );
  }

  return feuille;
}

function erreurDepenses_(code, message) {
  const erreur = new Error(message);
  erreur.code = code;
  return erreur;
}

function reponseJsonDepenses_(contenu) {
  return ContentService
    .createTextOutput(JSON.stringify(contenu))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Protège les identifiants, l'agence, l'identité et les colonnes techniques.
 */
function protegerColonnesTechniques_(feuille) {
  assurerNombreLignesPreparees_(feuille);
  const derniereLigne = feuille.getMaxRows();

  installerProtectionPlageDepenses_(
    feuille,
    'B2:B' + derniereLigne,
    'DEPENSES - Expense Request ID'
  );
  installerProtectionPlageDepenses_(
    feuille,
    'C2:C' + derniereLigne,
    'DEPENSES - Agence imposée'
  );
  installerProtectionPlageDepenses_(
    feuille,
    'J2:J' + derniereLigne,
    'DEPENSES - Identité Agent'
  );
  installerProtectionPlageDepenses_(
    feuille,
    'L2:U' + derniereLigne,
    'DEPENSES - Colonnes techniques'
  );
}

function installerProtectionPlageDepenses_(
  feuille,
  notation,
  description
) {
  const protections = feuille.getProtections(
    SpreadsheetApp.ProtectionType.RANGE
  );
  const existe = protections.some(function (protection) {
    return protection.getDescription() === description;
  });

  if (existe) {
    return;
  }

  const protection = feuille
    .getRange(notation)
    .protect()
    .setDescription(description)
    .setWarningOnly(false);

  limiterProtectionAuProprietaire_(protection);
}

function protegerFeuilleTechnique_(feuille) {
  const description =
    'DEPENSES - Feuille technique ' +
    feuille.getName();
  const protections = feuille.getProtections(
    SpreadsheetApp.ProtectionType.SHEET
  );
  const existe = protections.some(function (protection) {
    return protection.getDescription() === description;
  });

  if (existe) {
    return;
  }

  const protection = feuille
    .protect()
    .setDescription(description)
    .setWarningOnly(false);

  limiterProtectionAuProprietaire_(protection);
}

function limiterProtectionAuProprietaire_(protection) {
  const utilisateur = Session.getEffectiveUser();

  protection.addEditor(utilisateur);

  const autresEditeurs =
    protection.getEditors().filter(function (editeur) {
      return (
        editeur.getEmail() !== utilisateur.getEmail()
      );
    });

  if (autresEditeurs.length > 0) {
    protection.removeEditors(autresEditeurs);
  }

  if (protection.canDomainEdit()) {
    protection.setDomainEdit(false);
  }
}
