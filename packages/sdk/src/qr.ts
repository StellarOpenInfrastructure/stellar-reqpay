import QRCode from "qrcode";

export interface QrOptions {
  /** Pixel size for PNG data URLs (default 320). */
  width?: number;
  margin?: number;
}

/** SVG string for the given REQPAY URI or hosted link. */
export function toQrSvg(content: string, opts: QrOptions = {}): Promise<string> {
  return QRCode.toString(content, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: opts.margin ?? 2,
  });
}

/** PNG data URL. */
export function toQrDataUrl(content: string, opts: QrOptions = {}): Promise<string> {
  return QRCode.toDataURL(content, {
    errorCorrectionLevel: "M",
    width: opts.width ?? 320,
    margin: opts.margin ?? 2,
  });
}
