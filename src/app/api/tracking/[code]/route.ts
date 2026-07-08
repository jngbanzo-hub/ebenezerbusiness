import { NextResponse } from "next/server";

import {
  createMockTrackingResult,
  createTrackingResultFromPublicRecord
} from "@/features/tracking/tracking-data";
import {
  DEMO_TRACKING_CODE,
  trackingCodeSchema,
  trackingSiteSchema
} from "@/features/tracking/tracking-validation";
import {
  findPublicTrackingRecordByCode,
  isGoogleSheetsConfigured
} from "@/server/google-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOT_FOUND_MESSAGE =
  "Aucun colis trouvé avec ce code. Vérifiez le code ou contactez notre service client.";
const UNAVAILABLE_MESSAGE =
  "Le service de suivi est temporairement indisponible. Veuillez réessayer ou contacter notre service client.";
const INVALID_SITE_MESSAGE = "Site de suivi invalide.";

export async function GET(request: Request, { params }: { params: { code: string } }) {
  const parsedCode = trackingCodeSchema.safeParse(params.code);
  const siteParam = new URL(request.url).searchParams.get("site");
  const parsedSite = siteParam
    ? trackingSiteSchema.safeParse(siteParam.trim().toUpperCase())
    : null;

  if (!parsedCode.success) {
    return NextResponse.json(
      {
        found: false,
        message: parsedCode.error.issues[0]?.message ?? "Code de suivi invalide."
      },
      { status: 400 }
    );
  }

  if (siteParam && !parsedSite?.success) {
    return NextResponse.json(
      {
        found: false,
        message: INVALID_SITE_MESSAGE
      },
      { status: 400 }
    );
  }

  const trackingCode = parsedCode.data;
  const trackingSite = parsedSite?.success ? parsedSite.data : undefined;

  if (!isGoogleSheetsConfigured()) {
    if (process.env.NODE_ENV !== "production" && trackingCode === DEMO_TRACKING_CODE) {
      return NextResponse.json({
        found: true,
        source: "demo",
        result: createMockTrackingResult(trackingCode)
      });
    }

    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ found: false, message: NOT_FOUND_MESSAGE }, { status: 404 });
    }

    return NextResponse.json({ found: false, message: UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  try {
    const record = await findPublicTrackingRecordByCode(trackingCode, trackingSite);

    if (!record) {
      return NextResponse.json({ found: false, message: NOT_FOUND_MESSAGE }, { status: 404 });
    }

    return NextResponse.json({
      found: true,
      source: "google-sheets",
      result: createTrackingResultFromPublicRecord(record)
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && trackingCode === DEMO_TRACKING_CODE) {
      return NextResponse.json({
        found: true,
        source: "demo",
        result: createMockTrackingResult(trackingCode)
      });
    }

    console.error("[tracking] Google Sheets lookup failed", error);

    return NextResponse.json({ found: false, message: UNAVAILABLE_MESSAGE }, { status: 503 });
  }
}
