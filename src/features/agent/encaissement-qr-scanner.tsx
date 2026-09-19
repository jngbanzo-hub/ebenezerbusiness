"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, ScanLine, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { extractEebQrId } from "@/features/agent/encaissement-qr-contract";

type ScannerControls = { stop(): void };
type BarcodeResult = { rawValue: string };
type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeResult[]>;
};
type BarcodeDetectorConstructor = {
  new (options: { formats: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

export function EncaissementQrScanner({
  onQrRead
}: {
  onQrRead: (qrId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const handledRef = useRef(false);

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
    stopCamera();
    setIsOpen(false);
    setIsStarting(false);
    setError("");
  }, [stopCamera]);

  const acceptDecodedValue = useCallback(
    (value: string) => {
      if (handledRef.current) return;
      const qrId = extractEebQrId(value);
      if (!qrId) {
        setError("QR Eben Ezer Business non reconnu.");
        return;
      }
      handledRef.current = true;
      stopCamera();
      setIsOpen(false);
      setIsStarting(false);
      onQrRead(qrId);
    },
    [onQrRead, stopCamera]
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
          // A frame can be unreadable while the camera is focusing.
        }
        animationFrameRef.current = requestAnimationFrame(() => void scanFrame());
      };
      animationFrameRef.current = requestAnimationFrame(() => void scanFrame());
    },
    [acceptDecodedValue]
  );

  const startScanner = useCallback(async () => {
    setIsOpen(true);
    setIsStarting(true);
    setError("");
    handledRef.current = false;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("CAMERA_UNAVAILABLE");
      }

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error("CAMERA_UNAVAILABLE");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } }
      });
      streamRef.current = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();
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
      controlsRef.current = await reader.decodeFromStream(
        stream,
        video,
        (result) => {
          if (result) acceptDecodedValue(result.getText());
        }
      );
    } catch (cause) {
      stopCamera();
      setIsStarting(false);
      const denied =
        cause instanceof DOMException &&
        (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      setError(
        denied
          ? "Accès à la caméra refusé. Autorisez la caméra ou utilisez la recherche manuelle."
          : "Caméra indisponible. Utilisez la recherche manuelle pour le moment."
      );
    }
  }, [acceptDecodedValue, scanWithNativeDetector, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => void startScanner()}>
        <ScanLine className="h-4 w-4" />
        Scanner QR
      </Button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ebe-night/95 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-scanner-title"
        >
          <section className="w-full max-w-lg rounded-xl border border-white/15 bg-ebe-navy p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="qr-scanner-title" className="text-xl font-semibold text-white">
                  Scanner un QR Eben Ezer Business
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Placez le QR dans le cadre. Aucun paiement ne sera déclenché par le scan.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeScanner} aria-label="Fermer le scanner">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="relative mt-5 aspect-square overflow-hidden rounded-xl border border-accent/40 bg-black sm:aspect-[4/3]">
              <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-[12%] rounded-xl border-2 border-accent shadow-lime" />
              {isStarting ? (
                <div className="absolute inset-0 grid place-items-center bg-black/70 text-sm text-white">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                    Ouverture de la caméra…
                  </span>
                </div>
              ) : null}
            </div>

            {error ? <p role="alert" className="mt-4 rounded-md border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeScanner}>
                <Camera className="h-4 w-4" />
                Retour à la recherche manuelle
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
