import type { TrackingSite } from "@/features/tracking/tracking-validation";
import {
  readPublicManifestRows,
  readPublicManifestStatusValues,
  type PublicManifestRow
} from "@/server/google-sheets";
import {
  activeNotificationTemplateNames,
  buildNotificationCandidatesForEvent,
  manifestNotificationStatuses,
  maskPhone,
  normalizeManifestStatusSpacing,
  type ManifestNotificationEvent,
  type NotificationRecipientRole,
  type NotificationTemplateName
} from "@/server/notifications/manifest-parser";
import {
  getNotificationStore,
  persistNotificationLogEntry,
  resetNotificationStore,
  type ManifestBaselineEntry,
  type NotificationLogEntry
} from "@/server/notifications/notification-store";
import { getWhatsAppRuntimeConfig, sendWhatsAppTemplate } from "@/server/whatsapp/360dialog";
import { buildWhatsAppTemplatePayload, type WhatsAppTemplatePayload } from "@/server/whatsapp/templates";

export type NotificationScanOptions = {
  limit?: number;
  includePayloadExamples?: boolean;
  initializeBaselineOnly?: boolean;
  now?: Date;
};

export type NotificationScanResult = {
  dryRun: boolean;
  writeSheetStatus: boolean;
  sheetWriteAttempted: false;
  sheetsRead: TrackingSite[];
  rowsScanned: number;
  baselineInitialized: boolean;
  baselineRows: number;
  candidatesBuilt: number;
  candidatesByModel: Record<NotificationTemplateName, number>;
  created: number;
  duplicates: number;
  skippedInvalidRecipients: number;
  invalidRecipientReport: InvalidRecipientReport;
  statusesBySheet: Awaited<ReturnType<typeof readPublicManifestStatusValues>>;
  entries: NotificationLogEntry[];
  examples?: NotificationPayloadExamples;
};

export type ControlledNotificationScenarioResult = {
  dryRun: boolean;
  writeSheetStatus: boolean;
  sheetWriteAttempted: false;
  baseline: ProcessManifestRowsResult;
  scenarios: Array<{
    name: string;
    result: ProcessManifestRowsResult;
    newEntries: NotificationLogEntry[];
    arrivalDate?: string;
  }>;
  finalSecondScan: ProcessManifestRowsResult;
  finalEntries: NotificationLogEntry[];
  inFlightExamplesByDestination: Record<
    TrackingSite,
    {
      expediteur: MaskedPayloadExample;
      beneficiaire: MaskedPayloadExample;
    }
  >;
  inTransitExamplesByDestination: Record<
    TrackingSite,
    {
      expediteur: MaskedPayloadExample;
      beneficiaire: MaskedPayloadExample;
    }
  >;
};

export type NotificationPayloadExamples = Partial<
  Record<NotificationTemplateName, Partial<Record<NotificationRecipientRole, MaskedPayloadExample>>>
>;

export type InvalidRecipientReport = {
  totalInvalid: number;
  absent: number;
  missingCountryCode: number;
  multipleNamesOrNumbers: number;
  containsNonNumericCharacters: number;
  canNormalizeAutomatically: number;
  mustRemainRejected: number;
  byRole: Record<NotificationRecipientRole, InvalidRecipientRoleReport>;
};

type InvalidRecipientRoleReport = {
  totalInvalid: number;
  absent: number;
  missingCountryCode: number;
  multipleNamesOrNumbers: number;
  containsNonNumericCharacters: number;
  canNormalizeAutomatically: number;
  mustRemainRejected: number;
};

type InvalidRecipientFlags = {
  absent: boolean;
  missingCountryCode: boolean;
  multipleNamesOrNumbers: boolean;
  containsNonNumericCharacters: boolean;
  canNormalizeAutomatically: boolean;
};

type MaskedPayloadExample = {
  recipientRole: NotificationRecipientRole;
  payload: Omit<WhatsAppTemplatePayload, "to"> & {
    to: string;
  };
};

type ProcessManifestRowsOptions = {
  initializeBaselineOnly?: boolean;
  initializeBaselineIfEmpty?: boolean;
  now?: Date;
};

type ProcessManifestRowsResult = {
  dryRun: boolean;
  writeSheetStatus: boolean;
  sheetWriteAttempted: false;
  rowsScanned: number;
  baselineInitialized: boolean;
  baselineRows: number;
  candidatesBuilt: number;
  candidatesByModel: Record<NotificationTemplateName, number>;
  created: number;
  duplicates: number;
  skippedInvalidRecipients: number;
  invalidRecipientReport: InvalidRecipientReport;
};

const manifestSheets: TrackingSite[] = ["FIH", "LSHI", "KLZ"];
const notificationTimeZone = "Africa/Porto-Novo";

export async function scanPublicManifestNotifications(
  options: NotificationScanOptions = {}
): Promise<NotificationScanResult> {
  const rows = await readPublicManifestRows(manifestSheets);
  const rowsToProcess = typeof options.limit === "number" ? rows.slice(0, options.limit) : rows;
  const statusesBySheet = await readPublicManifestStatusValues(manifestSheets);
  const result = await processManifestRows(rowsToProcess, {
    initializeBaselineOnly: options.initializeBaselineOnly,
    initializeBaselineIfEmpty: true,
    now: options.now
  });

  return {
    ...result,
    sheetsRead: manifestSheets,
    statusesBySheet,
    entries: getNotificationStore().list(),
    examples: options.includePayloadExamples ? buildNotificationPayloadExamples() : undefined
  };
}

export async function runControlledNotificationScenarios(): Promise<ControlledNotificationScenarioResult> {
  const store = resetNotificationStore();
  const fixedDepositDate = new Date("2026-04-01T09:00:00+01:00");
  const fixedInFlightDate = new Date("2026-04-02T08:15:00+01:00");
  const fixedTransitDate = new Date("2026-04-02T12:20:00+01:00");
  const fixedArrivalDate = new Date("2026-04-03T10:30:00+01:00");
  const fixedDeliveryDate = new Date("2026-04-04T11:45:00+01:00");
  const historicalRows = [
    createFixtureRow({
      rowNumber: 2,
      codeColis: "HIST001",
      statut: manifestNotificationStatuses.deposited
    }),
    createFixtureRow({
      rowNumber: 3,
      codeColis: "HIST002",
      statut: manifestNotificationStatuses.arrived
    }),
    createFixtureRow({
      rowNumber: 7,
      codeColis: "HIST-ENVOL-001",
      statut: manifestNotificationStatuses.inFlight
    }),
    createFixtureRow({
      rowNumber: 9,
      codeColis: "HIST-TRANSIT-001",
      statut: manifestNotificationStatuses.inTransit
    })
  ];
  const validDepositRow = createFixtureRow({
    rowNumber: 4,
    codeColis: "TEST001",
    statut: manifestNotificationStatuses.deposited
  });
  const validArrivedRow = {
    ...validDepositRow,
    statut: manifestNotificationStatuses.arrived
  };
  const validInFlightRow = createFixtureRow({
    rowNumber: 8,
    codeColis: "TEST-ENVOL-001",
    statut: manifestNotificationStatuses.inFlight
  });
  const validInTransitRow = createFixtureRow({
    rowNumber: 10,
    codeColis: "TEST-TRANSIT-001",
    statut: manifestNotificationStatuses.inTransit
  });
  const validDeliveredRow = {
    ...validDepositRow,
    statut: manifestNotificationStatuses.delivered
  };
  const senderValidBeneficiaryInvalidRow = createFixtureRow({
    rowNumber: 5,
    codeColis: "TEST002",
    statut: manifestNotificationStatuses.deposited,
    expediteurRaw: "Expéditeur Valide +2290197471459",
    beneficiaireRaw: "Bénéficiaire Sans Numéro"
  });
  const senderInvalidBeneficiaryValidRow = createFixtureRow({
    rowNumber: 6,
    codeColis: "TEST003",
    statut: manifestNotificationStatuses.deposited,
    expediteurRaw: "Expéditeur Sans Numéro",
    beneficiaireRaw: "Bénéficiaire Valide +243810101525"
  });
  const baseline = await processManifestRows(historicalRows, {
    initializeBaselineOnly: true,
    now: fixedDepositDate
  });
  const scenarios: ControlledNotificationScenarioResult["scenarios"] = [];

  scenarios.push(
    await runScenario("Nouveau colis En Attente avec deux numéros valides", [
      ...historicalRows,
      validDepositRow
    ])
  );

  scenarios.push(
    await runScenario("Nouveau colis En Vol avec deux numéros valides", [
      ...historicalRows,
      validInFlightRow
    ], fixedInFlightDate)
  );

  scenarios.push(
    await runScenario("Nouveau colis En Transit avec deux numéros valides", [
      ...historicalRows,
      validInFlightRow,
      validInTransitRow
    ], fixedTransitDate)
  );

  scenarios.push(
    await runScenario(
      "Changement du même colis vers Arrivé",
      [...historicalRows, validArrivedRow],
      fixedArrivalDate,
      store.getBaseline(validArrivedRow)?.arrivalDate
    )
  );

  scenarios.push(
    await runScenario("Changement du même colis vers Livré", [...historicalRows, validDeliveredRow], fixedDeliveryDate)
  );

  scenarios.push(
    await runScenario("Expéditeur valide et bénéficiaire invalide", [
      ...historicalRows,
      validDeliveredRow,
      senderValidBeneficiaryInvalidRow
    ])
  );

  scenarios.push(
    await runScenario("Expéditeur invalide et bénéficiaire valide", [
      ...historicalRows,
      validDeliveredRow,
      senderValidBeneficiaryInvalidRow,
      senderInvalidBeneficiaryValidRow
    ])
  );

  const finalRows = [
    ...historicalRows,
    validInFlightRow,
    validInTransitRow,
    validDeliveredRow,
    senderValidBeneficiaryInvalidRow,
    senderInvalidBeneficiaryValidRow
  ];
  const finalSecondScan = await processManifestRows(finalRows, {
    initializeBaselineIfEmpty: false,
    now: fixedDeliveryDate
  });
  const finalEntries = store.list();
  const result: ControlledNotificationScenarioResult = {
    dryRun: getWhatsAppRuntimeConfig().dryRun,
    writeSheetStatus: process.env.NOTIFICATIONS_WRITE_SHEET_STATUS === "true",
    sheetWriteAttempted: false,
    baseline,
    scenarios,
    finalSecondScan,
    finalEntries,
    inFlightExamplesByDestination: buildInFlightPayloadExamplesByDestination(),
    inTransitExamplesByDestination: buildInTransitPayloadExamplesByDestination()
  };

  resetNotificationStore();

  return result;

  async function runScenario(
    name: string,
    rows: PublicManifestRow[],
    now = fixedDepositDate,
    previousArrivalDate?: string
  ) {
    const beforeCount = store.list().length;
    const result = await processManifestRows(rows, {
      initializeBaselineIfEmpty: false,
      now
    });
    const newEntries = store.list().slice(beforeCount);
    const arrivalDate =
      previousArrivalDate ?? rows.map((row) => store.getBaseline(row)?.arrivalDate).find(Boolean);

    return {
      name,
      result,
      newEntries,
      arrivalDate
    };
  }
}

export function buildNotificationPayloadExamples(): NotificationPayloadExamples {
  return {
    coli_depose: {
      expediteur: buildMaskedExample("coli_depose", "expediteur"),
      beneficiaire: buildMaskedExample("coli_depose", "beneficiaire")
    },
    colis_en_vol_expediteur: {
      expediteur: buildMaskedExample("colis_en_vol_expediteur", "expediteur")
    },
    colis_en_vol_beneficiaire: {
      beneficiaire: buildMaskedExample("colis_en_vol_beneficiaire", "beneficiaire")
    },
    colis_en_transit_expediteur: {
      expediteur: buildMaskedExample("colis_en_transit_expediteur", "expediteur")
    },
    colis_en_transit_beneficiaire: {
      beneficiaire: buildMaskedExample("colis_en_transit_beneficiaire", "beneficiaire")
    },
    colis_arrive: {
      expediteur: buildMaskedExample("colis_arrive", "expediteur"),
      beneficiaire: buildMaskedExample("colis_arrive", "beneficiaire")
    },
    colis_livre: {
      expediteur: buildMaskedExample("colis_livre", "expediteur")
    }
  };
}

async function processManifestRows(
  rows: PublicManifestRow[],
  options: ProcessManifestRowsOptions = {}
): Promise<ProcessManifestRowsResult> {
  const store = getNotificationStore();
  const config = getWhatsAppRuntimeConfig();
  const writeSheetStatus = process.env.NOTIFICATIONS_WRITE_SHEET_STATUS === "true";
  const now = options.now ?? new Date();

  if (options.initializeBaselineOnly || (options.initializeBaselineIfEmpty && !store.hasBaseline())) {
    const baselineRows = store.initializeBaseline(rows, now);

    return {
      dryRun: config.dryRun,
      writeSheetStatus,
      sheetWriteAttempted: false,
      rowsScanned: rows.length,
      baselineInitialized: true,
      baselineRows,
      candidatesBuilt: 0,
      candidatesByModel: createEmptyCandidateCounts(),
      created: 0,
      duplicates: 0,
      skippedInvalidRecipients: 0,
      invalidRecipientReport: createEmptyInvalidRecipientReport()
    };
  }

  const candidatesByModel = createEmptyCandidateCounts();
  let candidatesBuilt = 0;
  let created = 0;
  let duplicates = 0;
  let skippedInvalidRecipients = 0;
  const invalidRecipientReport = createEmptyInvalidRecipientReport();

  for (const row of rows) {
    const transition = resolveNotificationTransition(row, store.getBaseline(row), now);
    const candidates = transition.events.flatMap((event) =>
      buildNotificationCandidatesForEvent(row, event)
    );
    candidatesBuilt += candidates.length;

    for (const candidate of candidates) {
      candidatesByModel[candidate.event.templateName] += 1;

      if (store.hasDedupKey(candidate.dedupKey)) {
        duplicates += 1;
        continue;
      }

      if (!candidate.recipient.contact.isValid) {
        const rawValue =
          candidate.recipient.role === "expediteur" ? row.expediteurRaw : row.beneficiaireRaw;
        const flags = analyzeInvalidRecipientFormat(rawValue, candidate.recipient.role);
        const result = store.create({
          candidate,
          provider: "dry-run",
          status: "skipped_invalid_recipient",
          error: candidate.recipient.contact.error ?? "Destinataire invalide."
        });

        incrementInvalidReport(invalidRecipientReport, candidate.recipient.role, flags);
        created += result.created ? 1 : 0;

        if (result.created) {
          await persistNotificationLogEntry(result.entry);
        }

        skippedInvalidRecipients += 1;
        continue;
      }

      const payload = buildWhatsAppTemplatePayload(candidate);
      const sendResult = await sendWhatsAppTemplate(payload);
      const result = store.create({
        candidate,
        provider: sendResult.provider,
        status: sendResult.status,
        messageId: sendResult.messageId,
        error: sendResult.error
      });

      created += result.created ? 1 : 0;

      if (result.created) {
        await persistNotificationLogEntry(result.entry);
      }
    }

    store.upsertBaseline(row, row.statut, now, transition.arrivalDate);
  }

  return {
    dryRun: config.dryRun,
    writeSheetStatus,
    sheetWriteAttempted: false,
    rowsScanned: rows.length,
    baselineInitialized: false,
    baselineRows: store.baselineSize(),
    candidatesBuilt,
    candidatesByModel,
    created,
    duplicates,
    skippedInvalidRecipients,
    invalidRecipientReport
  };
}

function resolveNotificationTransition(
  row: PublicManifestRow,
  baseline: ManifestBaselineEntry | undefined,
  now: Date
): {
  events: ManifestNotificationEvent[];
  arrivalDate?: string;
} {
  const status = normalizeManifestStatusSpacing(row.statut);

  if (baseline?.status === status) {
    return {
      events: [],
      arrivalDate: baseline.arrivalDate
    };
  }

  if (status === manifestNotificationStatuses.deposited) {
    return {
      events: [
        {
          templateName: "coli_depose",
          dateConcerned: row.dateDepot,
          triggerStatus: status
        }
      ],
      arrivalDate: baseline?.arrivalDate
    };
  }

  if (status === manifestNotificationStatuses.inFlight) {
    return {
      events: [
        {
          templateName: "colis_en_vol_expediteur",
          dateConcerned: "",
          triggerStatus: status
        },
        {
          templateName: "colis_en_vol_beneficiaire",
          dateConcerned: "",
          triggerStatus: status
        }
      ],
      arrivalDate: baseline?.arrivalDate
    };
  }

  if (status === manifestNotificationStatuses.inTransit) {
    return {
      events: [
        {
          templateName: "colis_en_transit_expediteur",
          dateConcerned: "",
          triggerStatus: status
        },
        {
          templateName: "colis_en_transit_beneficiaire",
          dateConcerned: "",
          triggerStatus: status
        }
      ],
      arrivalDate: baseline?.arrivalDate
    };
  }

  if (status === manifestNotificationStatuses.arrived) {
    const arrivalDate = baseline?.arrivalDate ?? formatNotificationDate(now);

    return {
      events: [
        {
          templateName: "colis_arrive",
          dateConcerned: arrivalDate,
          triggerStatus: status
        }
      ],
      arrivalDate
    };
  }

  if (status === manifestNotificationStatuses.delivered) {
    return {
      events: [
        {
          templateName: "colis_livre",
          dateConcerned: "",
          triggerStatus: status
        }
      ],
      arrivalDate: baseline?.arrivalDate
    };
  }

  return {
    events: [],
    arrivalDate: baseline?.arrivalDate
  };
}

export function buildInFlightPayloadExamplesByDestination() {
  const examples = {} as Record<
    TrackingSite,
    {
      expediteur: MaskedPayloadExample;
      beneficiaire: MaskedPayloadExample;
    }
  >;
  const destinations: Array<{ sheetName: TrackingSite; destination: string; codeColis: string }> = [
    {
      sheetName: "FIH",
      destination: "Kinshasa",
      codeColis: "TEST-ENVOL-FIH-001"
    },
    {
      sheetName: "LSHI",
      destination: "Lubumbashi",
      codeColis: "TEST-ENVOL-LSHI-001"
    },
    {
      sheetName: "KLZ",
      destination: "Kolwezi",
      codeColis: "TEST-ENVOL-KLZ-001"
    }
  ];

  destinations.forEach(({ sheetName, destination, codeColis }) => {
    examples[sheetName] = {
      expediteur: buildMaskedExample("colis_en_vol_expediteur", "expediteur", {
        sheetName,
        destination,
        codeColis,
        statut: manifestNotificationStatuses.inFlight
      }),
      beneficiaire: buildMaskedExample("colis_en_vol_beneficiaire", "beneficiaire", {
        sheetName,
        destination,
        codeColis,
        statut: manifestNotificationStatuses.inFlight
      })
    };
  });

  return examples;
}

export function buildInTransitPayloadExamplesByDestination() {
  const examples = {} as Record<
    TrackingSite,
    {
      expediteur: MaskedPayloadExample;
      beneficiaire: MaskedPayloadExample;
    }
  >;
  const destinations: Array<{ sheetName: TrackingSite; destination: string; codeColis: string }> = [
    {
      sheetName: "FIH",
      destination: "Kinshasa",
      codeColis: "TEST-TRANSIT-FIH-001"
    },
    {
      sheetName: "LSHI",
      destination: "Lubumbashi",
      codeColis: "TEST-TRANSIT-LSHI-001"
    },
    {
      sheetName: "KLZ",
      destination: "Kolwezi",
      codeColis: "TEST-TRANSIT-KLZ-001"
    }
  ];

  destinations.forEach(({ sheetName, destination, codeColis }) => {
    examples[sheetName] = {
      expediteur: buildMaskedExample("colis_en_transit_expediteur", "expediteur", {
        sheetName,
        destination,
        codeColis,
        statut: manifestNotificationStatuses.inTransit
      }),
      beneficiaire: buildMaskedExample("colis_en_transit_beneficiaire", "beneficiaire", {
        sheetName,
        destination,
        codeColis,
        statut: manifestNotificationStatuses.inTransit
      })
    };
  });

  return examples;
}

function buildMaskedExample(
  templateName: NotificationTemplateName,
  recipientRole: NotificationRecipientRole,
  rowOverrides: Partial<PublicManifestRow> = {}
): MaskedPayloadExample {
  const candidate = {
    row: createFixtureRow({
      rowNumber: 2,
      codeColis: "MR00126",
      statut:
        templateName === "coli_depose"
          ? manifestNotificationStatuses.deposited
          : templateName === "colis_en_vol_expediteur" ||
              templateName === "colis_en_vol_beneficiaire"
            ? manifestNotificationStatuses.inFlight
          : templateName === "colis_en_transit_expediteur" ||
              templateName === "colis_en_transit_beneficiaire"
            ? manifestNotificationStatuses.inTransit
          : templateName === "colis_arrive"
            ? manifestNotificationStatuses.arrived
            : manifestNotificationStatuses.delivered,
      ...rowOverrides
    }),
    event: {
      templateName,
      dateConcerned: templateName === "colis_arrive" ? "03/04/2026" : "01/04/2026",
      triggerStatus:
        templateName === "coli_depose"
          ? manifestNotificationStatuses.deposited
          : templateName === "colis_en_vol_expediteur" ||
              templateName === "colis_en_vol_beneficiaire"
            ? manifestNotificationStatuses.inFlight
          : templateName === "colis_en_transit_expediteur" ||
              templateName === "colis_en_transit_beneficiaire"
            ? manifestNotificationStatuses.inTransit
          : templateName === "colis_arrive"
            ? manifestNotificationStatuses.arrived
            : manifestNotificationStatuses.delivered
    },
    recipient:
      recipientRole === "expediteur"
        ? {
            role: "expediteur" as const,
            contact: {
              name: "Vanela",
              rawPhone: "+2290197471459",
              whatsappNumber: "2290197471459",
              isValid: true
            }
          }
        : {
            role: "beneficiaire" as const,
            contact: {
              name: "Nadine",
              rawPhone: "+243810101525",
              whatsappNumber: "243810101525",
              isValid: true
            }
          },
    dedupKey: `example-${templateName}-${recipientRole}`
  };
  const payload = buildWhatsAppTemplatePayload(candidate);

  return {
    recipientRole,
    payload: {
      ...payload,
      to: maskPhone(payload.to)
    }
  };
}

function createFixtureRow(overrides: Partial<PublicManifestRow>): PublicManifestRow {
  return {
    sheetName: "FIH",
    rowNumber: 1,
    destination: "Kinshasa",
    dateDepot: "01/04/2026",
    codeColis: "MR00126",
    expediteurRaw: "Vanela +2290197471459",
    beneficiaireRaw: "Nadine +243810101525",
    poids: "10",
    montant: "90",
    paiement: "AVANCE",
    statut: manifestNotificationStatuses.deposited,
    notificationEnregEnVol: "",
    notificationArriveLivre: "",
    ...overrides
  };
}

function createEmptyCandidateCounts(): Record<NotificationTemplateName, number> {
  const counts: Record<NotificationTemplateName, number> = {
    coli_depose: 0,
    colis_en_vol_expediteur: 0,
    colis_en_vol_beneficiaire: 0,
    colis_en_transit_expediteur: 0,
    colis_en_transit_beneficiaire: 0,
    colis_arrive: 0,
    colis_livre: 0
  };

  activeNotificationTemplateNames.forEach((templateName) => {
    counts[templateName] = 0;
  });

  return counts;
}

function createEmptyInvalidRecipientReport(): InvalidRecipientReport {
  return {
    totalInvalid: 0,
    absent: 0,
    missingCountryCode: 0,
    multipleNamesOrNumbers: 0,
    containsNonNumericCharacters: 0,
    canNormalizeAutomatically: 0,
    mustRemainRejected: 0,
    byRole: {
      expediteur: createEmptyInvalidRoleReport(),
      beneficiaire: createEmptyInvalidRoleReport()
    }
  };
}

function createEmptyInvalidRoleReport(): InvalidRecipientRoleReport {
  return {
    totalInvalid: 0,
    absent: 0,
    missingCountryCode: 0,
    multipleNamesOrNumbers: 0,
    containsNonNumericCharacters: 0,
    canNormalizeAutomatically: 0,
    mustRemainRejected: 0
  };
}

function incrementInvalidReport(
  report: InvalidRecipientReport,
  role: NotificationRecipientRole,
  flags: InvalidRecipientFlags
) {
  report.totalInvalid += 1;
  report.byRole[role].totalInvalid += 1;

  if (flags.absent) {
    report.absent += 1;
    report.byRole[role].absent += 1;
  }

  if (flags.missingCountryCode) {
    report.missingCountryCode += 1;
    report.byRole[role].missingCountryCode += 1;
  }

  if (flags.multipleNamesOrNumbers) {
    report.multipleNamesOrNumbers += 1;
    report.byRole[role].multipleNamesOrNumbers += 1;
  }

  if (flags.containsNonNumericCharacters) {
    report.containsNonNumericCharacters += 1;
    report.byRole[role].containsNonNumericCharacters += 1;
  }

  if (flags.canNormalizeAutomatically) {
    report.canNormalizeAutomatically += 1;
    report.byRole[role].canNormalizeAutomatically += 1;
  } else {
    report.mustRemainRejected += 1;
    report.byRole[role].mustRemainRejected += 1;
  }
}

function analyzeInvalidRecipientFormat(
  rawValue: string,
  role: NotificationRecipientRole
): InvalidRecipientFlags {
  const phoneLikeValues = rawValue.match(/(?:\+?\d[\d\s()./-]{3,}\d)/g) ?? [];
  const rawPhone = phoneLikeValues[0]?.trim() ?? "";
  const digits = rawPhone.replace(/\D/g, "");
  const startsWithPlus = rawPhone.startsWith("+");
  const missingCountryCode =
    Boolean(digits) && !startsWithPlus && !digits.startsWith("229") && !digits.startsWith("243");
  const candidateWithCurrentRules =
    role === "expediteur" && missingCountryCode ? `229${digits}` : digits;
  const canNormalizeAutomatically =
    role === "expediteur" && Boolean(digits) && /^\d{8,15}$/.test(candidateWithCurrentRules);

  return {
    absent: !digits,
    missingCountryCode,
    multipleNamesOrNumbers: phoneLikeValues.length > 1,
    containsNonNumericCharacters: Boolean(rawPhone && /[^\d+]/.test(rawPhone)),
    canNormalizeAutomatically
  };
}

function formatNotificationDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: notificationTimeZone
  }).format(value);
}
