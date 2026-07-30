/**
 * PAIEMENTS AGENTS — moteur unifié préparatoire.
 *
 * Cette source locale n'est ni déployée ni reliée à la production.
 * Le manifeste est consulté en lecture seule. Un paiement n'altère jamais
 * le statut d'un colis et ne produit aucun événement de stock.
 */

const SOURCE_COLIS_ID =
  "13idZ5lGAZs8OQiaQe3nQinkRF0NRmxsg2BxcrNAE8LI";
const API_KEY_PROPERTY = "PAIEMENTS_AGENTS_API_KEY";
const CONTRACT_VERSION = "2";
const LOCK_TIMEOUT_MS = 20000;
const PAYMENT_REQUEST_ID_COLUMN = 16;
const PAYMENT_REQUEST_ID_HEADER = "Payment Request ID";

const DESTINATIONS_AUTORISEES = ["FIH", "LSHI", "KLZ"];
const AGENCES_ENCAISSEMENT = ["COO", "FIH", "LSHI", "KLZ"];
const MODES_PAIEMENT_AUTORISES = [
  "ESPECES",
  "MOBILE MONEY",
  "VIREMENT",
  "AUTRE"
];

const DESTINATION_NOMS = {
  FIH: "Kinshasa",
  LSHI: "Lubumbashi",
  KLZ: "Kolwezi"
};

const PAYMENT_HEADERS = [
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
  "Observation",
  PAYMENT_REQUEST_ID_HEADER
];

/**
 * Point d'entrée POST unique.
 */
function doPost(e) {
  var requestId = creerRequestId_();

  try {
    var body = lireCorpsJson_(e);
    verifierCleApi_(body.apiKey);
    delete body.apiKey;

    var action = normaliserAction_(body.action);

    switch (action) {
      case "ping":
        validerClesRequete_(body, ["action"]);
        return reponseSucces_(
          {
            service: "paiements-agents",
            status: "available",
            contractVersion: CONTRACT_VERSION
          },
          requestId,
          "ping"
        );

      case "rechercherColis":
        validerClesRequete_(body, [
          "action",
          "destinationCode",
          "codeColis"
        ]);
        return reponseSucces_(
          rechercherColisPublic_(
            validerDestination_(body.destinationCode),
            validerCodeColis_(body.codeColis)
          ),
          requestId,
          "rechercherColis"
        );

      case "enregistrerPaiement":
        validerClesRequete_(body, [
          "action",
          "destinationCode",
          "codeColis",
          "agenceEncaissement",
          "agent",
          "modePaiement",
          "referencePaiement",
          "observation",
          "montantPaye",
          "simulation",
          "paymentRequestId"
        ]);
        return reponseSucces_(
          enregistrerPaiementUnifie_(
            construirePaiementValide_(body)
          ),
          requestId,
          "enregistrerPaiement"
        );

      default:
        throw erreurPublique_(
          "ACTION_NON_AUTORISEE",
          "Action non autorisée."
        );
    }
  } catch (error) {
    return reponseErreur_(
      codeErreurPublic_(error),
      messageErreurPublic_(error),
      requestId
    );
  }
}

function lireCorpsJson_(e) {
  if (
    !e ||
    !e.postData ||
    typeof e.postData.contents !== "string" ||
    !e.postData.contents
  ) {
    throw erreurPublique_(
      "REQUETE_INVALIDE",
      "Requête invalide."
    );
  }

  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    throw erreurPublique_(
      "JSON_INVALIDE",
      "Format JSON invalide."
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw erreurPublique_(
      "REQUETE_INVALIDE",
      "Requête invalide."
    );
  }

  return body;
}

function verifierCleApi_(cleRecue) {
  var cleAttendue = PropertiesService
    .getScriptProperties()
    .getProperty(API_KEY_PROPERTY);

  if (
    typeof cleAttendue !== "string" ||
    typeof cleRecue !== "string" ||
    !comparaisonTempsConstant_(cleAttendue, cleRecue)
  ) {
    throw erreurPublique_(
      "ACCES_REFUSE",
      "Accès refusé."
    );
  }
}

function comparaisonTempsConstant_(attendue, recue) {
  var longueur = Math.max(attendue.length, recue.length);
  var difference = attendue.length ^ recue.length;

  for (var index = 0; index < longueur; index += 1) {
    difference |=
      (attendue.charCodeAt(index) || 0) ^
      (recue.charCodeAt(index) || 0);
  }

  return difference === 0;
}

function normaliserAction_(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function validerClesRequete_(body, clesAutorisees) {
  var autorisees = {};
  clesAutorisees.forEach(function (cle) {
    autorisees[cle] = true;
  });

  Object.keys(body).forEach(function (cle) {
    if (!autorisees[cle]) {
      throw erreurPublique_(
        "REQUETE_INVALIDE",
        "La requête contient une propriété non autorisée."
      );
    }
  });
}

function rechercherColisPublic_(destinationCode, codeColis) {
  var colis = rechercherColisSource_(destinationCode, codeColis);

  if (!colis) {
    throw erreurPublique_(
      "COLIS_INTROUVABLE",
      "Colis introuvable."
    );
  }

  var montantAttendu = arrondirMontant_(
    convertirNombre_(colis.montantAttendu)
  );
  var montantPaye = calculerTotalDejaPaye_(
    codeColis,
    destinationCode
  );

  return {
    codeColis: valeurPublique_(colis.codeColis),
    destinationCode: destinationCode,
    destinationNom: DESTINATION_NOMS[destinationCode],
    dateColis: valeurPublique_(colis.dateColis),
    poidsKg: convertirNombre_(colis.poidsKg),
    montantAttendu: montantAttendu,
    montantPaye: montantPaye,
    solde: arrondirMontant_(
      Math.max(0, montantAttendu - montantPaye)
    ),
    statutColis: valeurPublique_(colis.statutColis)
  };
}

function rechercherColisSource_(destinationCode, codeColis) {
  var classeurSource = SpreadsheetApp.openById(SOURCE_COLIS_ID);
  var feuilleSource = classeurSource.getSheetByName(destinationCode);

  if (!feuilleSource) {
    throw erreurPublique_(
      "SERVICE_INDISPONIBLE",
      "Service indisponible."
    );
  }

  var derniereLigne = feuilleSource.getLastRow();
  if (derniereLigne < 2) {
    return null;
  }

  var nombreLignes = derniereLigne - 1;
  var codes = feuilleSource
    .getRange(2, 2, nombreLignes, 1)
    .getDisplayValues();

  for (var index = nombreLignes - 1; index >= 0; index -= 1) {
    if (normaliserCodeColis_(codes[index][0]) === codeColis) {
      var ligne = index + 2;
      var poidsEtMontant = feuilleSource
        .getRange(ligne, 5, 1, 2)
        .getDisplayValues()[0];

      return {
        dateColis: feuilleSource
          .getRange(ligne, 1)
          .getDisplayValue(),
        codeColis: codes[index][0],
        poidsKg: poidsEtMontant[0],
        montantAttendu: poidsEtMontant[1],
        statutColis: feuilleSource
          .getRange(ligne, 9)
          .getDisplayValue()
      };
    }
  }

  return null;
}

function construirePaiementValide_(body) {
  var destinationCode = validerDestination_(body.destinationCode);
  var codeColis = validerCodeColis_(body.codeColis);
  var agenceEncaissement = normaliserAgence_(
    body.agenceEncaissement
  );

  if (
    AGENCES_ENCAISSEMENT.indexOf(agenceEncaissement) === -1
  ) {
    throw erreurPublique_(
      "AGENCE_INVALIDE",
      "Agence d’encaissement invalide."
    );
  }

  var circuitAutorise =
    agenceEncaissement === "COO" ||
    agenceEncaissement === destinationCode;

  if (!circuitAutorise) {
    throw erreurPublique_(
      "AGENCE_INVALIDE",
      "Agence d’encaissement invalide."
    );
  }

  if (
    typeof body.agent !== "string" ||
    !body.agent.trim() ||
    body.agent.trim().length > 120
  ) {
    throw erreurPublique_(
      "AGENT_INVALIDE",
      "Identité Agent invalide."
    );
  }

  var modePaiement = normaliserModePaiement_(
    body.modePaiement
  );
  if (
    MODES_PAIEMENT_AUTORISES.indexOf(modePaiement) === -1
  ) {
    throw erreurPublique_(
      "MODE_PAIEMENT_INVALIDE",
      "Mode de paiement invalide."
    );
  }

  var montantPaye = body.montantPaye;
  if (
    typeof montantPaye !== "number" ||
    !isFinite(montantPaye) ||
    montantPaye <= 0 ||
    Math.abs(
      montantPaye * 100 - Math.round(montantPaye * 100)
    ) > 0.000000001
  ) {
    throw erreurPublique_(
      "MONTANT_INVALIDE",
      "Montant invalide."
    );
  }

  var paymentRequestId = normaliserPaymentRequestId_(
    body.paymentRequestId
  );

  if (
    body.simulation !== undefined &&
    typeof body.simulation !== "boolean"
  ) {
    throw erreurPublique_(
      "REQUETE_INVALIDE",
      "Requête invalide."
    );
  }

  return {
    destinationCode: destinationCode,
    codeColis: codeColis,
    agenceEncaissement: agenceEncaissement,
    agent: body.agent.trim(),
    modePaiement: modePaiement,
    montantPaye: arrondirMontant_(montantPaye),
    referencePaiement: validerTexteOptionnel_(
      body.referencePaiement,
      200
    ),
    observation: validerTexteOptionnel_(
      body.observation,
      500
    ),
    simulation: body.simulation === true,
    paymentRequestId: paymentRequestId
  };
}

function enregistrerPaiementUnifie_(paiement) {
  var verrou = LockService.getScriptLock();
  var verrouObtenu = false;

  try {
    verrouObtenu = verrou.tryLock(LOCK_TIMEOUT_MS);
    if (!verrouObtenu) {
      throw erreurPublique_(
        "VERROU_INDISPONIBLE",
        "Le service est temporairement occupé."
      );
    }

    var classeur = SpreadsheetApp.getActiveSpreadsheet();
    validerStructurePaiements_(classeur);

    if (
      trouverPaymentRequestId_(
        classeur,
        paiement.paymentRequestId
      )
    ) {
      throw erreurPublique_(
        "PAIEMENT_DEJA_ENREGISTRE",
        "Ce paiement a déjà été enregistré."
      );
    }

    var colis = rechercherColisSource_(
      paiement.destinationCode,
      paiement.codeColis
    );
    if (!colis) {
      throw erreurPublique_(
        "COLIS_INTROUVABLE",
        "Colis introuvable."
      );
    }

    var montantAttendu = arrondirMontant_(
      convertirNombre_(colis.montantAttendu)
    );
    if (montantAttendu <= 0) {
      throw erreurPublique_(
        "SERVICE_INDISPONIBLE",
        "Service indisponible."
      );
    }

    var totalDejaPaye = calculerTotalDejaPaye_(
      paiement.codeColis,
      paiement.destinationCode,
      classeur
    );
    var soldeAvant = arrondirMontant_(
      montantAttendu - totalDejaPaye
    );

    if (paiement.montantPaye > soldeAvant) {
      throw erreurPublique_(
        "MONTANT_SUPERIEUR_AU_SOLDE",
        "Le montant dépasse le solde restant."
      );
    }

    if (
      paiement.agenceEncaissement !== "COO" &&
      paiement.montantPaye !== soldeAvant
    ) {
      throw erreurPublique_(
        "PAIEMENT_PARTIEL_NON_AUTORISE",
        "Le paiement partiel n’est pas autorisé dans cette agence."
      );
    }

    var nouveauTotal = arrondirMontant_(
      totalDejaPaye + paiement.montantPaye
    );
    var nouveauSolde = arrondirMontant_(
      montantAttendu - nouveauTotal
    );
    var resultat = {
      paymentRequestId: paiement.paymentRequestId,
      simulation: paiement.simulation,
      paiement: {
        codeColis: valeurPublique_(colis.codeColis),
        destinationCode: paiement.destinationCode,
        destinationNom:
          DESTINATION_NOMS[paiement.destinationCode],
        montantPaye: paiement.montantPaye,
        nouveauTotalPaye: nouveauTotal,
        soldeRestant: nouveauSolde,
        statutPaiement:
          nouveauSolde === 0
            ? "SOLDE"
            : "PARTIELLEMENT_PAYE",
        datePaiement: new Date().toISOString()
      }
    };

    if (paiement.simulation) {
      return resultat;
    }

    var feuillePaiement = classeur.getSheetByName(
      paiement.agenceEncaissement
    );
    var prochaineLigne = feuillePaiement.getLastRow() + 1;
    var valeurs = [
      new Date(),
      valeurPublique_(colis.codeColis),
      convertirNombre_(colis.poidsKg),
      montantAttendu,
      paiement.montantPaye,
      nouveauSolde,
      paiement.agenceEncaissement,
      paiement.destinationCode +
        " / " +
        DESTINATION_NOMS[paiement.destinationCode],
      nouveauSolde === 0
        ? "SOLDÉ"
        : "PARTIELLEMENT PAYÉ",
      paiement.agent,
      paiement.modePaiement === "ESPECES"
        ? "ESPÈCES"
        : paiement.modePaiement,
      paiement.referencePaiement,
      valeurPublique_(colis.dateColis),
      valeurPublique_(colis.statutColis),
      paiement.observation,
      paiement.paymentRequestId
    ];

    feuillePaiement
      .getRange(prochaineLigne, 1, 1, PAYMENT_HEADERS.length)
      .setValues([valeurs]);
    SpreadsheetApp.flush();

    return resultat;
  } catch (error) {
    if (error && error.publicCode) {
      throw error;
    }
    throw erreurPublique_(
      "ERREUR_INTERNE",
      "Une erreur interne empêche le traitement."
    );
  } finally {
    if (verrouObtenu) {
      verrou.releaseLock();
    }
  }
}

function validerStructurePaiements_(classeur) {
  AGENCES_ENCAISSEMENT.forEach(function (nomFeuille) {
    var feuille = classeur.getSheetByName(nomFeuille);
    if (!feuille) {
      throw erreurPublique_(
        "STRUCTURE_FEUILLE_INVALIDE",
        "Structure de feuille invalide."
      );
    }

    var entetes = feuille
      .getRange(1, 1, 1, PAYMENT_HEADERS.length)
      .getDisplayValues()[0];

    for (var index = 0; index < PAYMENT_HEADERS.length; index += 1) {
      if (
        String(entetes[index] || "").trim() !==
        PAYMENT_HEADERS[index]
      ) {
        throw erreurPublique_(
          "STRUCTURE_FEUILLE_INVALIDE",
          "Structure de feuille invalide."
        );
      }
    }
  });
}

function trouverPaymentRequestId_(classeur, paymentRequestId) {
  return AGENCES_ENCAISSEMENT.some(function (nomFeuille) {
    var feuille = classeur.getSheetByName(nomFeuille);
    var derniereLigne = feuille.getLastRow();
    if (derniereLigne < 2) {
      return false;
    }

    return feuille
      .getRange(
        2,
        PAYMENT_REQUEST_ID_COLUMN,
        derniereLigne - 1,
        1
      )
      .getDisplayValues()
      .some(function (ligne) {
        return (
          String(ligne[0] || "").trim().toLowerCase() ===
          paymentRequestId
        );
      });
  });
}

function calculerTotalDejaPaye_(
  codeColis,
  destinationCode,
  classeurOptionnel
) {
  var classeur =
    classeurOptionnel || SpreadsheetApp.getActiveSpreadsheet();
  var total = 0;

  AGENCES_ENCAISSEMENT.forEach(function (nomFeuille) {
    var feuille = classeur.getSheetByName(nomFeuille);
    if (!feuille || feuille.getLastRow() < 2) {
      return;
    }

    var lignes = feuille
      .getRange(2, 2, feuille.getLastRow() - 1, 7)
      .getValues();

    lignes.forEach(function (ligne) {
      var destination = String(ligne[6] || "")
        .trim()
        .toUpperCase();
      if (
        normaliserCodeColis_(ligne[0]) === codeColis &&
        (
          destination === destinationCode ||
          destination.indexOf(destinationCode + " /") === 0
        )
      ) {
        total += convertirNombre_(ligne[3]);
      }
    });
  });

  return arrondirMontant_(total);
}

function validerDestination_(value) {
  if (typeof value !== "string") {
    throw erreurPublique_(
      "DESTINATION_INVALIDE",
      "Destination invalide."
    );
  }
  var destination = value.trim().toUpperCase();
  if (DESTINATIONS_AUTORISEES.indexOf(destination) === -1) {
    throw erreurPublique_(
      "DESTINATION_INVALIDE",
      "Destination invalide."
    );
  }
  return destination;
}

function validerCodeColis_(value) {
  var code = normaliserCodeColis_(value);
  if (!/^[A-Z0-9-]{3,40}$/.test(code)) {
    throw erreurPublique_(
      "CODE_COLIS_INVALIDE",
      "Code colis invalide."
    );
  }
  return code;
}

function normaliserCodeColis_(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function normaliserAgence_(value) {
  if (typeof value !== "string") {
    return "";
  }
  var agence = value.trim().toUpperCase();
  return agence === "COTONOU" ? "COO" : agence;
}

function normaliserModePaiement_(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normaliserPaymentRequestId_(value) {
  if (typeof value !== "string") {
    throw erreurPublique_(
      "PAYMENT_REQUEST_ID_INVALIDE",
      "Identifiant de paiement invalide."
    );
  }
  var requestId = value.trim().toLowerCase();
  if (
    requestId.length !== 36 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      requestId
    )
  ) {
    throw erreurPublique_(
      "PAYMENT_REQUEST_ID_INVALIDE",
      "Identifiant de paiement invalide."
    );
  }
  return requestId;
}

function validerTexteOptionnel_(value, longueurMaximale) {
  if (value === undefined || value === null) {
    return "";
  }
  if (
    typeof value !== "string" ||
    value.trim().length > longueurMaximale
  ) {
    throw erreurPublique_(
      "REQUETE_INVALIDE",
      "Requête invalide."
    );
  }
  return value.trim();
}

function convertirNombre_(value) {
  if (typeof value === "number") {
    return isFinite(value) ? value : 0;
  }
  var texte = String(value || "")
    .trim()
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");

  if (texte.indexOf(",") !== -1 && texte.indexOf(".") !== -1) {
    texte = texte.replace(/\./g, "").replace(",", ".");
  } else {
    texte = texte.replace(",", ".");
  }

  var nombre = Number(texte);
  return isFinite(nombre) ? nombre : 0;
}

function arrondirMontant_(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function valeurPublique_(value) {
  return value === null || value === undefined
    ? ""
    : String(value).trim();
}

function creerRequestId_() {
  return String(Utilities.getUuid()).toLowerCase();
}

function reponseSucces_(data, requestId, action) {
  var payload = {
    ok: true,
    data: data,
    requestId: requestId
  };

  // Compatibilité temporaire, dérivée de data.
  payload.success = true;
  payload.succes = true;

  if (action === "rechercherColis") {
    payload.found = true;
    payload.colis = data;
  }

  if (action === "enregistrerPaiement") {
    payload.paiement = data.paiement;
    payload.paymentRequestId = data.paymentRequestId;
  }

  return sortieJson_(payload);
}

function reponseErreur_(code, message, requestId) {
  return sortieJson_({
    ok: false,
    error: {
      code: code,
      message: message,
      requestId: requestId
    },
    success: false,
    succes: false
  });
}

function sortieJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function erreurPublique_(code, message) {
  var error = new Error(message);
  error.publicCode = code;
  error.publicMessage = message;
  return error;
}

function codeErreurPublic_(error) {
  if (
    error &&
    typeof error.publicCode === "string" &&
    /^[A-Z0-9_]{1,64}$/.test(error.publicCode)
  ) {
    return error.publicCode;
  }
  return "ERREUR_INTERNE";
}

function messageErreurPublic_(error) {
  if (
    error &&
    typeof error.publicMessage === "string" &&
    error.publicMessage.length <= 200
  ) {
    return error.publicMessage;
  }
  return "Une erreur interne empêche le traitement.";
}
