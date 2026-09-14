import { canonicalize } from "./canonical.js";
import {
  paymentRequestSchema,
  signedRequestSchema,
  type PaymentRequest,
  type SignedRequest,
} from "./schema.js";

export const URI_SCHEME = "reqpay";

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * Self-contained REQPAY URI, suitable for QR codes and NFC:
 *   reqpay://v1/request?d=<base64url(canonical json)>[&s=<base64url(sig)>&k=<signer>]
 */
export function encodeUri(signed: SignedRequest): string {
  const params = new URLSearchParams();
  params.set("d", b64url(Buffer.from(canonicalize(signed.request), "utf8")));
  if (signed.signature && signed.signer) {
    params.set("s", b64url(Buffer.from(signed.signature, "base64")));
    params.set("k", signed.signer);
  }
  return `${URI_SCHEME}://v1/request?${params.toString()}`;
}

export class DecodeError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DecodeError";
  }
}

export function decodeUri(uri: string): SignedRequest {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new DecodeError("not a valid URI");
  }
  if (url.protocol !== `${URI_SCHEME}:` || url.host !== "v1" || url.pathname !== "/request") {
    throw new DecodeError("unsupported REQPAY URI");
  }
  const d = url.searchParams.get("d");
  if (!d) throw new DecodeError("missing request payload");
  let request: unknown;
  try {
    request = JSON.parse(Buffer.from(d, "base64url").toString("utf8"));
  } catch {
    throw new DecodeError("request payload is not valid JSON");
  }
  const s = url.searchParams.get("s");
  const k = url.searchParams.get("k");
  const parsed = signedRequestSchema.safeParse({
    request,
    ...(s ? { signature: Buffer.from(s, "base64url").toString("base64") } : {}),
    ...(k ? { signer: k } : {}),
  });
  if (!parsed.success) throw new DecodeError("request failed validation", parsed.error.issues);
  return parsed.data;
}

/**
 * Hosted link: https://<host>/r/<id>. Wallets GET it with
 * `Accept: application/reqpay+json` to obtain the SignedRequest.
 */
export function hostedLink(baseUrl: string, id: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/r/${encodeURIComponent(id)}`;
}

/**
 * SEP-7 fallback for wallets that do not speak REQPAY. Loses expiration,
 * status and metadata; carries destination, amount, asset, memo and message.
 */
export function toSep7(request: PaymentRequest, originDomain?: string): string {
  const p = new URLSearchParams();
  p.set("destination", request.destination);
  if (request.amount) p.set("amount", request.amount);
  if (request.asset !== "native") {
    if (request.asset.startsWith("contract:")) {
      throw new Error("SEP-7 pay cannot express contract assets; use the REQPAY URI");
    }
    const [code, issuer] = request.asset.split(":");
    p.set("asset_code", code!);
    p.set("asset_issuer", issuer!);
  }
  if (request.memo) {
    p.set("memo", request.memo.value);
    p.set(
      "memo_type",
      request.memo.type === "text"
        ? "MEMO_TEXT"
        : request.memo.type === "id"
          ? "MEMO_ID"
          : "MEMO_HASH",
    );
  }
  if (request.description) p.set("msg", request.description.slice(0, 300));
  const domain = originDomain ?? request.merchant?.domain;
  if (domain) p.set("origin_domain", domain);
  if (request.network) p.set("network_passphrase", request.network);
  return `web+stellar:pay?${p.toString()}`;
}

export function parseRequest(input: unknown): PaymentRequest {
  const parsed = paymentRequestSchema.safeParse(input);
  if (!parsed.success) throw new DecodeError("request failed validation", parsed.error.issues);
  return parsed.data;
}
