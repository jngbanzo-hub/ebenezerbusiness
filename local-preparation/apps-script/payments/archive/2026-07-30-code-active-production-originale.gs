/**
 * ============================================================
 * PAIEMENTS AGENTS – API SÉCURISÉE
 * ============================================================
 *
 * Feuilles d'encaissement :
 * - COO  : Cotonou
 * - FIH  : Kinshasa
 * - LSHI : Lubumbashi
 * - KLZ  : Kolwezi
 *
 * Fichier source :
 * - lit uniquement A, B, E, F et I ;
 * - ne retourne jamais les noms et numéros de téléphone ;
 * - ne modifie jamais le manifeste source.
 */

/**
 * Identifiant du fichier source :
 * Manifeste De L'Expédition COO
 */
const SOURCE_COLIS_ID =
  "13idZ5lGAZs8OQiaQe3nQinkRF0NRmxsg2BxcrNAE8LI";

/**
 * Feuilles du manifeste correspondant aux destinations.
 */
const AGENCES_AUTORISEES = [
  "FIH",
  "LSHI",
  "KLZ"
];

/**
 * Agences pouvant recevoir un paiement.
 */
const AGENCES_ENCAISSEMENT = [
  "COO",
  "FIH",
  "LSHI",
  "KLZ"
];

const MODES_PAIEMENT_AUTORISES = [
  "ESPECES",
  "MOBILE MONEY",
  "VIREMENT",
  "AUTRE"
];

/**
 * Configuration du fichier PAIEMENTS AGENTS.
 */
const CONFIG_PAIEMENTS = {
  feuilles: [
    "COO",
    "FIH",
    "LSHI",
    "KLZ"
  ],

  nombreLignesPreparees: 1000,

  entetes: [
    "Date et heure",
    "Code colis",
    "Poids (Kg)",
    "Montant attendu",
    "Montant payé",
    "Solde restant",
    "Agence d'encaissement",
    "Destination du colis",
    "Statut paiement",
    "Agent",
    "Mode de paiement",
    "Référence paiement",
    "Date du colis",
    "Statut colis",
    "Observation"
  ]
};

/**
 * ============================================================
 * 1. INITIALISATION DES FEUILLES
 * ============================================================
 */

function initialiserPaiementsAgents() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();

  const nombreLignes =
    CONFIG_PAIEMENTS.nombreLignesPreparees - 1;

  CONFIG_PAIEMENTS.feuilles.forEach((nomFeuille) => {
    let feuille = classeur.getSheetByName(nomFeuille);

    if (!feuille) {
      feuille = classeur.insertSheet(nomFeuille);
    }

    const lignesManquantes =
      CONFIG_PAIEMENTS.nombreLignesPreparees -
      feuille.getMaxRows();

    if (lignesManquantes > 0) {
      feuille.insertRowsAfter(
        feuille.getMaxRows(),
        lignesManquantes
      );
    }

    const plageEntetes = feuille.getRange(
      1,
      1,
      1,
      CONFIG_PAIEMENTS.entetes.length
    );

    plageEntetes
      .setValues([CONFIG_PAIEMENTS.entetes])
      .setFontWeight("bold")
      .setFontColor("#FFFFFF")
      .setBackground("#06152F")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");

    feuille.setFrozenRows(1);
    feuille.setRowHeight(1, 36);

    const largeurs = [
      155, // A Date et heure
      120, // B Code colis
      95,  // C Poids
      130, // D Montant attendu
      120, // E Montant payé
      120, // F Solde restant
      165, // G Agence d'encaissement
      175, // H Destination du colis
      160, // I Statut paiement
      150, // J Agent
      150, // K Mode de paiement
      210, // L Référence paiement
      120, // M Date du colis
      190, // N Statut colis
      260  // O Observation
    ];

    largeurs.forEach((largeur, index) => {
      feuille.setColumnWidth(index + 1, largeur);
    });

    feuille
      .getRange(2, 1, nombreLignes, 1)
      .setNumberFormat("dd/MM/yyyy HH:mm:ss");

    feuille
      .getRange(2, 3, nombreLignes, 1)
      .setNumberFormat("0.00");

    feuille
      .getRange(2, 4, nombreLignes, 3)
      .setNumberFormat('$0.00');

    feuille
      .getRange(2, 13, nombreLignes, 1)
      .setNumberFormat("dd/MM/yyyy");

    installerListesDeroulantes_(
      feuille,
      nombreLignes
    );
  });

  SpreadsheetApp.flush();

  classeur.toast(
    "Les feuilles COO, FIH, LSHI et KLZ sont prêtes.",
    "Configuration terminée",
    5
  );
}

function installerListesDeroulantes_(
  feuille,
  nombreLignes
) {
  const regleStatutPaiement =
    SpreadsheetApp.newDataValidation()
      .requireValueInList(
        [
          "NON PAYÉ",
          "PARTIELLEMENT PAYÉ",
          "SOLDÉ",
          "ANNULÉ"
        ],
        true
      )
      .setAllowInvalid(false)
      .build();

  const regleModePaiement =
    SpreadsheetApp.newDataValidation()
      .requireValueInList(
        [
          "ESPÈCES",
          "MOBILE MONEY",
          "VIREMENT",
          "AUTRE"
        ],
        true
      )
      .setAllowInvalid(false)
      .build();

  const regleStatutColis =
    SpreadsheetApp.newDataValidation()
      .requireValueInList(
        [
          "ENREGISTRÉ",
          "EN VOL",
          "EN TRANSIT",
          "ARRIVÉ",
          "LIVRÉ",
          "REMIS AU BÉNÉFICIAIRE"
        ],
        true
      )
      .setAllowInvalid(false)
      .build();

  // I : Statut paiement
  feuille
    .getRange(2, 9, nombreLignes, 1)
    .setDataValidation(regleStatutPaiement);

  // K : Mode de paiement
  feuille
    .getRange(2, 11, nombreLignes, 1)
    .setDataValidation(regleModePaiement);

  // N : Statut colis
  feuille
    .getRange(2, 14, nombreLignes, 1)
    .setDataValidation(regleStatutColis);
}

/**
 * ============================================================
 * 2. RECHERCHE SÉCURISÉE DANS LE MANIFESTE
 * ============================================================
 *
 * Colonnes utilisées :
 * A : Date
 * B : Code colis
 * E : Poids
 * F : Prix à payer
 * I : Statut du colis
 *
 * Les colonnes C et D ne sont jamais retournées.
 */

function rechercherColisSource(
  agence,
  codeColis
) {
  const agenceNormalisee = String(agence || "")
    .trim()
    .toUpperCase();

  const codeNormalise =
    normaliserCodeColis_(codeColis);

  if (
    !AGENCES_AUTORISEES.includes(
      agenceNormalisee
    )
  ) {
    return {
      succes: false,
      message: "Destination non autorisée."
    };
  }

  if (!codeNormalise) {
    return {
      succes: false,
      message: "Le code du colis est obligatoire."
    };
  }

  const fichierSource =
    SpreadsheetApp.openById(SOURCE_COLIS_ID);

  const feuilleSource =
    fichierSource.getSheetByName(
      agenceNormalisee
    );

  if (!feuilleSource) {
    return {
      succes: false,
      message:
        "La feuille source " +
        agenceNormalisee +
        " est introuvable."
    };
  }

  const derniereLigne =
    feuilleSource.getLastRow();

  if (derniereLigne < 2) {
    return {
      succes: false,
      message:
        "Aucun colis enregistré dans cette destination."
    };
  }

  /*
   * Lecture séparée des colonnes autorisées.
   * Les colonnes confidentielles C et D
   * ne sont pas lues.
   */
  const nombreLignes = derniereLigne - 1;

  const codes = feuilleSource
    .getRange(2, 2, nombreLignes, 1)
    .getDisplayValues();

  /*
   * Recherche depuis la dernière ligne,
   * afin de prendre l'enregistrement le plus récent
   * lorsqu'un même code apparaît plusieurs fois.
   */
  for (
    let index = nombreLignes - 1;
    index >= 0;
    index--
  ) {
    const codeTrouve =
      normaliserCodeColis_(codes[index][0]);

    if (codeTrouve === codeNormalise) {
      const ligneSource = index + 2;

      const dateColis = feuilleSource
        .getRange(ligneSource, 1)
        .getDisplayValue();

      const donneesMontant = feuilleSource
        .getRange(ligneSource, 5, 1, 2)
        .getDisplayValues()[0];

      const statutColis = feuilleSource
        .getRange(ligneSource, 9)
        .getDisplayValue();

      return {
        succes: true,

        colis: {
          dateColis: dateColis,
          codeColis: codes[index][0],
          poidsKg: convertirNombre_(
            donneesMontant[0]
          ),
          montantAttendu: convertirNombre_(
            donneesMontant[1]
          ),
          statutColis: statutColis,
          agence: agenceNormalisee,
          destination:
            obtenirDestination_(
              agenceNormalisee
            )
        }
      };
    }
  }

  return {
    succes: false,
    message:
      "Aucun colis trouvé avec le code " +
      codeNormalise +
      " dans la feuille " +
      agenceNormalisee +
      "."
  };
}
/**
 * Test manuel de la recherche.
 */
function testerRechercheColis() {
  const resultat = rechercherColisSource(
    "FIH",
    "MR14226"
  );

  console.log(
    JSON.stringify(resultat, null, 2)
  );
}

/**
 * ============================================================
 * 3. ENREGISTREMENT D'UN PAIEMENT
 * ============================================================
 */

function enregistrerPaiementAgent(
  donneesPaiement
) {
  const donnees = donneesPaiement || {};

  const destinationCode = String(
    donnees.destinationCode || ""
  )
    .trim()
    .toUpperCase();

  const codeColis =
    normaliserCodeColis_(
      donnees.codeColis
    );

  const agenceEncaissement = String(
    donnees.agenceEncaissement || ""
  )
    .trim()
    .toUpperCase();

  const agent = String(
    donnees.agent || ""
  ).trim();

const modePaiement = String(
  donnees.modePaiement || ""
)
  .trim()
  .toUpperCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");
  const referencePaiement = String(
    donnees.referencePaiement || ""
  ).trim();

  const observation = String(
    donnees.observation || ""
  ).trim();

  const simulation =
    donnees.simulation === true;

  const montantPaye =
    Number(donnees.montantPaye);

  if (
    !AGENCES_AUTORISEES.includes(
      destinationCode
    )
  ) {
    return {
      succes: false,
      message:
        "Destination du colis non autorisée."
    };
  }

  if (!codeColis) {
    return {
      succes: false,
      message:
        "Le code du colis est obligatoire."
    };
  }

  if (
    !AGENCES_ENCAISSEMENT.includes(
      agenceEncaissement
    )
  ) {
    return {
      succes: false,
      message:
        "Agence d'encaissement non autorisée."
    };
  }

  if (!agent) {
    return {
      succes: false,
      message:
        "L'identifiant de l'agent est obligatoire."
    };
  }

  if (
    !MODES_PAIEMENT_AUTORISES.includes(
      modePaiement
    )
  ) {
    return {
      succes: false,
      message:
        "Mode de paiement non autorisé."
    };
  }

  if (
    !Number.isFinite(montantPaye) ||
    montantPaye <= 0
  ) {
    return {
      succes: false,
      message:
        "Le montant payé doit être supérieur à zéro."
    };
  }

  const verrou =
    LockService.getScriptLock();

  let verrouObtenu = false;

  try {
    verrou.waitLock(20000);
    verrouObtenu = true;

    const resultatColis =
      rechercherColisSource(
        destinationCode,
        codeColis
      );

    if (!resultatColis.succes) {
      return resultatColis;
    }

    const colis = resultatColis.colis;

    const montantAttendu =
      Number(colis.montantAttendu);

    if (
      !Number.isFinite(montantAttendu) ||
      montantAttendu <= 0
    ) {
      return {
        succes: false,
        message:
          "Le montant attendu du colis est invalide."
      };
    }

    const totalDejaPaye =
      calculerTotalDejaPaye_(
        codeColis,
        destinationCode
      );

    const soldeAvantPaiement =
      arrondirMontant_(
        montantAttendu -
        totalDejaPaye
      );

    if (soldeAvantPaiement <= 0) {
      return {
        succes: false,
        message:
          "Ce colis est déjà entièrement soldé.",
        montantAttendu: montantAttendu,
        totalDejaPaye: totalDejaPaye,
        soldeRestant: 0
      };
    }

    if (
      montantPaye >
      soldeAvantPaiement + 0.009
    ) {
      return {
        succes: false,
        message:
          "Le montant saisi dépasse le solde restant.",
        montantAttendu: montantAttendu,
        totalDejaPaye: totalDejaPaye,
        soldeAvantPaiement:
          soldeAvantPaiement,
        montantMaximumAutorise:
          soldeAvantPaiement
      };
    }

    /*
     * Paiement partiel autorisé uniquement à COO.
     *
     * Dans une agence de destination,
     * le montant doit correspondre
     * au solde restant complet.
     */
    if (
      agenceEncaissement !== "COO" &&
      Math.abs(
        montantPaye -
        soldeAvantPaiement
      ) > 0.009
    ) {
      return {
        succes: false,
        message:
          "À destination, le montant doit correspondre exactement au solde restant.",
        soldeRestant:
          soldeAvantPaiement
      };
    }

    const nouveauTotalPaye =
      arrondirMontant_(
        totalDejaPaye +
        montantPaye
      );

    const nouveauSolde =
      arrondirMontant_(
        montantAttendu -
        nouveauTotalPaye
      );

    const statutPaiement =
      nouveauSolde <= 0
        ? "SOLDÉ"
        : "PARTIELLEMENT PAYÉ";

    const destinationNom =
      obtenirDestination_(
        destinationCode
      );

    const paiementPrepare = {
      dateEtHeure: new Date(),
      codeColis: colis.codeColis,
      poidsKg: colis.poidsKg,
      montantAttendu: montantAttendu,
      montantPaye: montantPaye,
      totalDejaPaye: totalDejaPaye,
      nouveauTotalPaye:
        nouveauTotalPaye,
      soldeRestant: nouveauSolde,
      agenceEncaissement:
        agenceEncaissement,
      destinationCode:
        destinationCode,
      destinationNom:
        destinationNom,
      statutPaiement:
        statutPaiement,
      agent: agent,
      modePaiement:
        modePaiement,
      referencePaiement:
        referencePaiement,
      dateColis: colis.dateColis,
      statutColis:
        normaliserStatutColis_(colis.statutColis),
      observation:
        observation
    };

    /*
     * Mode simulation :
     * aucune donnée n'est écrite.
     */
    if (simulation) {
      return {
        succes: true,
        simulation: true,
        paiement: paiementPrepare
      };
    }

    const classeur =
      SpreadsheetApp.getActiveSpreadsheet();

    const feuillePaiement =
      classeur.getSheetByName(
        agenceEncaissement
      );

    if (!feuillePaiement) {
      return {
        succes: false,
        message:
          "La feuille d'encaissement " +
          agenceEncaissement +
          " est introuvable."
      };
    }

    const prochaineLigne =
      feuillePaiement.getLastRow() + 1;

    feuillePaiement
      .getRange(
        prochaineLigne,
        1,
        1,
        15
      )
      .setValues([
        [
          new Date(),
          colis.codeColis,
          colis.poidsKg,
          montantAttendu,
          montantPaye,
          nouveauSolde,
          agenceEncaissement,
          destinationCode +
            " / " +
            destinationNom,
          statutPaiement,
          agent,
          modePaiement === "ESPECES"
  ? "ESPÈCES"
  : modePaiement,
          referencePaiement,
          colis.dateColis,
          normaliserStatutColis_(colis.statutColis),
          observation
        ]
      ]);


    return {
      succes: true,
      simulation: false,
      feuilleEnregistree:
        agenceEncaissement,
      ligneEnregistree:
        prochaineLigne,
      paiement:
        paiementPrepare
    };
  } catch (erreur) {
    console.error(erreur);

    return {
      succes: false,
      message:
        "Une erreur est survenue pendant le traitement du paiement.",
      detail:
        String(
          erreur &&
          erreur.message
            ? erreur.message
            : erreur
        )
    };
  } finally {
    if (verrouObtenu) {
      verrou.releaseLock();
    }
  }
}

/**
 * Calcule le cumul des paiements déjà enregistrés
 * pour un même code et une même destination.
 */
function calculerTotalDejaPaye_(
  codeColis,
  destinationCode
) {
  const classeur =
    SpreadsheetApp.getActiveSpreadsheet();

  const codeRecherche =
    normaliserCodeColis_(codeColis);

  const destinationRecherche =
    String(destinationCode || "")
      .trim()
      .toUpperCase();

  let totalPaye = 0;

  AGENCES_ENCAISSEMENT.forEach(
    (nomFeuille) => {
      const feuille =
        classeur.getSheetByName(
          nomFeuille
        );

      if (
        !feuille ||
        feuille.getLastRow() < 2
      ) {
        return;
      }

      const nombreLignes =
        feuille.getLastRow() - 1;

      /*
       * B à H :
       * B = Code colis
       * E = Montant payé
       * H = Destination du colis
       */
      const valeurs = feuille
        .getRange(
          2,
          2,
          nombreLignes,
          7
        )
        .getValues();

      valeurs.forEach((ligne) => {
        const codeEnregistre =
          normaliserCodeColis_(
            ligne[0]
          );

        const montantEnregistre =
          convertirNombre_(
            ligne[3]
          );

        const destinationEnregistree =
          String(ligne[6] || "")
            .trim()
            .toUpperCase();

        const memeDestination =
          destinationEnregistree ===
            destinationRecherche ||
          destinationEnregistree.startsWith(
            destinationRecherche + " /"
          );

        if (
          codeEnregistre ===
            codeRecherche &&
          memeDestination
        ) {
          totalPaye +=
            montantEnregistre;
        }
      });
    }
  );

  return arrondirMontant_(
    totalPaye
  );
}

/**
 * ============================================================
 * 4. TEST DE SIMULATION
 * ============================================================
 *
 * Le test n'écrit aucune ligne.
 */

function testerSimulationPaiement() {
  const resultat =
    enregistrerPaiementAgent({
      destinationCode: "FIH",
      codeColis: "MR14226",
      agenceEncaissement: "COO",
      montantPaye: 40,
      agent: "AGENT TEST",
      modePaiement: "ESPÈCES",
      referencePaiement: "",
      observation:
        "Simulation uniquement",
      simulation: true
    });

  console.log(
    JSON.stringify(resultat, null, 2)
  );
}

/**
 * ============================================================
 * 5. FONCTIONS AUXILIAIRES
 * ============================================================
 */

function normaliserCodeColis_(
  codeColis
) {
  return String(codeColis || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function convertirNombre_(valeur) {
  if (typeof valeur === "number") {
    return valeur;
  }

  let texte = String(valeur || "")
    .trim()
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");

  /*
   * Exemple :
   * 1.250,50 devient 1250.50
   */
  if (
    texte.includes(",") &&
    texte.includes(".")
  ) {
    texte = texte
      .replace(/\./g, "")
      .replace(",", ".");
  } else {
    texte = texte.replace(",", ".");
  }

  const nombre = Number(texte);

  return Number.isFinite(nombre)
    ? nombre
    : 0;
}

function obtenirDestination_(agence) {
  const destinations = {
    FIH: "Kinshasa",
    LSHI: "Lubumbashi",
    KLZ: "Kolwezi"
  };

  return destinations[agence] || agence;
}

function arrondirMontant_(montant) {
  return Math.round(
    (
      Number(montant) +
      Number.EPSILON
    ) * 100
  ) / 100;
}
function testerEnregistrementReelPaiement() {
  const resultat = enregistrerPaiementAgent({
    destinationCode: "FIH",
    codeColis: "MR14226",
    agenceEncaissement: "COO",
    montantPaye: 1,
    agent: "AGENT TEST",
    modePaiement: "ESPÈCES",
    referencePaiement: "TEST-001",
    observation: "TEST TECHNIQUE À SUPPRIMER",
    simulation: false
  });

  console.log(JSON.stringify(resultat, null, 2));
}
function normaliserStatutColis_(statut) {
  const texte = String(statut || "")
    .replace(/[✅☑️🟢🟡🔴📦✈️🚚]/g, "")
    .trim()
    .toUpperCase();

  const correspondances = {
    "ENREGISTRE": "ENREGISTRÉ",
    "ENREGISTRÉ": "ENREGISTRÉ",
    "EN VOL": "EN VOL",
    "EN TRANSIT": "EN TRANSIT",
    "ARRIVE": "ARRIVÉ",
    "ARRIVÉ": "ARRIVÉ",
    "LIVRE": "LIVRÉ",
    "LIVRÉ": "LIVRÉ",
    "REMIS AU BENEFICIAIRE": "REMIS AU BÉNÉFICIAIRE",
    "REMIS AU BÉNÉFICIAIRE": "REMIS AU BÉNÉFICIAIRE"
  };

  return correspondances[texte] || texte;
}
/**
 * ============================================================
 * 6. API WEB SÉCURISÉE POUR L’ESPACE AGENTS
 * ============================================================
 *//**

 * API Web sécurisée

 * Permet à l'application Agents de communiquer avec Apps Script.

 */

function doPost(e) {

  try {

    if (!e || !e.postData || !e.postData.contents) {

      return ContentService

        .createTextOutput(JSON.stringify({

          succes: false,

          erreur: "Aucune donnée reçue."

        }))

        .setMimeType(ContentService.MimeType.JSON);

    }

    const donnees = JSON.parse(e.postData.contents);
const CLE_API = PropertiesService
  .getScriptProperties()
  .getProperty("PAIEMENTS_AGENTS_API_KEY");

if (!donnees.apiKey || donnees.apiKey !== CLE_API) {
  return ContentService
    .createTextOutput(
      JSON.stringify({
        succes: false,
        erreur: "Clé API invalide."
      })
    )
    .setMimeType(ContentService.MimeType.JSON);
}
    switch (donnees.action) {
case "rechercherColis": {
  const destinationCode = String(
    donnees.destinationCode || ""
  )
    .trim()
    .toUpperCase();

  const codeColis = normaliserCodeColis_(
    donnees.codeColis
  );

  if (!["FIH", "LSHI", "KLZ"].includes(destinationCode)) {
    return ContentService
      .createTextOutput(
        JSON.stringify({
          succes: false,
          erreur: "Destination non valide."
        })
      )
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (!codeColis) {
    return ContentService
      .createTextOutput(
        JSON.stringify({
          succes: false,
          erreur: "Le code du colis est obligatoire."
        })
      )
      .setMimeType(ContentService.MimeType.JSON);
  }

  const resultat = rechercherColisSource(
    destinationCode,
    codeColis
  );

  if (
    !resultat ||
    !resultat.succes ||
    !resultat.colis
  ) {
    return ContentService
      .createTextOutput(
        JSON.stringify({
          succes: false,
          erreur:
            resultat && resultat.message
              ? resultat.message
              : "Colis introuvable."
        })
      )
      .setMimeType(ContentService.MimeType.JSON);
  }

  const colis = resultat.colis;

  return ContentService
    .createTextOutput(
      JSON.stringify({
        succes: true,
        colis: {
          codeColis: colis.codeColis,
          dateColis: colis.dateColis,
          poidsKg: colis.poidsKg,
          montantAttendu: colis.montantAttendu,
          statutColis: normaliserStatutColis_(
            colis.statutColis
          ),
          destinationCode: colis.agence,
          destinationNom: colis.destination
        }
      })
    )
    .setMimeType(ContentService.MimeType.JSON);
}
      case "enregistrerPaiement":

        return ContentService

          .createTextOutput(

            JSON.stringify(

              enregistrerPaiementAgent(donnees)

            )

          )

          .setMimeType(ContentService.MimeType.JSON);

      case "ping":

        return ContentService

          .createTextOutput(

            JSON.stringify({

              succes: true,

              message: "API Eben Ezer Business opérationnelle.",

              version: "1.0"

            })

          )

          .setMimeType(ContentService.MimeType.JSON);

      default:

        return ContentService

          .createTextOutput(

            JSON.stringify({

              succes: false,

              erreur: "Action inconnue."

            })

          )

          .setMimeType(ContentService.MimeType.JSON);

    }

  } catch (erreur) {

    return ContentService

      .createTextOutput(

        JSON.stringify({

          succes: false,

          erreur: erreur.toString()

        })

      )

      .setMimeType(ContentService.MimeType.JSON);

  }

}
/**
 * Test sécurisé de l’API.
 * Cette fonction vérifie seulement la connexion.
 * Aucun paiement n’est enregistré.
 */
function testerPingApi() {
  const proprietes = PropertiesService.getScriptProperties();

  const urlApi = proprietes.getProperty(
    "PAIEMENTS_AGENTS_API_URL"
  );

  const cleApi = proprietes.getProperty(
    "PAIEMENTS_AGENTS_API_KEY"
  );

  if (!urlApi) {
    throw new Error(
      "La propriété PAIEMENTS_AGENTS_API_URL est introuvable."
    );
  }

  if (!cleApi) {
    throw new Error(
      "La propriété PAIEMENTS_AGENTS_API_KEY est introuvable."
    );
  }

  const contenu = {
    action: "ping",
    apiKey: cleApi
  };

  const reponse = UrlFetchApp.fetch(urlApi, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(contenu),
    muteHttpExceptions: true
  });

  console.log("Code HTTP : " + reponse.getResponseCode());
  console.log("Réponse API : " + reponse.getContentText());
}
/**
 * Test sécurisé de la recherche d’un colis.
 * Aucun paiement n’est enregistré.
 */
function testerRechercheColisApi() {
  const proprietes = PropertiesService.getScriptProperties();

  const urlApi = proprietes.getProperty(
    "PAIEMENTS_AGENTS_API_URL"
  );

  const cleApi = proprietes.getProperty(
    "PAIEMENTS_AGENTS_API_KEY"
  );

  const contenu = {
    action: "rechercherColis",
    apiKey: cleApi,
    destinationCode: "FIH",
    codeColis: "MR14226"
  };

  const reponse = UrlFetchApp.fetch(urlApi, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(contenu),
    muteHttpExceptions: true
  });

  console.log("Code HTTP : " + reponse.getResponseCode());
  console.log("Réponse API : " + reponse.getContentText());
}
/**

 * Test local de doPost, sans passer par l’URL Web.

 * Aucun paiement n’est enregistré.

 */

function testerDoPostRechercheLocale() {
  const cleApi = PropertiesService
    .getScriptProperties()
    .getProperty("PAIEMENTS_AGENTS_API_KEY");

  const evenementTest = {
    postData: {
      contents: JSON.stringify({
        action: "rechercherColis",
        apiKey: cleApi,
        destinationCode: "FIH",
        codeColis: "MR14226"
      })
    }
  };

  const reponse = doPost(evenementTest);

  console.log(
    "Réponse locale doPost : " +
    reponse.getContent()
  );
}
  
  /**
 * API PAIEMENTS AGENTS - Entrées Web App sécurisées.
 *
 * À coller en bas de Code.gs.
 *
 * Script Property requise :
 * PAIEMENTS_AGENTS_API_KEY
 */

function doGet(e) {
  return reponseJsonPaiementsAgentsApi_({
    ok: true,
    service: 'paiements-agents',
    status: 'healthy'
  });
}

function doPost(e) {
  try {
    var body = lireJsonBodyPaiementsAgentsApi_(e);
    verifierCleApiPaiementsAgentsApi_(body);

    var action = normaliserTextePaiementsAgentsApi_(body.action);

    // Branche existante conservée sans modification fonctionnelle.
    if (action === 'rechercherColis') {
      var destinationCode = validerDestinationCodePaiementsAgentsApi_(
        body.destinationCode
      );
      var codeColis = validerCodeColisPaiementsAgentsApi_(
        body.codeColis
      );

      var resultatMetier =
        executerRechercheColisMetierPaiementsAgentsApi_(
          destinationCode,
          codeColis
        );

      var resultatPublic =
        filtrerReponseColisPourAgentPaiementsAgentsApi_(
          resultatMetier,
          destinationCode
        );

      if (!resultatPublic) {
        return reponseJsonPaiementsAgentsApi_({
          ok: false,
          found: false,
          code: 'COLIS_INTROUVABLE',
          message:
            'Aucun colis ne correspond à ce code pour la destination sélectionnée.'
        });
      }

      return reponseJsonPaiementsAgentsApi_({
        ok: true,
        found: true,
        data: resultatPublic
      });
    }

    // Nouvelle branche sécurisée d’enregistrement.
    if (action === 'enregistrerPaiement') {
      var donneesPaiement =
        construireDonneesPaiementAgentsApi_(body);

      var resultatPaiement =
        enregistrerPaiementAgent(donneesPaiement);

      return filtrerReponsePaiementAgentsApi_(
        resultatPaiement
      );
    }

    return erreurJsonPaiementsAgentsApi_(
      'ACTION_NON_AUTORISEE',
      'Action non autorisée.'
    );
  } catch (error) {
    return erreurJsonPaiementsAgentsApi_(
      error && error.publicCode
        ? error.publicCode
        : 'ERREUR_API',
      error && error.publicMessage
        ? error.publicMessage
        : 'Le service Agent ne peut pas traiter la demande pour le moment.'
    );
  }
}


/*
 * Coller les deux fonctions suivantes immédiatement après
 * executerRechercheColisMetierPaiementsAgentsApi_ et avant
 * lireJsonBodyPaiementsAgentsApi_.
 */

function executerRechercheColisMetierPaiementsAgentsApi_(destinationCode, codeColis) {
  return rechercherColisSource(destinationCode, codeColis);
}
function construireDonneesPaiementAgentsApi_(body) {
  var clesAutorisees = {
    action: true,
    apiKey: true,
    destinationCode: true,
    codeColis: true,
    agenceEncaissement: true,
    agent: true,
    modePaiement: true,
    referencePaiement: true,
    observation: true,
    montantPaye: true,
    simulation: true
  };

  Object.keys(body).forEach(function (cle) {
    if (!clesAutorisees[cle]) {
      throw creerErreurPubliquePaiementsAgentsApi_(
        'REQUETE_INVALIDE',
        'La requête contient une propriété non autorisée.'
      );
    }
  });

  var destinationCode =
    validerDestinationCodePaiementsAgentsApi_(
      body.destinationCode
    );

  var codeColis =
    validerCodeColisPaiementsAgentsApi_(
      body.codeColis
    );

  if (
    typeof body.montantPaye !== 'number' ||
    !isFinite(body.montantPaye) ||
    body.montantPaye <= 0
  ) {
    throw creerErreurPubliquePaiementsAgentsApi_(
      'MONTANT_INVALIDE',
      'Le montant payé est invalide.'
    );
  }

  if (
    typeof body.agenceEncaissement !== 'string' ||
    !body.agenceEncaissement.trim()
  ) {
    throw creerErreurPubliquePaiementsAgentsApi_(
      'AGENCE_INVALIDE',
      'Agence d’encaissement invalide.'
    );
  }

  var agenceEncaissement =
    body.agenceEncaissement.trim().toUpperCase();

  var agencesAutorisees = [
    'COO',
    'FIH',
    'LSHI',
    'KLZ'
  ];

var combinaisonAutorisee =
  agenceEncaissement === 'COO'
    ? ['FIH', 'LSHI', 'KLZ'].indexOf(destinationCode) !== -1
    : agenceEncaissement === destinationCode;

if (
  agencesAutorisees.indexOf(agenceEncaissement) === -1 ||
  !combinaisonAutorisee
) {
  throw creerErreurPubliquePaiementsAgentsApi_(
    'AGENCE_INVALIDE',
    'L’agence d’encaissement ne correspond pas à la destination autorisée.'
  );
}
  if (
    typeof body.agent !== 'string' ||
    !body.agent.trim()
  ) {
    throw creerErreurPubliquePaiementsAgentsApi_(
      'AGENT_INVALIDE',
      'Identité Agent invalide.'
    );
  }

  if (
    typeof body.modePaiement !== 'string' ||
    !body.modePaiement.trim()
  ) {
    throw creerErreurPubliquePaiementsAgentsApi_(
      'MODE_PAIEMENT_INVALIDE',
      'Mode de paiement invalide.'
    );
  }

  var modePaiement = body.modePaiement.trim();
  var modesPaiementAutorises = [
    'ESPECES',
    'MOBILE MONEY',
    'VIREMENT',
    'AUTRE'
  ];

  if (
    modesPaiementAutorises.indexOf(modePaiement) === -1
  ) {
    throw creerErreurPubliquePaiementsAgentsApi_(
      'MODE_PAIEMENT_INVALIDE',
      'Mode de paiement invalide.'
    );
  }

  if (typeof body.simulation !== 'boolean') {
    throw creerErreurPubliquePaiementsAgentsApi_(
      'SIMULATION_INVALIDE',
      'Paramètre de simulation invalide.'
    );
  }

  var referencePaiement = '';
  if (
    body.referencePaiement !== undefined &&
    body.referencePaiement !== null
  ) {
    if (typeof body.referencePaiement !== 'string') {
      throw creerErreurPubliquePaiementsAgentsApi_(
        'REQUETE_INVALIDE',
        'La référence de paiement est invalide.'
      );
    }

    referencePaiement =
      body.referencePaiement.trim();
  }

  var observation = '';
  if (
    body.observation !== undefined &&
    body.observation !== null
  ) {
    if (typeof body.observation !== 'string') {
      throw creerErreurPubliquePaiementsAgentsApi_(
        'REQUETE_INVALIDE',
        'L’observation est invalide.'
      );
    }

    observation = body.observation.trim();
  }

  // Seuls ces neuf champs sont transmis à la fonction métier.
  return {
    destinationCode: destinationCode,
    codeColis: codeColis,
    agenceEncaissement: agenceEncaissement,
    agent: body.agent.trim(),
    modePaiement: modePaiement,
    referencePaiement: referencePaiement,
    observation: observation,
    montantPaye: body.montantPaye,
    simulation: body.simulation
  };
}

function filtrerReponsePaiementAgentsApi_(
  resultatPaiement
) {
  if (
    !resultatPaiement ||
    typeof resultatPaiement !== 'object'
  ) {
    return reponseJsonPaiementsAgentsApi_({
      success: false,
      code: 'PAIEMENT_REFUSE',
      message:
        'Le paiement ne peut pas être traité.'
    });
  }

  if (resultatPaiement.succes !== true) {
    var codePublic = 'PAIEMENT_REFUSE';

    if (
      typeof resultatPaiement.code === 'string' &&
      /^[A-Z0-9_]{1,64}$/.test(
        resultatPaiement.code
      )
    ) {
      codePublic = resultatPaiement.code;
    }

    var messagePublic =
      'Le paiement a été refusé.';

    if (
      typeof resultatPaiement.message === 'string' &&
      resultatPaiement.message.trim()
    ) {
      messagePublic =
        resultatPaiement.message
          .trim()
          .substring(0, 300);
    }

    return reponseJsonPaiementsAgentsApi_({
      success: false,
      code: codePublic,
      message: messagePublic
    });
  }

  var paiement = resultatPaiement.paiement;

  if (
    !paiement ||
    typeof paiement !== 'object'
  ) {
    return reponseJsonPaiementsAgentsApi_({
      success: false,
      code: 'REPONSE_PAIEMENT_INVALIDE',
      message:
        'La confirmation du paiement est indisponible.'
    });
  }

  var champsObligatoires = [
    'codeColis',
    'destinationCode',
    'destinationNom',
    'montantPaye',
    'nouveauTotalPaye',
    'soldeRestant',
    'statutPaiement',
    'dateEtHeure'
  ];

  for (
    var index = 0;
    index < champsObligatoires.length;
    index++
  ) {
    var nomChamp = champsObligatoires[index];

    if (
      paiement[nomChamp] === undefined ||
      paiement[nomChamp] === null ||
      paiement[nomChamp] === ''
    ) {
      return reponseJsonPaiementsAgentsApi_({
        success: false,
        code: 'REPONSE_PAIEMENT_INVALIDE',
        message:
          'La confirmation du paiement est incomplète.'
      });
    }
  }

  return reponseJsonPaiementsAgentsApi_({
    success: true,
    simulation:
      resultatPaiement.simulation === true,
    paiement: {
      codeColis: paiement.codeColis,
      destinationCode:
        paiement.destinationCode,
      destinationNom:
        paiement.destinationNom,
      montantPaye:
        paiement.montantPaye,
      nouveauTotalPaye:
        paiement.nouveauTotalPaye,
      nouveauSolde:
        paiement.soldeRestant,
      statutPaiement:
        paiement.statutPaiement === 'SOLDÉ'
          ? 'SOLDE'
          : paiement.statutPaiement ===
              'PARTIELLEMENT PAYÉ'
            ? 'PARTIELLEMENT PAYE'
            : paiement.statutPaiement,
      datePaiement:
        paiement.dateEtHeure
    }
  });
}

function lireJsonBodyPaiementsAgentsApi_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw creerErreurPubliquePaiementsAgentsApi_('REQUETE_INVALIDE', 'Requête invalide.');
  }

  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || typeof body !== 'object') {
      throw new Error('Body non objet');
    }
    return body;
  } catch (error) {
    throw creerErreurPubliquePaiementsAgentsApi_('JSON_INVALIDE', 'Format de requête invalide.');
  }
}

function verifierCleApiPaiementsAgentsApi_(body) {
  var cleAttendue = PropertiesService.getScriptProperties().getProperty('PAIEMENTS_AGENTS_API_KEY');
  var cleRecue = normaliserTextePaiementsAgentsApi_(body.apiKey);

  if (!cleAttendue || !cleRecue || cleRecue !== cleAttendue) {
    throw creerErreurPubliquePaiementsAgentsApi_('ACCES_REFUSE', 'Accès refusé.');
  }

  delete body.apiKey;
}

function validerDestinationCodePaiementsAgentsApi_(value) {
  var destinationCode = normaliserTextePaiementsAgentsApi_(value).toUpperCase();

  if (['COO', 'FIH', 'LSHI', 'KLZ'].indexOf(destinationCode) === -1) {
    throw creerErreurPubliquePaiementsAgentsApi_('DESTINATION_INVALIDE', 'Destination invalide.');
  }

  return destinationCode;
}

function validerCodeColisPaiementsAgentsApi_(value) {
  var codeColis = normaliserTextePaiementsAgentsApi_(value).toUpperCase();

  if (!/^[A-Z0-9-]{3,40}$/.test(codeColis)) {
    throw creerErreurPubliquePaiementsAgentsApi_('CODE_COLIS_INVALIDE', 'Code colis invalide.');
  }

  return codeColis;
}

function filtrerReponseColisPourAgentPaiementsAgentsApi_(resultatMetier, destinationCode) {
  if (!resultatMetier || resultatMetier.success === false) {
    return null;
  }

  var source = resultatMetier.colis;
  if (!source) {
    return null;
  }

  return {
    codeColis: valeurPubliquePaiementsAgentsApi_(source.codeColis),
    dateColis: valeurPubliquePaiementsAgentsApi_(source.dateColis),
    destinationCode: destinationCode,
    destinationNom: valeurPubliquePaiementsAgentsApi_(source.destination) || destinationNomPaiementsAgentsApi_(destinationCode),
    poidsKg: nombrePublicPaiementsAgentsApi_(source.poidsKg),
    montantAttendu: nombrePublicPaiementsAgentsApi_(source.montantAttendu),
    statutColis: valeurPubliquePaiementsAgentsApi_(source.statutColis)
  };
}

function destinationNomPaiementsAgentsApi_(destinationCode) {
  var destinations = {
    COO: 'Cotonou',
    FIH: 'Kinshasa',
    LSHI: 'Lubumbashi',
    KLZ: 'Kolwezi'
  };

  return destinations[destinationCode] || destinationCode;
}

function valeurPubliquePaiementsAgentsApi_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function nombrePublicPaiementsAgentsApi_(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  var normalized = String(value).replace(',', '.').replace(/\s/g, '');
  var parsed = Number(normalized);

  return isFinite(parsed) ? parsed : 0;
}

function normaliserTextePaiementsAgentsApi_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function reponseJsonPaiementsAgentsApi_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function erreurJsonPaiementsAgentsApi_(code, message) {
  return reponseJsonPaiementsAgentsApi_({
    ok: false,
    found: false,
    code: code,
    message: message
  });
}

function creerErreurPubliquePaiementsAgentsApi_(code, message) {
  var error = new Error(message);
  error.publicCode = code;
  error.publicMessage = message;
  return error;
}

/**
 * ============================================================
 * STATISTIQUES SÉPARÉES DES PAIEMENTS AGENTS
 * ============================================================
 *
 * Reconstruit :
 * - STAT FIH
 * - STAT LSHI
 * - STAT KLZ
 * - STAT COO
 * - TOTAL STATS
 *
 * Les feuilles sources ne sont jamais modifiées.
 */
function reconstruireStatistiquesSepareesPaiementsAgents() {
  const classeur =
    SpreadsheetApp.getActiveSpreadsheet();

  const fuseauHoraire =
    classeur.getSpreadsheetTimeZone() ||
    "Africa/Porto-Novo";

  const destinations = [
    "FIH",
    "LSHI",
    "KLZ"
  ];

  /*
   * Normalise les variantes autorisées
   * de la destination réelle.
   */
  const normaliserDestination = (
    valeur
  ) => {
    const texte = String(valeur || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, " / ");

    const correspondances = {
      "FIH": "FIH",
      "KINSHASA": "FIH",
      "FIH / KINSHASA": "FIH",

      "LSHI": "LSHI",
      "LUBUMBASHI": "LSHI",
      "LSHI / LUBUMBASHI": "LSHI",

      "KLZ": "KLZ",
      "KOLWEZI": "KLZ",
      "KLZ / KOLWEZI": "KLZ"
    };

    return correspondances[texte] || "";
  };

  /*
   * Transforme une date complète en clé de date civile.
   */
  const obtenirCleDate = (
    datePaiement
  ) => {
    if (
      !(datePaiement instanceof Date) ||
      !Number.isFinite(
        datePaiement.getTime()
      )
    ) {
      return "";
    }

    return Utilities.formatDate(
      datePaiement,
      fuseauHoraire,
      "yyyy-MM-dd"
    );
  };

  /*
   * Recrée une date Google Sheets depuis une clé yyyy-MM-dd.
   */
  const creerDateFeuille = (
    cleDate
  ) => {
    const morceaux =
      cleDate.split("-").map(Number);

    return new Date(
      morceaux[0],
      morceaux[1] - 1,
      morceaux[2],
      12,
      0,
      0
    );
  };

  /*
   * Retourne le format monétaire de la colonne E
   * d’une feuille source.
   */
  const obtenirFormatMonetaire = (
    nomFeuilleSource
  ) => {
    const feuilleSource =
      classeur.getSheetByName(
        nomFeuilleSource
      );

    if (
      feuilleSource &&
      feuilleSource.getMaxRows() >= 2
    ) {
      const format = feuilleSource
        .getRange(2, 5)
        .getNumberFormat();

      if (format) {
        return format;
      }
    }

    return "$0.00";
  };

  /*
   * Lit A à H en une seule opération.
   *
   * Colonnes utilisées :
   * A = Date et heure
   * B = Code colis
   * C = Poids
   * E = Montant payé
   * H = Destination réelle
   */
  const lireLignesPaiement = (
    nomFeuilleSource
  ) => {
    const feuilleSource =
      classeur.getSheetByName(
        nomFeuilleSource
      );

    if (
      !feuilleSource ||
      feuilleSource.getLastRow() < 2
    ) {
      return [];
    }

    return feuilleSource
      .getRange(
        2,
        1,
        feuilleSource.getLastRow() - 1,
        8
      )
      .getValues();
  };

  /*
   * Calcule les statistiques d’une agence de destination.
   */
  const calculerStatistiquesAgence = (
    nomAgence
  ) => {
    const statistiques = {};

    lireLignesPaiement(
      nomAgence
    ).forEach((ligne) => {
      const cleDate =
        obtenirCleDate(ligne[0]);

      const codeColis =
        normaliserCodeColis_(ligne[1]);

      const poidsKg = ligne[2];
      const montantPaye = ligne[4];

      if (
        !cleDate ||
        !codeColis ||
        typeof poidsKg !== "number" ||
        !Number.isFinite(poidsKg) ||
        typeof montantPaye !== "number" ||
        !Number.isFinite(montantPaye)
      ) {
        return;
      }

      if (!statistiques[cleDate]) {
        statistiques[cleDate] = {
          montant: 0,
          poidsKg: 0,
          codesPoidsComptes: new Set()
        };
      }

      /*
       * Tous les paiements partiels contribuent
       * au montant journalier.
       */
      statistiques[cleDate].montant +=
        montantPaye;

      /*
       * Le poids d’un colis n’est compté
       * qu’une seule fois dans la journée.
       */
      if (
        !statistiques[
          cleDate
        ].codesPoidsComptes.has(codeColis)
      ) {
        statistiques[cleDate].poidsKg +=
          poidsKg;

        statistiques[
          cleDate
        ].codesPoidsComptes.add(codeColis);
      }
    });

    return statistiques;
  };

  /*
   * Calcule les statistiques COO ventilées
   * selon la destination réelle.
   */
  const calculerStatistiquesCOO = () => {
    const statistiques = {};

    lireLignesPaiement(
      "COO"
    ).forEach((ligne) => {
      const cleDate =
        obtenirCleDate(ligne[0]);

      const codeColis =
        normaliserCodeColis_(ligne[1]);

      const poidsKg = ligne[2];
      const montantPaye = ligne[4];

      const destinationCode =
        normaliserDestination(ligne[7]);

      if (
        !cleDate ||
        !codeColis ||
        !destinations.includes(
          destinationCode
        ) ||
        typeof poidsKg !== "number" ||
        !Number.isFinite(poidsKg) ||
        typeof montantPaye !== "number" ||
        !Number.isFinite(montantPaye)
      ) {
        return;
      }

      if (!statistiques[cleDate]) {
        statistiques[cleDate] = {
          FIH: {
            montant: 0,
            poidsKg: 0,
            codesPoidsComptes: new Set()
          },
          LSHI: {
            montant: 0,
            poidsKg: 0,
            codesPoidsComptes: new Set()
          },
          KLZ: {
            montant: 0,
            poidsKg: 0,
            codesPoidsComptes: new Set()
          }
        };
      }

      const statistiquesDestination =
        statistiques[cleDate][
          destinationCode
        ];

      /*
       * Tous les paiements sont additionnés.
       */
      statistiquesDestination.montant +=
        montantPaye;

      /*
       * Le poids est unique par date,
       * destination et code colis.
       */
      if (
        !statistiquesDestination
          .codesPoidsComptes
          .has(codeColis)
      ) {
        statistiquesDestination.poidsKg +=
          poidsKg;

        statistiquesDestination
          .codesPoidsComptes
          .add(codeColis);
      }
    });

    return statistiques;
  };

  /*
   * Prépare ou crée une feuille statistique,
   * sans modifier une feuille source.
   */
  const preparerFeuilleStatistique = (
    nomFeuille
  ) => {
    let feuille =
      classeur.getSheetByName(
        nomFeuille
      );

    if (!feuille) {
      feuille =
        classeur.insertSheet(
          nomFeuille
        );
    }

    const filtreExistant =
      feuille.getFilter();

    if (filtreExistant) {
      filtreExistant.remove();
    }

    /*
     * Seul le contenu de la feuille statistique
     * est reconstruit.
     */
    feuille
      .getDataRange()
      .clearContent();

    return feuille;
  };

  /*
   * Écrit et formate une feuille statistique.
   */
  const ecrireFeuilleStatistique = (
    nomFeuille,
    entetes,
    lignes,
    colonnesMontant,
    colonnesKg,
    formatMonetaire
  ) => {
    const feuille =
      preparerFeuilleStatistique(
        nomFeuille
      );

    const nombreColonnes =
      entetes.length;

    const lignesNecessaires =
      lignes.length + 1;

    if (
      feuille.getMaxRows() <
      lignesNecessaires
    ) {
      feuille.insertRowsAfter(
        feuille.getMaxRows(),
        lignesNecessaires -
          feuille.getMaxRows()
      );
    }

    if (
      feuille.getMaxColumns() <
      nombreColonnes
    ) {
      feuille.insertColumnsAfter(
        feuille.getMaxColumns(),
        nombreColonnes -
          feuille.getMaxColumns()
      );
    }

    feuille
      .getRange(
        1,
        1,
        1,
        nombreColonnes
      )
      .setValues([entetes])
      .setFontWeight("bold")
      .setFontColor("#FFFFFF")
      .setBackground("#06152F")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");

    feuille.setFrozenRows(1);
    feuille.setRowHeight(1, 36);

    if (lignes.length > 0) {
      feuille
        .getRange(
          2,
          1,
          lignes.length,
          nombreColonnes
        )
        .setValues(lignes);

      feuille
        .getRange(
          2,
          1,
          lignes.length,
          1
        )
        .setNumberFormat(
          "dd/MM/yyyy"
        );

      colonnesMontant.forEach(
        (numeroColonne) => {
          feuille
            .getRange(
              2,
              numeroColonne,
              lignes.length,
              1
            )
            .setNumberFormat(
              formatMonetaire
            );
        }
      );

      colonnesKg.forEach(
        (numeroColonne) => {
          feuille
            .getRange(
              2,
              numeroColonne,
              lignes.length,
              1
            )
            .setNumberFormat("0.00");
        }
      );
    }

    feuille.autoResizeColumns(
      1,
      nombreColonnes
    );

    return feuille;
  };

  /*
   * Place une feuille statistique immédiatement
   * après sa feuille de référence.
   */
  const deplacerFeuilleApres = (
    nomFeuille,
    nomFeuilleReference
  ) => {
    const feuille =
      classeur.getSheetByName(
        nomFeuille
      );

    const feuilleReference =
      classeur.getSheetByName(
        nomFeuilleReference
      );

    if (
      !feuille ||
      !feuilleReference
    ) {
      return;
    }

    classeur.setActiveSheet(feuille);

    classeur.moveActiveSheet(
      feuilleReference.getIndex() + 1
    );
  };

  const statistiquesFIH =
    calculerStatistiquesAgence("FIH");

  const statistiquesLSHI =
    calculerStatistiquesAgence("LSHI");

  const statistiquesKLZ =
    calculerStatistiquesAgence("KLZ");

  const statistiquesCOO =
    calculerStatistiquesCOO();

  /*
   * Construction de STAT FIH.
   */
  const lignesFIH = Object.keys(
    statistiquesFIH
  )
    .sort()
    .map((cleDate) => [
      creerDateFeuille(cleDate),
      statistiquesFIH[cleDate].montant,
      statistiquesFIH[cleDate].poidsKg
    ]);

  ecrireFeuilleStatistique(
    "STAT FIH",
    [
      "Date",
      "Montant total encaissé à FIH",
      "Kg concernés à FIH"
    ],
    lignesFIH,
    [2],
    [3],
    obtenirFormatMonetaire("FIH")
  );

  /*
   * Construction de STAT LSHI.
   */
  const lignesLSHI = Object.keys(
    statistiquesLSHI
  )
    .sort()
    .map((cleDate) => [
      creerDateFeuille(cleDate),
      statistiquesLSHI[cleDate].montant,
      statistiquesLSHI[cleDate].poidsKg
    ]);

  ecrireFeuilleStatistique(
    "STAT LSHI",
    [
      "Date",
      "Montant total encaissé à LSHI",
      "Kg concernés à LSHI"
    ],
    lignesLSHI,
    [2],
    [3],
    obtenirFormatMonetaire("LSHI")
  );

  /*
   * Construction de STAT KLZ.
   */
  const lignesKLZ = Object.keys(
    statistiquesKLZ
  )
    .sort()
    .map((cleDate) => [
      creerDateFeuille(cleDate),
      statistiquesKLZ[cleDate].montant,
      statistiquesKLZ[cleDate].poidsKg
    ]);

  ecrireFeuilleStatistique(
    "STAT KLZ",
    [
      "Date",
      "Montant total encaissé à KLZ",
      "Kg concernés à KLZ"
    ],
    lignesKLZ,
    [2],
    [3],
    obtenirFormatMonetaire("KLZ")
  );

  /*
   * Construction de STAT COO.
   */
  const lignesCOO = Object.keys(
    statistiquesCOO
  )
    .sort()
    .map((cleDate) => {
      const statistiques =
        statistiquesCOO[cleDate];

      const totalCOO =
        statistiques.FIH.montant +
        statistiques.LSHI.montant +
        statistiques.KLZ.montant;

      return [
        creerDateFeuille(cleDate),

        statistiques.FIH.montant,
        statistiques.FIH.poidsKg,

        statistiques.LSHI.montant,
        statistiques.LSHI.poidsKg,

        statistiques.KLZ.montant,
        statistiques.KLZ.poidsKg,

        totalCOO
      ];
    });

  ecrireFeuilleStatistique(
    "STAT COO",
    [
      "Date",
      "COO → FIH - Montant encaissé",
      "COO → FIH - Kg concernés",
      "COO → LSHI - Montant encaissé",
      "COO → LSHI - Kg concernés",
      "COO → KLZ - Montant encaissé",
      "COO → KLZ - Kg concernés",
      "Total encaissé à COO"
    ],
    lignesCOO,
    [2, 4, 6, 8],
    [3, 5, 7],
    obtenirFormatMonetaire("COO")
  );

  /*
   * Union de toutes les dates présentes.
   * Une date absente d’une statistique vaut zéro.
   */
  const toutesLesDates = new Set([
    ...Object.keys(statistiquesFIH),
    ...Object.keys(statistiquesLSHI),
    ...Object.keys(statistiquesKLZ),
    ...Object.keys(statistiquesCOO)
  ]);

  const lignesTotal = Array.from(
    toutesLesDates
  )
    .sort()
    .map((cleDate) => {
      const montantFIH =
        statistiquesFIH[cleDate]
          ? statistiquesFIH[cleDate].montant
          : 0;

      const montantLSHI =
        statistiquesLSHI[cleDate]
          ? statistiquesLSHI[cleDate].montant
          : 0;

      const montantKLZ =
        statistiquesKLZ[cleDate]
          ? statistiquesKLZ[cleDate].montant
          : 0;

      const statistiqueCOO =
        statistiquesCOO[cleDate];

      const montantCOO =
        statistiqueCOO
          ? statistiqueCOO.FIH.montant +
            statistiqueCOO.LSHI.montant +
            statistiqueCOO.KLZ.montant
          : 0;

      return [
        creerDateFeuille(cleDate),
        montantFIH,
        montantLSHI,
        montantKLZ,
        montantCOO,
        montantFIH +
          montantLSHI +
          montantKLZ +
          montantCOO
      ];
    });

  ecrireFeuilleStatistique(
    "TOTAL STATS",
    [
      "Date",
      "Total encaissé à FIH",
      "Total encaissé à LSHI",
      "Total encaissé à KLZ",
      "Total encaissé à COO",
      "Total général encaissé"
    ],
    lignesTotal,
    [2, 3, 4, 5, 6],
    [],
    obtenirFormatMonetaire("FIH")
  );

  /*
   * Les feuilles sources ne sont pas déplacées.
   * Seules les feuilles statistiques sont placées
   * après leur feuille de référence actuelle.
   */
  deplacerFeuilleApres(
    "STAT FIH",
    "FIH"
  );

  deplacerFeuilleApres(
    "STAT LSHI",
    "LSHI"
  );

  deplacerFeuilleApres(
    "STAT KLZ",
    "KLZ"
  );

  deplacerFeuilleApres(
    "STAT COO",
    "COO"
  );

  deplacerFeuilleApres(
    "TOTAL STATS",
    "STAT COO"
  );

  classeur.toast(
    "STAT FIH, STAT LSHI, STAT KLZ, " +
      "STAT COO et TOTAL STATS ont été recalculées.",
    "Statistiques mises à jour",
    5
  );

  return {
    succes: true,
    feuillesReconstruites: [
      "STAT FIH",
      "STAT LSHI",
      "STAT KLZ",
      "STAT COO",
      "TOTAL STATS"
    ]
  };
}
