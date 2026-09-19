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

  feuillesAgences: ['COO', 'FIH', 'LSHI', 'KLZ'],

  feuilleParametres: 'PARAMETRES',
  feuilleStatistiques: 'STAT DEPENSES',

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
    'ENREGISTRÉE',
    'ANNULÉE'
  ],

  devises: [
    'FCFA',
    'USD',
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
    'Statut'
  ]
};

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

  if (e.range.getColumn() > CONFIG_DEPENSES.entetes.length) {
    return;
  }

  recalculerStatistiquesDepenses();
}

/**
 * Initialisation complète.
 */
function initialiserDepensesPublic() {
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

  creerOuPreparerFeuilleStatistiques_(classeur);

  recalculerStatistiquesDepenses();

  SpreadsheetApp.flush();

  SpreadsheetApp.getUi().alert(
    'Initialisation terminée',
    [
      'Les feuilles COO, FIH, LSHI et KLZ sont prêtes.',
      '',
      'La feuille STAT DEPENSES contient désormais :',
      '- les totaux journaliers par site ;',
      '- les totaux mensuels par site ;',
      '- les totaux des quatre sites ;',
      '- les résultats séparés par devise.'
    ].join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
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

  feuille
    .getRange(1, 1, 1, 4)
    .setValues([
      [
        'CATÉGORIES',
        'MODES DE PAIEMENT',
        'STATUTS',
        'DEVISES'
      ]
    ]);

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
    .getRange(2, 1, Math.max(feuille.getMaxRows() - 1, 1), 4)
    .clearContent();

  feuille
    .getRange(2, 1, valeurs.length, 4)
    .setValues(valeurs);

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

  feuille
    .getRange('A2:A')
    .setNumberFormat('dd/mm/yyyy hh:mm:ss');

  feuille
    .getRange('F2:F')
    .setNumberFormat('#,##0.00');

  feuille
    .getRange('B2:B')
    .setNumberFormat('@');

  feuille
    .getRange('I2:I')
    .setNumberFormat('@');

  feuille
    .getRange('L2:L')
    .setHorizontalAlignment('center');

  installerValidationsSurFeuille_(
    feuille,
    feuilleParametres,
    nomAgence
  );

  installerFiltre_(feuille, nombreColonnes);
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
  const verrou = LockService.getDocumentLock();

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
 * L Statut
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
    statut !== '' &&
    statut !== 'ENREGISTRÉE' &&
    statut !== 'ENREGISTREE'
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
  feuille.clearContents();
  feuille.clearFormats();

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

  SpreadsheetApp.getUi().alert(
    'Les listes déroulantes ont été réinstallées.'
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
  const derniereLigneValidation = 5000;
  const nombreLignes =
    derniereLigneValidation - 1;

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

  const validationAgence =
    SpreadsheetApp.newDataValidation()
      .requireValueInList([nomAgence], true)
      .setAllowInvalid(false)
      .setHelpText(
        'Cette feuille appartient à ' +
        nomAgence +
        '.'
      )
      .build();

  feuille
    .getRange(2, 3, nombreLignes, 1)
    .setDataValidation(validationAgence);

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
  

