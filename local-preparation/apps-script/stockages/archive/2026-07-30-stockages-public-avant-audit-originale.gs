'use strict';

/**
 * STOCKAGES PUBLIC — Eben Ezer Business
 * Version 1.0.0
 *
 * Cette version :
 * - initialise le classeur STOCKAGES PUBLIC ;
 * - gère une date d’activation commune ;
 * - valide et protège les soldes initiaux ;
 * - active ou désactive le système ;
 * - recalcule le stock journalier ;
 * - ne se connecte pas encore à MANIFESTE PUBLIC ;
 * - ne crée aucun déclencheur installable.
 */

const STOCKAGES_CONFIG = Object.freeze({
  version: '1.0.0',
  timezone: 'Africa/Porto-Novo',

  feuilles: Object.freeze({
    parametres: 'PARAMETRES',
    soldeInitial: 'SOLDE INITIAL',
    historique: 'HISTORIQUE STATUTS',
    mouvements: 'MOUVEMENTS STOCK',
    stockJournalier: 'STOCK JOURNALIER',
    audit: 'AUDIT'
  }),

  agences: Object.freeze(['COO', 'FIH', 'LSHI', 'KLZ']),

  lignesAgences: Object.freeze({
    COO: 2,
    FIH: 3,
    LSHI: 4,
    KLZ: 5
  }),

  statutsColis: Object.freeze([
    'ENREGISTRÉ',
    'EN VOL',
    'EN TRANSIT',
    'ARRIVÉ',
    'LIVRÉ'
  ]),

  typesMouvements: Object.freeze([
    'ENTREE_COO',
    'SORTIE_COO',
    'ENTREE_DESTINATION',
    'SORTIE_DESTINATION',
    'AJUSTEMENT_ADMIN'
  ]),

  statutsSoldeInitial: Object.freeze([
    'BROUILLON',
    'VALIDÉ'
  ]),

  entetes: Object.freeze({
    parametres: Object.freeze([
      'Clé',
      'Valeur',
      'Description',
      'Modifié le',
      'Modifié par'
    ]),

    soldeInitial: Object.freeze([
      'Date et heure d’activation',
      'Agence',
      'Nombre initial de colis',
      'Kilogrammes initiaux',
      'Observation',
      'Validé par',
      'Statut',
      'Initial Stock ID',
      'Date de validation'
    ]),

    historique: Object.freeze([
      'Date et heure détectée',
      'Feuille source',
      'Code colis',
      'Destination finale',
      'Poids',
      'Ancien statut',
      'Nouveau statut',
      'Type de mouvement',
      'Status Event ID',
      'Date d’enregistrement source',
      'Traité',
      'Observation'
    ]),

    mouvements: Object.freeze([
      'Date et heure',
      'Date du mouvement',
      'Agence',
      'Code colis',
      'Destination',
      'Type de mouvement',
      'Variation colis',
      'Variation kg',
      'Statut déclencheur',
      'Source',
      'Movement ID',
      'Observation',
      'Créé par',
      'Annulé',
      'Référence événement'
    ]),

    stockJournalier: Object.freeze([
      'Date',
      'Agence',
      'Stock initial colis',
      'Stock initial kg',
      'Entrées colis',
      'Entrées kg',
      'Sorties colis',
      'Sorties kg',
      'Ajustements colis',
      'Ajustements kg',
      'Stock final colis',
      'Stock final kg',
      'Calculé le',
      'Version calcul',
      'Statut'
    ]),

    audit: Object.freeze([
      'Date et heure',
      'Utilisateur',
      'Action',
      'Agence',
      'Référence',
      'Ancienne valeur',
      'Nouvelle valeur',
      'Résultat',
      'Détails',
      'Audit ID'
    ])
  })
});

/**
 * Menu du classeur.
 *
 * onOpen est un déclencheur simple réservé de Google Sheets.
 * Aucun déclencheur installable ou planifié n’est créé.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('STOCKAGES EEB')
    .addItem(
      'Initialiser le classeur',
      'initialiserStockagesPublic'
    )
    .addItem(
      'Vérifier la configuration',
      'verifierConfigurationStockages'
    )
    .addItem(
      'Définir la date d’activation',
      'definirDateActivationStockages'
    )
    .addItem(
      'Valider un solde initial',
      'validerSoldeInitial'
    )
    .addItem(
      'Activer le système',
      'activerSystemeStockages'
    )
    .addItem(
      'Désactiver le système',
      'desactiverSystemeStockages'
    )
    .addItem(
      'Recalculer le stock journalier',
      'recalculerStockJournalier'
    )
    .addItem(
  'Afficher le statut du système',
  'afficherStatutSysteme'
)
.addItem(
  'Auditer MANIFESTE PUBLIC',
  'auditerManifestePublic'
)
.addToUi();
}

  function auditerManifestePublic() {
  const verrou = LockService.getScriptLock();
  let classeurStockages = null;
  let identifiantManifeste = '';

  try {
    verrou.waitLock(30000);

    classeurStockages = SpreadsheetApp.getActiveSpreadsheet();

    identifiantManifeste = String(
      lireParametreStockagesBrut_(
        classeurStockages,
        'MANIFEST_SPREADSHEET_ID'
      ) || ''
    ).trim();

    if (!identifiantManifeste) {
      throw new Error(
        'Le paramètre MANIFEST_SPREADSHEET_ID est vide.'
      );
    }

    const classeurManifeste = SpreadsheetApp.openById(
      identifiantManifeste
    );

    const feuillesAttendues = ['FIH', 'LSHI', 'KLZ'];
    const feuillesAnalysees = [];
    const feuillesConformes = [];
    const anomaliesDetectees = [];

    feuillesAttendues.forEach(function (nomFeuille) {
      try {
        const feuille = classeurManifeste.getSheetByName(nomFeuille);

        if (!feuille) {
          const detailErreur = {
            feuille: nomFeuille,
            erreur: 'Feuille introuvable dans MANIFESTE PUBLIC.'
          };

          ajouterAuditStockages_(classeurStockages, {
            action: 'AUDIT_MANIFESTE_PUBLIC',
            agence: nomFeuille,
            reference: identifiantManifeste,
            ancienneValeur: '',
            nouvelleValeur: '',
            resultat: 'ERREUR',
            details: JSON.stringify(detailErreur)
          });

          anomaliesDetectees.push(
            nomFeuille + ' : feuille introuvable'
          );
          return;
        }

        const resultat = analyserFeuilleManifesteStockages_(
          feuille
        );

        feuillesAnalysees.push(nomFeuille);

        const colonnesObligatoiresPresentes =
          resultat.colonneDate !== null &&
          resultat.colonneCode !== null &&
          resultat.colonnePoids !== null &&
          resultat.colonneStatut !== null;

        let etatAudit = 'SUCCESS';

        if (!colonnesObligatoiresPresentes) {
          etatAudit = 'ERREUR';
          anomaliesDetectees.push(
            nomFeuille +
              ' : une ou plusieurs colonnes obligatoires sont absentes'
          );
        } else if (
          resultat.codesVides > 0 ||
          resultat.codesDupliques > 0 ||
          resultat.poidsInvalides > 0 ||
          resultat.statutsVides > 0
        ) {
          etatAudit = 'AVERTISSEMENT';
          anomaliesDetectees.push(
            nomFeuille +
              ' : codes vides=' + resultat.codesVides +
              ', doublons=' + resultat.codesDupliques +
              ', poids invalides=' + resultat.poidsInvalides +
              ', statuts vides=' + resultat.statutsVides
          );
        } else {
          feuillesConformes.push(nomFeuille);
        }

        ajouterAuditStockages_(classeurStockages, {
          action: 'AUDIT_MANIFESTE_PUBLIC',
          agence: nomFeuille,
          reference: identifiantManifeste,
          ancienneValeur: '',
          nouvelleValeur: '',
          resultat: etatAudit,
          details: JSON.stringify(resultat)
        });
      } catch (erreurFeuille) {
        const message = messageErreurStockages_(
          erreurFeuille
        );

        ajouterAuditStockages_(classeurStockages, {
          action: 'AUDIT_MANIFESTE_PUBLIC',
          agence: nomFeuille,
          reference: identifiantManifeste,
          ancienneValeur: '',
          nouvelleValeur: '',
          resultat: 'ERREUR',
          details: JSON.stringify({
            feuille: nomFeuille,
            erreur: message
          })
        });

        anomaliesDetectees.push(
          nomFeuille + ' : ' + message
        );
      }
    });

    SpreadsheetApp.getUi().alert(
      'Audit MANIFESTE PUBLIC terminé',
      [
        'Feuilles analysées : ' +
          (feuillesAnalysees.length
            ? feuillesAnalysees.join(', ')
            : 'aucune'),
        'Feuilles conformes : ' +
          (feuillesConformes.length
            ? feuillesConformes.join(', ')
            : 'aucune'),
        'Anomalies détectées : ' +
          anomaliesDetectees.length,
        '',
        'Aucune donnée du manifeste n’a été modifiée.'
      ].join('\n'),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (erreur) {
    const message = messageErreurStockages_(erreur);

    if (classeurStockages) {
      try {
        ajouterAuditStockages_(classeurStockages, {
          action: 'AUDIT_MANIFESTE_PUBLIC',
          agence: '',
          reference: identifiantManifeste || '',
          ancienneValeur: '',
          nouvelleValeur: '',
          resultat: 'ERREUR',
          details: JSON.stringify({
            erreur: message
          })
        });
      } catch (erreurAudit) {
        // L’erreur principale reste prioritaire.
      }
    }

    SpreadsheetApp.getUi().alert(
      'Audit MANIFESTE PUBLIC impossible',
      message +
        '\n\nAucune donnée du manifeste n’a été modifiée.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } finally {
    if (verrou.hasLock()) {
      verrou.releaseLock();
    }
  }
}

function analyserFeuilleManifesteStockages_(feuille) {
  const nombreLignes = feuille.getLastRow();
  const nombreColonnes = feuille.getLastColumn();

  const valeurs = nombreLignes > 0 && nombreColonnes > 0
    ? feuille
        .getRange(1, 1, nombreLignes, nombreColonnes)
        .getValues()
    : [];

  const valeursAffichees = nombreLignes > 0 && nombreColonnes > 0
    ? feuille
        .getRange(1, 1, nombreLignes, nombreColonnes)
        .getDisplayValues()
    : [];

  const entetes = valeursAffichees.length
    ? valeursAffichees[0].map(function (valeur) {
        return String(valeur || '').trim();
      })
    : [];

  const colonneDate = trouverColonneManifesteStockages_(
    entetes,
    ['DATE', 'DATE ET HEURE']
  );
  const colonneCode = trouverColonneManifesteStockages_(
    entetes,
    ['CODE COLIS', 'CODE DU COLIS', 'CODECOLIS']
  );
  const colonnePoids = trouverColonneManifesteStockages_(
    entetes,
    [
      'POIDS',
      'POIDS KG',
      'POIDS KGS',
      'POIDS (KG)',
      'POIDS (KGS)'
    ]
  );
  const colonneStatut = trouverColonneManifesteStockages_(
    entetes,
    ['STATUT', 'STATUS']
  );

  const premieresLignesNonVides = [];
  const statuts = {};
  const codesRencontres = {};
  const formatsPoids = {};

  let codesVides = 0;
  let codesDupliques = 0;
  let poidsInvalides = 0;
  let statutsVides = 0;

  for (let indexLigne = 1; indexLigne < valeurs.length; indexLigne += 1) {
    const ligneBrute = valeurs[indexLigne];
    const ligneAffichee = valeursAffichees[indexLigne];

    const ligneNonVide = ligneAffichee.some(function (valeur) {
      return String(valeur || '').trim() !== '';
    });

    if (!ligneNonVide) {
      continue;
    }

    if (premieresLignesNonVides.length < 5) {
      premieresLignesNonVides.push({
        ligne: indexLigne + 1,
        valeurs: ligneAffichee.map(function (valeur) {
          return String(valeur || '').trim();
        })
      });
    }

    if (colonneCode !== null) {
      const code = String(
        ligneAffichee[colonneCode - 1] || ''
      ).trim();

      if (!code) {
        codesVides += 1;
      } else {
        const codeNormalise = code.toUpperCase();

        if (codesRencontres[codeNormalise]) {
          codesDupliques += 1;
        } else {
          codesRencontres[codeNormalise] = true;
        }
      }
    }

    if (colonnePoids !== null) {
      const valeurBrute = ligneBrute[colonnePoids - 1];
      const valeurAffichee = String(
        ligneAffichee[colonnePoids - 1] || ''
      ).trim();

      const analysePoids = analyserFormatPoidsManifesteStockages_(
        valeurBrute,
        valeurAffichee
      );

      formatsPoids[analysePoids.format] =
        (formatsPoids[analysePoids.format] || 0) + 1;

      if (!analysePoids.interpretable) {
        poidsInvalides += 1;
      }
    }

    if (colonneStatut !== null) {
      const statut = String(
        ligneAffichee[colonneStatut - 1] || ''
      ).trim();

      if (!statut) {
        statutsVides += 1;
      } else {
        statuts[statut] = true;
      }
    }
  }

  return {
    feuille: feuille.getName(),
    nombreLignes: nombreLignes,
    nombreColonnes: nombreColonnes,
    entetes: entetes,
    colonneDate: colonneDate,
    colonneCode: colonneCode,
    colonnePoids: colonnePoids,
    colonneStatut: colonneStatut,
    premieresLignesNonVides: premieresLignesNonVides,
    statutsTrouves: Object.keys(statuts).sort(),
    formatsPoidsTrouves: formatsPoids,
    codesVides: codesVides,
    codesDupliques: codesDupliques,
    poidsInvalides: poidsInvalides,
    statutsVides: statutsVides
  };
}

function trouverColonneManifesteStockages_(entetes, nomsAcceptes) {
  const nomsNormalises = nomsAcceptes.map(function (nom) {
    return normaliserEnteteManifesteStockages_(nom);
  });

  for (let index = 0; index < entetes.length; index += 1) {
    const enteteNormalisee =
      normaliserEnteteManifesteStockages_(entetes[index]);

    if (nomsNormalises.indexOf(enteteNormalisee) !== -1) {
      return index + 1;
    }
  }

  return null;
}

function normaliserEnteteManifesteStockages_(valeur) {
  return String(valeur || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function analyserFormatPoidsManifesteStockages_(
  valeurBrute,
  valeurAffichee
) {
  if (
    typeof valeurBrute === 'number' &&
    Number.isFinite(valeurBrute)
  ) {
    return {
      interpretable: true,
      format: Number.isInteger(valeurBrute)
        ? 'NOMBRE_GOOGLE_SHEETS_ENTIER'
        : 'NOMBRE_GOOGLE_SHEETS_DECIMAL'
    };
  }

  const texte = String(valeurAffichee || '').trim();

  if (!texte) {
    return {
      interpretable: false,
      format: 'VIDE'
    };
  }

  const correspondance = texte.match(
    /^([+-]?\d+(?:[.,]\d+)?)\s*(kg|kgs)?$/i
  );

  if (!correspondance) {
    return {
      interpretable: false,
      format: 'NON_INTERPRETABLE'
    };
  }

  const nombreTexte = correspondance[1];
  const suffixe = correspondance[2]
    ? correspondance[2].toUpperCase()
    : '';

  let formatNombre = 'ENTIER_TEXTE';

  if (nombreTexte.indexOf(',') !== -1) {
    formatNombre = 'DECIMAL_VIRGULE';
  } else if (nombreTexte.indexOf('.') !== -1) {
    formatNombre = 'DECIMAL_POINT';
  }

  return {
    interpretable: true,
    format: suffixe
      ? formatNombre + '_AVEC_' + suffixe
      : formatNombre
  };
}
/**
 * Point d’entrée initial.
 * Cette fonction est idempotente.
 */
function initialiserStockagesPublic() {
  const verrou = LockService.getScriptLock();

  try {
    verrou.waitLock(30000);

    const classeur = SpreadsheetApp.getActiveSpreadsheet();

    classeur.setSpreadsheetTimeZone(
      STOCKAGES_CONFIG.timezone
    );

    creerStructuresStockages_(classeur);
    initialiserParametresStockages_(classeur);
    initialiserSoldesAgences_(classeur);
    installerValidationsStockages_(classeur);
    mettreEnFormeStockages_(classeur);

    SpreadsheetApp.flush();

    ajouterAuditStockages_(classeur, {
      action: 'INITIALISATION',
      agence: '',
      reference: STOCKAGES_CONFIG.version,
      ancienneValeur: '',
      nouvelleValeur: 'STRUCTURE_VERIFIEE',
      resultat: 'SUCCESS',
      details:
        'Initialisation idempotente du classeur STOCKAGES PUBLIC.'
    });

    SpreadsheetApp.getUi().alert(
      'Initialisation terminée',
      'Les feuilles et paramètres de STOCKAGES PUBLIC sont prêts.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (erreur) {
    journaliserErreurStockages_(
      'INITIALISATION',
      erreur
    );

    SpreadsheetApp.getUi().alert(
      'Échec de l’initialisation',
      messageErreurStockages_(erreur),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    throw erreur;
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Vérifie la configuration du classeur.
 */
function verifierConfigurationStockages() {
  try {
    const classeur = SpreadsheetApp.getActiveSpreadsheet();
    const erreurs = verifierConfigurationInterne_(classeur);
    const interfaceUtilisateur = SpreadsheetApp.getUi();

    if (erreurs.length > 0) {
      interfaceUtilisateur.alert(
        'Configuration incomplète',
        erreurs.join('\n'),
        interfaceUtilisateur.ButtonSet.OK
      );
      return;
    }

    interfaceUtilisateur.alert(
      'Configuration valide',
      'Les feuilles, en-têtes, paramètres et agences sont conformes.',
      interfaceUtilisateur.ButtonSet.OK
    );
  } catch (erreur) {
    journaliserErreurStockages_(
      'VERIFICATION_CONFIGURATION',
      erreur
    );

    throw erreur;
  }
}

/**
 * Demande une date et une heure uniques, puis l’applique aux
 * quatre lignes officielles de SOLDE INITIAL.
 */
function definirDateActivationStockages() {
  const verrou = LockService.getScriptLock();

  try {
    verrou.waitLock(30000);

    const classeur = SpreadsheetApp.getActiveSpreadsheet();
    exigerConfigurationValide_(classeur);

    const statutSysteme = lireParametreStockages_(
      classeur,
      'SYSTEM_STATUS'
    );

    if (statutSysteme === 'ACTIF') {
      throw new Error(
        'La date d’activation ne peut pas être modifiée lorsque le système est ACTIF.'
      );
    }

    const soldes = lireSoldesInitiaux_(classeur);
    const soldeDejaValide = soldes.some(function(solde) {
      return solde.statut === 'VALIDÉ';
    });

    if (soldeDejaValide) {
      throw new Error(
        'La date d’activation ne peut plus être modifiée car un solde initial est déjà VALIDÉ.'
      );
    }

    const interfaceUtilisateur = SpreadsheetApp.getUi();
    const reponse = interfaceUtilisateur.prompt(
      'Définir la date d’activation',
      [
        'Saisissez une date et une heure uniques.',
        'Format obligatoire : JJ/MM/AAAA HH:mm',
        'Exemple : 31/07/2026 08:00'
      ].join('\n'),
      interfaceUtilisateur.ButtonSet.OK_CANCEL
    );

    if (
      reponse.getSelectedButton() !==
      interfaceUtilisateur.Button.OK
    ) {
      return;
    }

    const texteDate = reponse.getResponseText().trim();
    const dateActivation =
      analyserDateHeureSaisieStockages_(texteDate);

    if (!dateActivation) {
      throw new Error(
        'Date invalide. Utilisez exactement le format JJ/MM/AAAA HH:mm.'
      );
    }

    const confirmation = interfaceUtilisateur.alert(
      'Confirmer la date d’activation',
      [
        'Date commune :',
        formaterDateHeureStockages_(dateActivation),
        '',
        'Cette date sera appliquée à COO, FIH, LSHI et KLZ.'
      ].join('\n'),
      interfaceUtilisateur.ButtonSet.YES_NO
    );

    if (confirmation !== interfaceUtilisateur.Button.YES) {
      return;
    }

    const feuille = exigerFeuilleStockages_(
      classeur,
      STOCKAGES_CONFIG.feuilles.soldeInitial
    );

    const anciennesDates = STOCKAGES_CONFIG.agences.map(
      function(agence) {
        const ligne = STOCKAGES_CONFIG.lignesAgences[agence];
        return feuille.getRange(ligne, 1).getValue();
      }
    );

    const valeursDates = STOCKAGES_CONFIG.agences.map(
      function() {
        return [new Date(dateActivation.getTime())];
      }
    );

    feuille
      .getRange(2, 1, 4, 1)
      .setValues(valeursDates)
      .setNumberFormat('dd/MM/yyyy HH:mm');

    ecrireParametreStockages_(
      classeur,
      'DATE_ACTIVATION',
      dateActivation,
      'Date et heure commune d’activation du stock.'
    );

    SpreadsheetApp.flush();

    ajouterAuditStockages_(classeur, {
      action: 'DEFINITION_DATE_ACTIVATION',
      agence: '',
      reference: '',
      ancienneValeur: anciennesDates
        .map(function(date) {
          return estDateValideStockages_(date)
            ? formaterDateHeureStockages_(date)
            : '';
        })
        .join(' | '),
      nouvelleValeur:
        formaterDateHeureStockages_(dateActivation),
      resultat: 'SUCCESS',
      details:
        'Date commune appliquée aux quatre agences.'
    });

    interfaceUtilisateur.alert(
      'Date enregistrée',
      'La date d’activation commune a été appliquée aux quatre agences.',
      interfaceUtilisateur.ButtonSet.OK
    );
  } catch (erreur) {
    journaliserErreurStockages_(
      'DEFINITION_DATE_ACTIVATION',
      erreur
    );

    SpreadsheetApp.getUi().alert(
      'Date non enregistrée',
      messageErreurStockages_(erreur),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    throw erreur;
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Valide la ligne sélectionnée dans SOLDE INITIAL.
 */
function validerSoldeInitial() {
  const verrou = LockService.getScriptLock();

  try {
    verrou.waitLock(30000);

    const classeur = SpreadsheetApp.getActiveSpreadsheet();
    exigerConfigurationValide_(classeur);

    const statutSysteme = lireParametreStockages_(
      classeur,
      'SYSTEM_STATUS'
    );

    if (statutSysteme === 'ACTIF') {
      throw new Error(
        'Un solde initial ne peut pas être validé lorsque le système est ACTIF.'
      );
    }

    const feuille = classeur.getActiveSheet();
    const plageActive = feuille.getActiveRange();

    if (
      feuille.getName() !==
        STOCKAGES_CONFIG.feuilles.soldeInitial ||
      !plageActive ||
      plageActive.getRow() < 2 ||
      plageActive.getRow() > 5
    ) {
      throw new Error(
        'Sélectionnez une cellule de la ligne officielle COO, FIH, LSHI ou KLZ dans SOLDE INITIAL.'
      );
    }

    const ligne = plageActive.getRow();
    const agenceOfficielle =
      agenceOfficiellePourLigne_(ligne);

    if (!agenceOfficielle) {
      throw new Error(
        'La ligne sélectionnée n’est pas une ligne officielle.'
      );
    }

    const valeurs = feuille
      .getRange(ligne, 1, 1, 9)
      .getValues()[0];

    const dateActivation = valeurs[0];
    const agence = normaliserTexteStockages_(valeurs[1]);
    const nombreColis = analyserEntierPositifOuZero_(
      valeurs[2]
    );
    const kilogrammes = analyserNombrePositifOuZero_(
      valeurs[3]
    );
    const statut = normaliserTexteStockages_(valeurs[6]);
    const dateCommune = lireParametreStockagesBrut_(
      classeur,
      'DATE_ACTIVATION'
    );

    if (agence !== agenceOfficielle) {
      throw new Error(
        'L’agence de la ligne ne correspond pas à la ligne officielle : ' +
          agenceOfficielle
      );
    }

    if (!STOCKAGES_CONFIG.agences.includes(agence)) {
      throw new Error('Agence non autorisée.');
    }

    if (!estDateValideStockages_(dateCommune)) {
      throw new Error(
        'Définissez d’abord la date d’activation commune depuis le menu STOCKAGES EEB.'
      );
    }

    if (!estDateValideStockages_(dateActivation)) {
      throw new Error(
        'La ligne ne possède pas de date d’activation valide.'
      );
    }

    if (
      dateActivation.getTime() !==
      dateCommune.getTime()
    ) {
      throw new Error(
        'La date de la ligne ne correspond pas exactement à la date d’activation commune.'
      );
    }

    if (nombreColis === null) {
      throw new Error(
        'Le nombre initial de colis doit être un entier supérieur ou égal à zéro.'
      );
    }

    if (kilogrammes === null) {
      throw new Error(
        'Les kilogrammes initiaux doivent être un nombre supérieur ou égal à zéro.'
      );
    }

    if (statut === 'VALIDÉ') {
      throw new Error(
        'Ce solde initial est déjà VALIDÉ et ne peut plus être modifié.'
      );
    }

    if (statut !== 'BROUILLON') {
      throw new Error(
        'Le statut du solde initial doit être BROUILLON.'
      );
    }

    const lignesSoldes = lireSoldesInitiaux_(classeur);
    const autreSoldeValide = lignesSoldes.some(
      function(item) {
        return (
          item.ligne !== ligne &&
          item.agence === agence &&
          item.statut === 'VALIDÉ'
        );
      }
    );

    if (autreSoldeValide) {
      throw new Error(
        'Un autre solde initial VALIDÉ existe déjà pour cette agence.'
      );
    }

    const interfaceUtilisateur = SpreadsheetApp.getUi();
    const confirmation = interfaceUtilisateur.alert(
      'Valider le solde initial',
      [
        'Agence : ' + agence,
        'Date : ' +
          formaterDateHeureStockages_(dateActivation),
        'Nombre de colis : ' + nombreColis,
        'Kilogrammes : ' + kilogrammes,
        '',
        'Cette validation rendra la ligne immuable.'
      ].join('\n'),
      interfaceUtilisateur.ButtonSet.YES_NO
    );

    if (confirmation !== interfaceUtilisateur.Button.YES) {
      return;
    }

    const maintenant = new Date();
    const utilisateur = utilisateurCourantStockages_();
    const initialStockId =
      Utilities.getUuid().toLowerCase();

    feuille
      .getRange(ligne, 1, 1, 9)
      .setValues([[
        dateActivation,
        agence,
        nombreColis,
        kilogrammes,
        valeurs[4] || '',
        utilisateur,
        'VALIDÉ',
        initialStockId,
        maintenant
      ]]);

    protegerLigneSoldeValide_(
      feuille,
      ligne,
      initialStockId
    );

    SpreadsheetApp.flush();

    ajouterAuditStockages_(classeur, {
      action: 'VALIDATION_SOLDE_INITIAL',
      agence: agence,
      reference: initialStockId,
      ancienneValeur: 'BROUILLON',
      nouvelleValeur: JSON.stringify({
        colis: nombreColis,
        kilogrammes: kilogrammes,
        statut: 'VALIDÉ'
      }),
      resultat: 'SUCCESS',
      details:
        'Validation définitive du solde initial.'
    });

    interfaceUtilisateur.alert(
      'Solde initial validé',
      'Le solde initial de ' + agence + ' est maintenant protégé.',
      interfaceUtilisateur.ButtonSet.OK
    );
  } catch (erreur) {
    journaliserErreurStockages_(
      'VALIDATION_SOLDE_INITIAL',
      erreur
    );

    SpreadsheetApp.getUi().alert(
      'Validation impossible',
      messageErreurStockages_(erreur),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    throw erreur;
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Active le système après validation des quatre soldes initiaux.
 */
function activerSystemeStockages() {
  const verrou = LockService.getScriptLock();

  try {
    verrou.waitLock(30000);

    const classeur = SpreadsheetApp.getActiveSpreadsheet();
    exigerConfigurationValide_(classeur);

    const statutActuel = lireParametreStockages_(
      classeur,
      'SYSTEM_STATUS'
    );

    if (statutActuel === 'ACTIF') {
      SpreadsheetApp.getUi().alert(
        'Le système est déjà ACTIF.'
      );
      return;
    }

    const dateCommune = lireParametreStockagesBrut_(
      classeur,
      'DATE_ACTIVATION'
    );

    if (!estDateValideStockages_(dateCommune)) {
      throw new Error(
        'La date d’activation commune n’est pas définie.'
      );
    }

    const soldes = lireSoldesInitiauxValides_(classeur);

    if (soldes.length !== STOCKAGES_CONFIG.agences.length) {
      throw new Error(
        'Les quatre agences doivent posséder un solde initial VALIDÉ.'
      );
    }

    STOCKAGES_CONFIG.agences.forEach(function(agence) {
      const correspondances = soldes.filter(function(item) {
        return item.agence === agence;
      });

      if (correspondances.length !== 1) {
        throw new Error(
          'Chaque agence doit posséder exactement un solde initial VALIDÉ : ' +
            agence
        );
      }

      const solde = correspondances[0];

      if (
        solde.nombreColis === null ||
        solde.kilogrammes === null ||
        !estDateValideStockages_(solde.dateActivation)
      ) {
        throw new Error(
          'Solde initial invalide pour ' + agence + '.'
        );
      }

      if (
        solde.dateActivation.getTime() !==
        dateCommune.getTime()
      ) {
        throw new Error(
          'La date du solde initial ne correspond pas à la date commune pour ' +
            agence
        );
      }
    });

    const interfaceUtilisateur = SpreadsheetApp.getUi();
    const confirmation = interfaceUtilisateur.alert(
      'Activer STOCKAGES PUBLIC',
      [
        'Les quatre soldes initiaux sont validés.',
        'Date d’activation : ' +
          formaterDateHeureStockages_(dateCommune),
        '',
        'Confirmer l’activation du système ?'
      ].join('\n'),
      interfaceUtilisateur.ButtonSet.YES_NO
    );

    if (confirmation !== interfaceUtilisateur.Button.YES) {
      return;
    }

    ecrireParametreStockages_(
      classeur,
      'SYSTEM_STATUS',
      'ACTIF',
      'Statut du système de stockage.'
    );

    protegerDonneesSensiblesStockages_(classeur);
    SpreadsheetApp.flush();

    ajouterAuditStockages_(classeur, {
      action: 'ACTIVATION',
      agence: '',
      reference: '',
      ancienneValeur: statutActuel,
      nouvelleValeur: 'ACTIF',
      resultat: 'SUCCESS',
      details:
        'Activation avec date commune ' +
        formaterDateHeureStockages_(dateCommune)
    });

    interfaceUtilisateur.alert(
      'Système activé',
      'STOCKAGES PUBLIC est maintenant ACTIF.',
      interfaceUtilisateur.ButtonSet.OK
    );
  } catch (erreur) {
    journaliserErreurStockages_('ACTIVATION', erreur);

    SpreadsheetApp.getUi().alert(
      'Activation impossible',
      messageErreurStockages_(erreur),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    throw erreur;
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Désactive le système sans supprimer les données.
 */
function desactiverSystemeStockages() {
  const verrou = LockService.getScriptLock();

  try {
    verrou.waitLock(30000);

    const classeur = SpreadsheetApp.getActiveSpreadsheet();
    exigerConfigurationValide_(classeur);

    const statutActuel = lireParametreStockages_(
      classeur,
      'SYSTEM_STATUS'
    );

    if (statutActuel !== 'ACTIF') {
      SpreadsheetApp.getUi().alert(
        'Le système n’est pas actuellement ACTIF.'
      );
      return;
    }

    const interfaceUtilisateur = SpreadsheetApp.getUi();
    const confirmation = interfaceUtilisateur.alert(
      'Désactiver le système',
      'Les données seront conservées. Confirmer la désactivation ?',
      interfaceUtilisateur.ButtonSet.YES_NO
    );

    if (confirmation !== interfaceUtilisateur.Button.YES) {
      return;
    }

    ecrireParametreStockages_(
      classeur,
      'SYSTEM_STATUS',
      'INACTIF',
      'Statut du système de stockage.'
    );

    SpreadsheetApp.flush();

    ajouterAuditStockages_(classeur, {
      action: 'DESACTIVATION',
      agence: '',
      reference: '',
      ancienneValeur: 'ACTIF',
      nouvelleValeur: 'INACTIF',
      resultat: 'SUCCESS',
      details:
        'Désactivation manuelle sans suppression de données.'
    });

    interfaceUtilisateur.alert(
      'Système désactivé',
      'Les données existantes ont été conservées.',
      interfaceUtilisateur.ButtonSet.OK
    );
  } catch (erreur) {
    journaliserErreurStockages_('DESACTIVATION', erreur);
    throw erreur;
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Recalcule le stock journalier à partir des soldes initiaux
 * et des mouvements déjà présents.
 *
 * Cette fonction ne lit pas encore MANIFESTE PUBLIC.
 */
function recalculerStockJournalier() {
  const verrou = LockService.getScriptLock();

  try {
    verrou.waitLock(30000);

    const classeur = SpreadsheetApp.getActiveSpreadsheet();
    exigerConfigurationValide_(classeur);

    const statutSysteme = lireParametreStockages_(
      classeur,
      'SYSTEM_STATUS'
    );

    if (statutSysteme !== 'ACTIF') {
      throw new Error(
        'Le système doit être ACTIF avant le recalcul.'
      );
    }

    const soldes = lireSoldesInitiauxValides_(classeur);

    if (soldes.length !== 4) {
      throw new Error(
        'Les quatre soldes initiaux VALIDÉS sont requis.'
      );
    }

    const mouvements = lireMouvementsStock_(classeur);
    const calculs = construireStockJournalier_(
      soldes,
      mouvements
    );

    ecrireStockJournalierIdempotent_(classeur, calculs);

    const lignesNegatives = calculs.filter(function(calcul) {
      return calcul.valeurs[14] ===
        'ALERTE_STOCK_NEGATIF';
    });

    lignesNegatives.forEach(function(calcul) {
      ajouterAuditStockNegatifSiAbsent_(
        classeur,
        calcul
      );
    });

    SpreadsheetApp.flush();

    ajouterAuditStockages_(classeur, {
      action: 'RECALCUL_STOCK_JOURNALIER',
      agence: '',
      reference: STOCKAGES_CONFIG.version,
      ancienneValeur: '',
      nouvelleValeur:
        calculs.length + ' lignes calculées',
      resultat:
        lignesNegatives.length > 0
          ? 'AVERTISSEMENT'
          : 'SUCCESS',
      details:
        lignesNegatives.length +
        ' ligne(s) avec stock négatif.'
    });

    const messageFinal = [
      calculs.length +
        ' lignes journalières ont été vérifiées.'
    ];

    if (lignesNegatives.length > 0) {
      messageFinal.push(
        '',
        'ATTENTION : ' +
          lignesNegatives.length +
          ' ligne(s) présentent un stock négatif.',
        'Les résultats ont été conservés pour examen.',
        'Consultez STOCK JOURNALIER et AUDIT.'
      );
    } else {
      messageFinal.push(
        '',
        'Aucun stock négatif détecté.'
      );
    }

    SpreadsheetApp.getUi().alert(
      'Recalcul terminé',
      messageFinal.join('\n'),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (erreur) {
    journaliserErreurStockages_(
      'RECALCUL_STOCK_JOURNALIER',
      erreur
    );

    SpreadsheetApp.getUi().alert(
      'Recalcul impossible',
      messageErreurStockages_(erreur),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    throw erreur;
  } finally {
    verrou.releaseLock();
  }
}

/**
 * Affiche l’état courant sans normaliser l’identifiant MANIFESTE.
 */
function afficherStatutSysteme() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();

  const statut = lireParametreStockages_(
    classeur,
    'SYSTEM_STATUS'
  );

  const dateActivation = lireParametreStockagesBrut_(
    classeur,
    'DATE_ACTIVATION'
  );

  const identifiantManifesteBrut =
    lireParametreStockagesBrut_(
      classeur,
      'MANIFEST_SPREADSHEET_ID'
    );

  const identifiantManifeste = String(
    identifiantManifesteBrut || ''
  ).trim();

  SpreadsheetApp.getUi().alert(
    'Statut de STOCKAGES PUBLIC',
    [
      'Statut : ' + (statut || 'NON CONFIGURÉ'),
      'Date d’activation : ' +
        (estDateValideStockages_(dateActivation)
          ? formaterDateHeureStockages_(dateActivation)
          : 'Non définie'),
      'MANIFESTE PUBLIC : ' +
        (identifiantManifeste
          ? 'Identifiant configuré'
          : 'Non connecté'),
      'Version : ' + STOCKAGES_CONFIG.version
    ].join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function creerStructuresStockages_(classeur) {
  assurerFeuilleEtEntetes_(
    classeur,
    STOCKAGES_CONFIG.feuilles.parametres,
    STOCKAGES_CONFIG.entetes.parametres
  );

  assurerFeuilleEtEntetes_(
    classeur,
    STOCKAGES_CONFIG.feuilles.soldeInitial,
    STOCKAGES_CONFIG.entetes.soldeInitial
  );

  assurerFeuilleEtEntetes_(
    classeur,
    STOCKAGES_CONFIG.feuilles.historique,
    STOCKAGES_CONFIG.entetes.historique
  );

  assurerFeuilleEtEntetes_(
    classeur,
    STOCKAGES_CONFIG.feuilles.mouvements,
    STOCKAGES_CONFIG.entetes.mouvements
  );

  assurerFeuilleEtEntetes_(
    classeur,
    STOCKAGES_CONFIG.feuilles.stockJournalier,
    STOCKAGES_CONFIG.entetes.stockJournalier
  );

  assurerFeuilleEtEntetes_(
    classeur,
    STOCKAGES_CONFIG.feuilles.audit,
    STOCKAGES_CONFIG.entetes.audit
  );
}

function assurerFeuilleEtEntetes_(
  classeur,
  nomFeuille,
  entetes
) {
  let feuille = classeur.getSheetByName(nomFeuille);

  if (!feuille) {
    feuille = classeur.insertSheet(nomFeuille);
  }

  if (feuille.getMaxColumns() < entetes.length) {
    feuille.insertColumnsAfter(
      feuille.getMaxColumns(),
      entetes.length - feuille.getMaxColumns()
    );
  }

  const plageEntetes = feuille.getRange(
    1,
    1,
    1,
    entetes.length
  );

  const valeursExistantes =
    plageEntetes.getDisplayValues()[0];

  const entetesVides = valeursExistantes.every(
    function(valeur) {
      return String(valeur).trim() === '';
    }
  );

  if (entetesVides) {
    plageEntetes.setValues([entetes]);
  } else {
    entetes.forEach(function(entete, index) {
      if (
        String(valeursExistantes[index]).trim() !==
        entete
      ) {
        throw new Error(
          'En-tête incompatible dans ' +
            nomFeuille +
            ', colonne ' +
            (index + 1) +
            '. Attendu : ' +
            entete
        );
      }
    });
  }

  feuille.setFrozenRows(1);
}

function initialiserParametresStockages_(classeur) {
  const maintenant = new Date();
  const utilisateur = utilisateurCourantStockages_();

  const parametres = [
    [
      'SYSTEM_STATUS',
      'BROUILLON',
      'Statut du système de stockage.'
    ],
    [
      'MANIFEST_SPREADSHEET_ID',
      '',
      'Identifiant du classeur MANIFESTE PUBLIC.'
    ],
    [
      'TIMEZONE',
      STOCKAGES_CONFIG.timezone,
      'Fuseau horaire métier.'
    ],
    [
      'DATE_ACTIVATION',
      '',
      'Date et heure commune d’activation.'
    ],
    [
      'VERSION',
      STOCKAGES_CONFIG.version,
      'Version du système.'
    ],
    ['AGENCE_COO', 'COO', 'Agence Cotonou.'],
    ['AGENCE_FIH', 'FIH', 'Agence Kinshasa.'],
    ['AGENCE_LSHI', 'LSHI', 'Agence Lubumbashi.'],
    ['AGENCE_KLZ', 'KLZ', 'Agence Kolwezi.'],
    [
      'STATUT_ENREGISTRE',
      'ENREGISTRÉ',
      'Colis enregistré à COO.'
    ],
    [
      'STATUT_EN_VOL',
      'EN VOL',
      'Colis sorti de COO.'
    ],
    [
      'STATUT_EN_TRANSIT',
      'EN TRANSIT',
      'Statut sans mouvement de stock.'
    ],
    [
      'STATUT_ARRIVE',
      'ARRIVÉ',
      'Colis entré dans sa destination finale.'
    ],
    [
      'STATUT_LIVRE',
      'LIVRÉ',
      'Colis sorti de sa destination finale.'
    ]
  ];

  const feuille = exigerFeuilleStockages_(
    classeur,
    STOCKAGES_CONFIG.feuilles.parametres
  );

  const derniereLigne = feuille.getLastRow();

  const existantes = derniereLigne >= 2
    ? feuille
        .getRange(2, 1, derniereLigne - 1, 5)
        .getValues()
    : [];

  const indexParCle = new Map();

  existantes.forEach(function(ligne, index) {
    const cle = String(ligne[0] || '').trim();

    if (!cle) {
      return;
    }

    if (indexParCle.has(cle)) {
      throw new Error(
        'Paramètre dupliqué dans PARAMETRES : ' + cle
      );
    }

    indexParCle.set(cle, index + 2);
  });

  const aAjouter = [];

  parametres.forEach(function(parametre) {
    if (!indexParCle.has(parametre[0])) {
      aAjouter.push([
        parametre[0],
        parametre[1],
        parametre[2],
        maintenant,
        utilisateur
      ]);
    }
  });

  if (aAjouter.length > 0) {
    feuille
      .getRange(
        feuille.getLastRow() + 1,
        1,
        aAjouter.length,
        5
      )
      .setValues(aAjouter);
  }
}

function initialiserSoldesAgences_(classeur) {
  const feuille = exigerFeuilleStockages_(
    classeur,
    STOCKAGES_CONFIG.feuilles.soldeInitial
  );

  STOCKAGES_CONFIG.agences.forEach(function(agence) {
    const ligneOfficielle =
      STOCKAGES_CONFIG.lignesAgences[agence];

    const agenceActuelle = normaliserTexteStockages_(
      feuille.getRange(ligneOfficielle, 2).getValue()
    );

    if (!agenceActuelle) {
      feuille
        .getRange(ligneOfficielle, 1, 1, 9)
        .setValues([[
          '',
          agence,
          '',
          '',
          '',
          '',
          'BROUILLON',
          '',
          ''
        ]]);

      return;
    }

    if (agenceActuelle !== agence) {
      throw new Error(
        'La ligne ' +
          ligneOfficielle +
          ' de SOLDE INITIAL doit appartenir à ' +
          agence +
          '.'
      );
    }
  });

  if (feuille.getLastRow() > 5) {
    const lignesSupplementaires = feuille
      .getRange(6, 1, feuille.getLastRow() - 5, 9)
      .getValues();

    lignesSupplementaires.forEach(function(ligne, index) {
      const agence = normaliserTexteStockages_(ligne[1]);

      if (STOCKAGES_CONFIG.agences.includes(agence)) {
        throw new Error(
          'Agence officielle dupliquée dans SOLDE INITIAL, ligne ' +
            (index + 6) +
            ' : ' +
            agence
        );
      }
    });
  }
}

function installerValidationsStockages_(classeur) {
  const feuilleSolde = exigerFeuilleStockages_(
    classeur,
    STOCKAGES_CONFIG.feuilles.soldeInitial
  );
  const feuilleHistorique = exigerFeuilleStockages_(
    classeur,
    STOCKAGES_CONFIG.feuilles.historique
  );
  const feuilleMouvements = exigerFeuilleStockages_(
    classeur,
    STOCKAGES_CONFIG.feuilles.mouvements
  );

  feuilleSolde
    .getRange(2, 1, 4, 1)
    .clearDataValidations()
    .setNumberFormat('dd/MM/yyyy HH:mm');

  const validationNombreColis = SpreadsheetApp
    .newDataValidation()
    .requireNumberGreaterThanOrEqualTo(0)
    .setAllowInvalid(false)
    .setHelpText(
      'Saisissez un nombre entier supérieur ou égal à zéro.'
    )
    .build();

  feuilleSolde
    .getRange(2, 3, 4, 1)
    .setDataValidation(validationNombreColis);

  const validationKilogrammes = SpreadsheetApp
    .newDataValidation()
    .requireNumberGreaterThanOrEqualTo(0)
    .setAllowInvalid(false)
    .setHelpText(
      'Saisissez un nombre supérieur ou égal à zéro.'
    )
    .build();

  feuilleSolde
    .getRange(2, 4, 4, 1)
    .setDataValidation(validationKilogrammes);

  const validationStatutSolde = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(['BROUILLON', 'VALIDÉ'], true)
    .setAllowInvalid(false)
    .setHelpText(
      'Sélectionnez BROUILLON ou VALIDÉ.'
    )
    .build();

  feuilleSolde
    .getRange(2, 7, 4, 1)
    .setDataValidation(validationStatutSolde);

  const validationStatutColis = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(STOCKAGES_CONFIG.statutsColis.slice(), true)
    .setAllowInvalid(false)
    .setHelpText(
      'Sélectionnez un statut de colis autorisé.'
    )
    .build();

  feuilleHistorique
    .getRange(
      2,
      7,
      Math.max(feuilleHistorique.getMaxRows() - 1, 1),
      1
    )
    .setDataValidation(validationStatutColis);

  const validationAgence = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(STOCKAGES_CONFIG.agences.slice(), true)
    .setAllowInvalid(false)
    .setHelpText(
      'Sélectionnez une agence autorisée.'
    )
    .build();

  feuilleMouvements
    .getRange(
      2,
      3,
      Math.max(feuilleMouvements.getMaxRows() - 1, 1),
      1
    )
    .setDataValidation(validationAgence);

  const validationTypeMouvement = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(STOCKAGES_CONFIG.typesMouvements.slice(), true)
    .setAllowInvalid(false)
    .setHelpText(
      'Sélectionnez un type de mouvement autorisé.'
    )
    .build();

  feuilleMouvements
    .getRange(
      2,
      6,
      Math.max(feuilleMouvements.getMaxRows() - 1, 1),
      1
    )
    .setDataValidation(validationTypeMouvement);

  const validationAnnule = SpreadsheetApp
    .newDataValidation()
    .requireCheckbox()
    .setAllowInvalid(false)
    .build();

  feuilleMouvements
    .getRange(
      2,
      14,
      Math.max(feuilleMouvements.getMaxRows() - 1, 1),
      1
    )
    .setDataValidation(validationAnnule);
}
function mettreEnFormeStockages_(classeur) {
  Object.keys(STOCKAGES_CONFIG.feuilles).forEach(
    function(cle) {
      const nomFeuille = STOCKAGES_CONFIG.feuilles[cle];
      const feuille = exigerFeuilleStockages_(
        classeur,
        nomFeuille
      );

      const nombreColonnes = feuille.getLastColumn();

      if (nombreColonnes > 0) {
        feuille
          .getRange(1, 1, 1, nombreColonnes)
          .setFontWeight('bold')
          .setBackground('#17324d')
          .setFontColor('#ffffff')
          .setHorizontalAlignment('center');

        feuille.autoResizeColumns(
          1,
          nombreColonnes
        );
      }
    }
  );
}

function verifierConfigurationInterne_(classeur) {
  const erreurs = [];

  Object.keys(STOCKAGES_CONFIG.feuilles).forEach(
    function(cle) {
      const nomFeuille = STOCKAGES_CONFIG.feuilles[cle];
      const feuille = classeur.getSheetByName(nomFeuille);

      if (!feuille) {
        erreurs.push('Feuille absente : ' + nomFeuille);
        return;
      }

      const entetesAttendues =
        STOCKAGES_CONFIG.entetes[cle];

      if (!entetesAttendues) {
        return;
      }

      const entetesReelles = feuille
        .getRange(
          1,
          1,
          1,
          entetesAttendues.length
        )
        .getDisplayValues()[0];

      entetesAttendues.forEach(function(entete, index) {
        if (entetesReelles[index] !== entete) {
          erreurs.push(
            nomFeuille +
              ' : en-tête invalide en colonne ' +
              (index + 1)
          );
        }
      });
    }
  );

  [
    'SYSTEM_STATUS',
    'MANIFEST_SPREADSHEET_ID',
    'TIMEZONE',
    'DATE_ACTIVATION',
    'VERSION'
  ].forEach(function(cle) {
    try {
      lireParametreStockagesBrut_(classeur, cle);
    } catch (erreur) {
      erreurs.push(messageErreurStockages_(erreur));
    }
  });

  const feuilleSolde = classeur.getSheetByName(
    STOCKAGES_CONFIG.feuilles.soldeInitial
  );

  if (feuilleSolde) {
    STOCKAGES_CONFIG.agences.forEach(function(agence) {
      const ligne =
        STOCKAGES_CONFIG.lignesAgences[agence];

      const agenceReelle = normaliserTexteStockages_(
        feuilleSolde.getRange(ligne, 2).getValue()
      );

      if (agenceReelle !== agence) {
        erreurs.push(
          'SOLDE INITIAL ligne ' +
            ligne +
            ' doit appartenir à ' +
            agence
        );
      }
    });
  }

  return erreurs;
}

function exigerConfigurationValide_(classeur) {
  const erreurs = verifierConfigurationInterne_(classeur);

  if (erreurs.length > 0) {
    throw new Error(erreurs.join('\n'));
  }
}

function lireSoldesInitiaux_(classeur) {
  const feuille = exigerFeuilleStockages_(
    classeur,
    STOCKAGES_CONFIG.feuilles.soldeInitial
  );

  return STOCKAGES_CONFIG.agences.map(function(agence) {
    const ligne = STOCKAGES_CONFIG.lignesAgences[agence];
    const valeurs = feuille
      .getRange(ligne, 1, 1, 9)
      .getValues()[0];

    return {
      ligne: ligne,
      dateActivation: valeurs[0],
      agence: normaliserTexteStockages_(valeurs[1]),
      nombreColis: analyserEntierPositifOuZero_(
        valeurs[2]
      ),
      kilogrammes: analyserNombrePositifOuZero_(
        valeurs[3]
      ),
      statut: normaliserTexteStockages_(valeurs[6]),
      initialStockId: String(valeurs[7] || '').trim()
    };
  });
}

function lireSoldesInitiauxValides_(classeur) {
  return lireSoldesInitiaux_(classeur).filter(
    function(item) {
      return item.statut === 'VALIDÉ';
    }
  );
}

function lireMouvementsStock_(classeur) {
  const feuille = exigerFeuilleStockages_(
    classeur,
    STOCKAGES_CONFIG.feuilles.mouvements
  );

  if (feuille.getLastRow() < 2) {
    return [];
  }

  const lignes = feuille
    .getRange(
      2,
      1,
      feuille.getLastRow() - 1,
      15
    )
    .getValues();

  const ids = new Set();
  const referencesEvenements = new Set();

  return lignes
    .map(function(ligne, index) {
      const numeroLigne = index + 2;

      const entierementVide = ligne.every(
        function(valeur) {
          return valeur === '' || valeur === null;
        }
      );

      if (entierementVide) {
        return null;
      }

      const dateMouvement = ligne[1];
      const agence = normaliserTexteStockages_(
        ligne[2]
      );
      const type = normaliserTexteStockages_(
        ligne[5]
      );
      const variationColis = analyserNombreSigne_(
        ligne[6]
      );
      const variationKg = analyserNombreSigne_(
        ligne[7]
      );
      const movementId = String(ligne[10] || '')
        .trim()
        .toLowerCase();
      const annule = estValeurVraieStockages_(
        ligne[13]
      );
      const referenceEvenement = String(
        ligne[14] || ''
      )
        .trim()
        .toLowerCase();

      if (!estDateValideStockages_(dateMouvement)) {
        throw new Error(
          'Date de mouvement invalide, ligne ' +
            numeroLigne
        );
      }

      if (!STOCKAGES_CONFIG.agences.includes(agence)) {
        throw new Error(
          'Agence invalide dans MOUVEMENTS STOCK, ligne ' +
            numeroLigne
        );
      }

      if (
        !STOCKAGES_CONFIG.typesMouvements.includes(type)
      ) {
        throw new Error(
          'Type de mouvement invalide, ligne ' +
            numeroLigne
        );
      }

      if (
        variationColis === null ||
        variationKg === null
      ) {
        throw new Error(
          'Variation invalide, ligne ' +
            numeroLigne
        );
      }

      if (!estUuidStockages_(movementId)) {
        throw new Error(
          'Movement ID invalide, ligne ' +
            numeroLigne
        );
      }

      if (ids.has(movementId)) {
        throw new Error(
          'Movement ID dupliqué : ' + movementId
        );
      }

      ids.add(movementId);

      if (referenceEvenement) {
        const cleReference =
          type + '|' + referenceEvenement;

        if (
          referencesEvenements.has(cleReference)
        ) {
          throw new Error(
            'Mouvement dupliqué pour la référence événement : ' +
              referenceEvenement
          );
        }

        referencesEvenements.add(cleReference);
      }

      if (
        (
          type === 'ENTREE_COO' ||
          type === 'ENTREE_DESTINATION'
        ) &&
        (
          variationColis < 0 ||
          variationKg < 0
        )
      ) {
        throw new Error(
          'Une entrée ne peut pas avoir une variation négative, ligne ' +
            numeroLigne
        );
      }

      if (
        (
          type === 'SORTIE_COO' ||
          type === 'SORTIE_DESTINATION'
        ) &&
        (
          variationColis > 0 ||
          variationKg > 0
        )
      ) {
        throw new Error(
          'Une sortie doit utiliser des variations négatives, ligne ' +
            numeroLigne
        );
      }

      return {
        dateMouvement: dateMouvement,
        agence: agence,
        type: type,
        variationColis: variationColis,
        variationKg: variationKg,
        annule: annule
      };
    })
    .filter(function(item) {
      return item !== null && !item.annule;
    });
}

function construireStockJournalier_(soldes, mouvements) {
  const aujourdHui = debutJourStockages_(new Date());
  const calculs = [];

  soldes.forEach(function(solde) {
    const dateActivation = solde.dateActivation;
    const premierJour = debutJourStockages_(
      dateActivation
    );

    let stockColis = solde.nombreColis;
    let stockKg = solde.kilogrammes;
    let dateCourante = new Date(
      premierJour.getTime()
    );

    while (
      dateCourante.getTime() <=
      aujourdHui.getTime()
    ) {
      const cleDate = cleDateStockages_(dateCourante);

      const mouvementsDuJour = mouvements.filter(
        function(mouvement) {
          return (
            mouvement.agence === solde.agence &&
            mouvement.dateMouvement.getTime() >=
              dateActivation.getTime() &&
            cleDateStockages_(
              mouvement.dateMouvement
            ) === cleDate
          );
        }
      );

      let entreesColis = 0;
      let entreesKg = 0;
      let sortiesColis = 0;
      let sortiesKg = 0;
      let ajustementsColis = 0;
      let ajustementsKg = 0;

      mouvementsDuJour.forEach(function(mouvement) {
        if (
          mouvement.type === 'ENTREE_COO' ||
          mouvement.type === 'ENTREE_DESTINATION'
        ) {
          entreesColis += mouvement.variationColis;
          entreesKg += mouvement.variationKg;
          return;
        }

        if (
          mouvement.type === 'SORTIE_COO' ||
          mouvement.type === 'SORTIE_DESTINATION'
        ) {
          sortiesColis += Math.abs(
            mouvement.variationColis
          );
          sortiesKg += Math.abs(
            mouvement.variationKg
          );
          return;
        }

        if (mouvement.type === 'AJUSTEMENT_ADMIN') {
          ajustementsColis +=
            mouvement.variationColis;
          ajustementsKg += mouvement.variationKg;
        }
      });

      const stockInitialJourColis = stockColis;
      const stockInitialJourKg = stockKg;

      stockColis =
        stockColis +
        entreesColis -
        sortiesColis +
        ajustementsColis;

      stockKg =
        stockKg +
        entreesKg -
        sortiesKg +
        ajustementsKg;

      calculs.push({
        cle: cleDate + '|' + solde.agence,
        agence: solde.agence,
        date: new Date(dateCourante.getTime()),
        stockFinalColis: stockColis,
        stockFinalKg: stockKg,
        valeurs: [
          new Date(dateCourante.getTime()),
          solde.agence,
          stockInitialJourColis,
          stockInitialJourKg,
          entreesColis,
          entreesKg,
          sortiesColis,
          sortiesKg,
          ajustementsColis,
          ajustementsKg,
          stockColis,
          stockKg,
          new Date(),
          STOCKAGES_CONFIG.version,
          stockColis < 0 || stockKg < 0
            ? 'ALERTE_STOCK_NEGATIF'
            : 'OK'
        ]
      });

      dateCourante.setDate(
        dateCourante.getDate() + 1
      );
    }
  });

  calculs.sort(function(a, b) {
    return a.cle.localeCompare(b.cle);
  });

  return calculs;
}

function ecrireStockJournalierIdempotent_(
  classeur,
  calculs
) {
  const feuille = exigerFeuilleStockages_(
    classeur,
    STOCKAGES_CONFIG.feuilles.stockJournalier
  );

  const derniereLigne = feuille.getLastRow();

  const existantes = derniereLigne >= 2
    ? feuille
        .getRange(
          2,
          1,
          derniereLigne - 1,
          15
        )
        .getValues()
    : [];

  const lignesParCle = new Map();

  existantes.forEach(function(ligne, index) {
    if (!estDateValideStockages_(ligne[0])) {
      return;
    }

    const agence = normaliserTexteStockages_(
      ligne[1]
    );

    if (!agence) {
      return;
    }

    const cle =
      cleDateStockages_(ligne[0]) +
      '|' +
      agence;

    if (lignesParCle.has(cle)) {
      throw new Error(
        'Doublon existant dans STOCK JOURNALIER : ' +
          cle
      );
    }

    lignesParCle.set(cle, index + 2);
  });

  const aAjouter = [];

  calculs.forEach(function(calcul) {
    if (lignesParCle.has(calcul.cle)) {
      feuille
        .getRange(
          lignesParCle.get(calcul.cle),
          1,
          1,
          15
        )
        .setValues([calcul.valeurs]);
    } else {
      aAjouter.push(calcul.valeurs);
    }
  });

  if (aAjouter.length > 0) {
    feuille
      .getRange(
        feuille.getLastRow() + 1,
        1,
        aAjouter.length,
        15
      )
      .setValues(aAjouter);
  }
}

function ajouterAuditStockNegatifSiAbsent_(
  classeur,
  calcul
) {
  const feuille = exigerFeuilleStockages_(
    classeur,
    STOCKAGES_CONFIG.feuilles.audit
  );

  const reference = [
    cleDateStockages_(calcul.date),
    calcul.agence,
    calcul.stockFinalColis,
    calcul.stockFinalKg
  ].join('|');

  if (feuille.getLastRow() >= 2) {
    const lignes = feuille
      .getRange(
        2,
        3,
        feuille.getLastRow() - 1,
        3
      )
      .getDisplayValues();

    const existe = lignes.some(function(ligne) {
      return (
        normaliserTexteStockages_(ligne[0]) ===
          'ALERTE_STOCK_NEGATIF' &&
        String(ligne[2] || '').trim() === reference
      );
    });

    if (existe) {
      return;
    }
  }

  ajouterAuditStockages_(classeur, {
    action: 'ALERTE_STOCK_NEGATIF',
    agence: calcul.agence,
    reference: reference,
    ancienneValeur: '',
    nouvelleValeur: JSON.stringify({
      stockFinalColis: calcul.stockFinalColis,
      stockFinalKg: calcul.stockFinalKg
    }),
    resultat: 'AVERTISSEMENT',
    details:
      'Stock négatif détecté pour le ' +
      cleDateStockages_(calcul.date) +
      '. Résultat conservé pour examen.'
  });
}

function protegerLigneSoldeValide_(
  feuille,
  ligne,
  initialStockId
) {
  const description =
    'STOCKAGES EEB - Solde initial validé - ' +
    initialStockId;

  const existe = feuille
    .getProtections(
      SpreadsheetApp.ProtectionType.RANGE
    )
    .some(function(protection) {
      return (
        protection.getDescription() === description
      );
    });

  if (existe) {
    return;
  }

  const protection = feuille
    .getRange(ligne, 1, 1, 9)
    .protect()
    .setDescription(description)
    .setWarningOnly(false);

  limiterProtectionAuProprietaireStockages_(
    protection
  );
}

function protegerDonneesSensiblesStockages_(
  classeur
) {
  [
    STOCKAGES_CONFIG.feuilles.parametres,
    STOCKAGES_CONFIG.feuilles.historique,
    STOCKAGES_CONFIG.feuilles.mouvements,
    STOCKAGES_CONFIG.feuilles.stockJournalier,
    STOCKAGES_CONFIG.feuilles.audit
  ].forEach(function(nomFeuille) {
    const feuille = exigerFeuilleStockages_(
      classeur,
      nomFeuille
    );

    protegerFeuilleTechniqueStockages_(
      feuille,
      'STOCKAGES EEB - Feuille protégée - ' +
        nomFeuille
    );
  });
}

function protegerFeuilleTechniqueStockages_(
  feuille,
  description
) {
  const existe = feuille
    .getProtections(
      SpreadsheetApp.ProtectionType.SHEET
    )
    .some(function(protection) {
      return (
        protection.getDescription() === description
      );
    });

  if (existe) {
    return;
  }

  const protection = feuille
    .protect()
    .setDescription(description)
    .setWarningOnly(false);

  limiterProtectionAuProprietaireStockages_(
    protection
  );
}

function limiterProtectionAuProprietaireStockages_(
  protection
) {
  const utilisateur = Session.getEffectiveUser();

  protection.addEditor(utilisateur);

  const emailUtilisateur =
    utilisateur.getEmail();

  const autresEditeurs = protection
    .getEditors()
    .filter(function(editeur) {
      return (
        editeur.getEmail() !== emailUtilisateur
      );
    });

  if (autresEditeurs.length > 0) {
    protection.removeEditors(autresEditeurs);
  }

  if (protection.canDomainEdit()) {
    protection.setDomainEdit(false);
  }
}

/**
 * Utiliser cette fonction uniquement pour les paramètres textuels
 * dont la normalisation en majuscules est souhaitée.
 *
 * Ne pas utiliser pour MANIFEST_SPREADSHEET_ID.
 */
function lireParametreStockages_(classeur, cle) {
  const valeur = lireParametreStockagesBrut_(
    classeur,
    cle
  );

  return normaliserTexteStockages_(valeur);
}

/**
 * Retourne la valeur originale sans changer sa casse.
 * Obligatoire pour MANIFEST_SPREADSHEET_ID.
 */
function lireParametreStockagesBrut_(classeur, cle) {
  const feuille = exigerFeuilleStockages_(
    classeur,
    STOCKAGES_CONFIG.feuilles.parametres
  );

  if (feuille.getLastRow() < 2) {
    throw new Error('Paramètre absent : ' + cle);
  }

  const lignes = feuille
    .getRange(
      2,
      1,
      feuille.getLastRow() - 1,
      5
    )
    .getValues();

  const correspondances = lignes.filter(
    function(ligne) {
      return String(ligne[0] || '').trim() === cle;
    }
  );

  if (correspondances.length !== 1) {
    throw new Error(
      'Le paramètre doit exister une seule fois : ' +
        cle
    );
  }

  return correspondances[0][1];
}

function ecrireParametreStockages_(
  classeur,
  cle,
  valeur,
  description
) {
  const feuille = exigerFeuilleStockages_(
    classeur,
    STOCKAGES_CONFIG.feuilles.parametres
  );

  if (feuille.getLastRow() < 2) {
    throw new Error('PARAMETRES est vide.');
  }

  const cles = feuille
    .getRange(
      2,
      1,
      feuille.getLastRow() - 1,
      1
    )
    .getDisplayValues();

  const lignes = [];

  cles.forEach(function(ligne, index) {
    if (String(ligne[0]).trim() === cle) {
      lignes.push(index + 2);
    }
  });

  if (lignes.length !== 1) {
    throw new Error(
      'Le paramètre doit exister une seule fois : ' +
        cle
    );
  }

  feuille
    .getRange(lignes[0], 2, 1, 4)
    .setValues([[
      valeur,
      description,
      new Date(),
      utilisateurCourantStockages_()
    ]]);
}

function ajouterAuditStockages_(classeur, evenement) {
  const feuille = classeur.getSheetByName(
    STOCKAGES_CONFIG.feuilles.audit
  );

  if (!feuille) {
    return;
  }

  feuille
    .getRange(
      feuille.getLastRow() + 1,
      1,
      1,
      10
    )
    .setValues([[
      new Date(),
      utilisateurCourantStockages_(),
      evenement.action || '',
      evenement.agence || '',
      evenement.reference || '',
      evenement.ancienneValeur || '',
      evenement.nouvelleValeur || '',
      evenement.resultat || '',
      evenement.details || '',
      Utilities.getUuid().toLowerCase()
    ]]);
}

function journaliserErreurStockages_(action, erreur) {
  try {
    const classeur =
      SpreadsheetApp.getActiveSpreadsheet();

    ajouterAuditStockages_(classeur, {
      action: action,
      agence: '',
      reference: '',
      ancienneValeur: '',
      nouvelleValeur: '',
      resultat: 'ERREUR',
      details: messageErreurStockages_(erreur)
    });
  } catch (erreurAudit) {
    console.error(
      'Impossible de journaliser l’erreur : ' +
        messageErreurStockages_(erreurAudit)
    );
  }
}

function exigerFeuilleStockages_(
  classeur,
  nomFeuille
) {
  const feuille = classeur.getSheetByName(
    nomFeuille
  );

  if (!feuille) {
    throw new Error(
      'Feuille absente : ' + nomFeuille
    );
  }

  return feuille;
}

function agenceOfficiellePourLigne_(ligne) {
  const agences = STOCKAGES_CONFIG.agences;

  for (let index = 0; index < agences.length; index++) {
    const agence = agences[index];

    if (
      STOCKAGES_CONFIG.lignesAgences[agence] ===
      ligne
    ) {
      return agence;
    }
  }

  return null;
}

function analyserDateHeureSaisieStockages_(texte) {
  if (
    !/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(
      texte
    )
  ) {
    return null;
  }

  try {
    const date = Utilities.parseDate(
      texte,
      STOCKAGES_CONFIG.timezone,
      'dd/MM/yyyy HH:mm'
    );

    if (
      Utilities.formatDate(
        date,
        STOCKAGES_CONFIG.timezone,
        'dd/MM/yyyy HH:mm'
      ) !== texte
    ) {
      return null;
    }

    return date;
  } catch (erreur) {
    return null;
  }
}

function analyserEntierPositifOuZero_(valeur) {
  if (
    valeur === '' ||
    valeur === null ||
    valeur === undefined
  ) {
    return null;
  }

  const nombre = Number(valeur);

  if (
    !Number.isFinite(nombre) ||
    !Number.isInteger(nombre) ||
    nombre < 0
  ) {
    return null;
  }

  return nombre;
}

function analyserNombrePositifOuZero_(valeur) {
  if (
    valeur === '' ||
    valeur === null ||
    valeur === undefined
  ) {
    return null;
  }

  const nombre = Number(
    String(valeur).replace(',', '.')
  );

  if (!Number.isFinite(nombre) || nombre < 0) {
    return null;
  }

  return nombre;
}

function analyserNombreSigne_(valeur) {
  if (
    valeur === '' ||
    valeur === null ||
    valeur === undefined
  ) {
    return null;
  }

  const nombre = Number(
    String(valeur).replace(',', '.')
  );

  return Number.isFinite(nombre)
    ? nombre
    : null;
}

function normaliserTexteStockages_(valeur) {
  return String(valeur || '')
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function estDateValideStockages_(valeur) {
  return (
    valeur instanceof Date &&
    !Number.isNaN(valeur.getTime())
  );
}

function estValeurVraieStockages_(valeur) {
  return (
    valeur === true ||
    normaliserTexteStockages_(valeur) === 'TRUE' ||
    normaliserTexteStockages_(valeur) === 'VRAI' ||
    normaliserTexteStockages_(valeur) === 'OUI'
  );
}

function estUuidStockages_(valeur) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    String(valeur || '').toLowerCase()
  );
}

function debutJourStockages_(date) {
  const cle = Utilities.formatDate(
    date,
    STOCKAGES_CONFIG.timezone,
    'yyyy-MM-dd'
  );

  const morceaux = cle.split('-').map(Number);

  return new Date(
    morceaux[0],
    morceaux[1] - 1,
    morceaux[2],
    12,
    0,
    0,
    0
  );
}

function cleDateStockages_(date) {
  return Utilities.formatDate(
    date,
    STOCKAGES_CONFIG.timezone,
    'yyyy-MM-dd'
  );
}

function formaterDateHeureStockages_(date) {
  return Utilities.formatDate(
    date,
    STOCKAGES_CONFIG.timezone,
    'dd/MM/yyyy HH:mm:ss'
  );
}

function utilisateurCourantStockages_() {
  const email =
    Session.getEffectiveUser().getEmail();

  return email || 'Utilisateur non identifié';
}

function messageErreurStockages_(erreur) {
  return erreur && erreur.message
    ? erreur.message
    : String(erreur);
}

function afficherLienAutorisationStockages() {
  const autorisation = ScriptApp.getAuthorizationInfo(
    ScriptApp.AuthMode.FULL,
    [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  );

  console.log(
    'STATUT_AUTORISATION : ' +
      autorisation.getAuthorizationStatus()
  );

  console.log(
    'LIEN_AUTORISATION : ' +
      autorisation.getAuthorizationUrl()
  );
}