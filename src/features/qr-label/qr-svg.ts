import { BarcodeFormat, EncodeHintType, QRCodeWriter } from "@zxing/library";

export function createQrSvgDataUrl(value: string) {
  const hints = new Map();
  hints.set(EncodeHintType.ERROR_CORRECTION, "H");
  hints.set(EncodeHintType.MARGIN, 4);
  const matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 0, 0, hints);
  const size = matrix.getWidth();
  let path = "";
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (matrix.get(x, y)) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
