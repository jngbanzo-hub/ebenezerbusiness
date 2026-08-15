"use client";

import { Camera, Loader2, ScanLine, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { TrackingResult } from "@/features/tracking/tracking-data";

type BarcodeResult = { rawValue: string };
type ScannerControls = { stop(): void };
type BarcodeDetectorInstance = { detect(source: HTMLVideoElement): Promise<BarcodeResult[]> };
type BarcodeDetectorConstructor = {
  new (options: { formats: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

async function withCameraTimeout<T>(promise: Promise<T>, code: string, delayMs: number) {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(code)), delayMs);
      })
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

async function playCameraStream(video: HTMLVideoElement, stream: MediaStream) {
  video.muted = true;
  video.autoplay = true;
  video.setAttribute("muted", "true");
  video.setAttribute("autoplay", "true");
  video.setAttribute("playsinline", "true");
  video.srcObject = stream;

  await withCameraTimeout(video.play(), "CAMERA_START_TIMEOUT", 8_000);
}

export type PublicQrApiResponse =
  | { state: "INVALID" | "UNKNOWN" | "UNAVAILABLE" }
  | { state: "UNASSIGNED" | "REVOKED" | "TRACKING_NOT_FOUND"; qrId: string }
  | { state: "ASSIGNED"; qrId: string; result: TrackingResult };

export function extractOfficialPublicQrId(rawValue: string) {
  const value = rawValue.trim();
  if (/^EEBQR[0-9]{6,}$/.test(value)) return value;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.ebenezerbusiness.com" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }
    const match = url.pathname.match(/^\/q\/(EEBQR[0-9]{6,})\/?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function PublicQrScanner({
  onResolved
}: {
  onResolved: (resolution: PublicQrApiResponse) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const handledRef = useRef(false);
  const sessionRef = useRef(0);

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const closeScanner = useCallback(() => {
    sessionRef.current += 1;
    handledRef.current = true;
    stopCamera();
    setIsOpen(false);
    setIsStarting(false);
    setIsResolving(false);
    setError("");
  }, [stopCamera]);

  const resolveQr = useCallback(
    async (qrId: string) => {
      setIsResolving(true);
      try {
        const response = await fetch(`/api/qr/${encodeURIComponent(qrId)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store"
        });
        const payload = (await response.json()) as PublicQrApiResponse;
        onResolved(payload);
        setIsOpen(false);
      } catch {
        onResolved({ state: "UNAVAILABLE" });
        setIsOpen(false);
      } finally {
        setIsResolving(false);
      }
    },
    [onResolved]
  );

  const acceptDecodedValue = useCallback(
    (value: string) => {
      if (handledRef.current) return;
      const qrId = extractOfficialPublicQrId(value);
      if (!qrId) {
        setError("QR Eben Ezer Business non reconnu.");
        return;
      }
      handledRef.current = true;
      stopCamera();
      void resolveQr(qrId);
    },
    [resolveQr, stopCamera]
  );

  const scanWithNativeDetector = useCallback(
    async (Detector: BarcodeDetectorConstructor, video: HTMLVideoElement) => {
      const detector = new Detector({ formats: ["qr_code"] });
      const scanFrame = async () => {
        if (handledRef.current || !streamRef.current) return;
        try {
          const results = await detector.detect(video);
          if (results[0]?.rawValue) {
            acceptDecodedValue(results[0].rawValue);
            return;
          }
        } catch {
          // Une image peut être illisible pendant la mise au point.
        }
        animationFrameRef.current = requestAnimationFrame(() => void scanFrame());
      };
      animationFrameRef.current = requestAnimationFrame(() => void scanFrame());
    },
    [acceptDecodedValue]
  );

  const startScanner = useCallback(async () => {
    if (isOpen) return;
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setIsOpen(true);
    setIsStarting(true);
    setError("");
    handledRef.current = false;

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("CAMERA_UNAVAILABLE");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error("CAMERA_UNAVAILABLE");

      const streamRequest = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } }
      });
      void streamRequest
        .then((lateStream) => {
          if (sessionRef.current !== session) {
            lateStream.getTracks().forEach((track) => track.stop());
          }
        })
        .catch(() => undefined);
      const stream = await withCameraTimeout(
        streamRequest,
        "CAMERA_PERMISSION_TIMEOUT",
        12_000
      );
      if (sessionRef.current !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      await playCameraStream(video, stream);
      setIsStarting(false);

      const Detector = (
        window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }
      ).BarcodeDetector;
      const supportedFormats = Detector?.getSupportedFormats
        ? await Detector.getSupportedFormats().catch(() => [])
        : [];

      if (Detector && (!Detector.getSupportedFormats || supportedFormats.includes("qr_code"))) {
        await scanWithNativeDetector(Detector, video);
        return;
      }

      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 150,
        delayBetweenScanSuccess: 500
      });
      controlsRef.current = await reader.decodeFromStream(stream, video, (result) => {
        if (result) acceptDecodedValue(result.getText());
      });
    } catch (cause) {
      sessionRef.current += 1;
      stopCamera();
      setIsStarting(false);
      setError(
        "Impossible d’ouvrir la caméra. Vérifiez l’autorisation caméra de votre navigateur puis réessayez."
      );
    }
  }, [acceptDecodedValue, isOpen, scanWithNativeDetector, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => void startScanner()}>
        <ScanLine className="h-4 w-4" />
        Scanner QR
      </Button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ebe-night/95 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="public-qr-scanner-title">
          <section className="w-full max-w-lg rounded-xl border border-white/15 bg-ebe-navy p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="public-qr-scanner-title" className="text-xl font-semibold text-white">Scanner un QR Eben Ezer Business</h2>
                <p className="mt-2 text-sm text-muted-foreground">Placez le QR officiel dans le cadre pour afficher son suivi.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeScanner} aria-label="Fermer le scanner">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="relative mt-5 aspect-square overflow-hidden rounded-xl border border-accent/40 bg-black sm:aspect-[4/3]">
              <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-[12%] rounded-xl border-2 border-accent shadow-lime" />
              {isStarting || isResolving ? (
                <div className="absolute inset-0 grid place-items-center bg-black/70 text-sm text-white">
                  <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin text-accent" />{isResolving ? "Résolution du QR…" : "Ouverture de la caméra…"}</span>
                </div>
              ) : null}
            </div>

            {error ? <p role="alert" className="mt-4 rounded-md border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
            <div className="mt-5 flex justify-end">
              <Button type="button" variant="outline" onClick={closeScanner}><Camera className="h-4 w-4" />Retour à la recherche manuelle</Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
