/** Encode examples/open-amount-request.json as a REQPAY URI, a SEP-7 fallback and a QR SVG. */
import { readFileSync, writeFileSync } from "node:fs";
import { encodeUri, parseRequest, toQrSvg, toSep7 } from "@stellar-reqpay/sdk";

const request = parseRequest(JSON.parse(readFileSync("examples/open-amount-request.json", "utf8")));
const uri = encodeUri({ request });
console.log(uri);
console.log(toSep7(request));
writeFileSync("examples/open-amount-request.qr.svg", await toQrSvg(uri));
console.log("wrote examples/open-amount-request.qr.svg");
