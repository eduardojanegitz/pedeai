// Gera um par de chaves VAPID para as notificações push.
// Uso: node scripts/gen-vapid.mjs
// Guarde VAPID_PRIVATE_KEY como segredo do servidor (nunca no repositório).
import { webcrypto as crypto } from "node:crypto";

const b64u = (b) => Buffer.from(b).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
]);
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const raw = await crypto.subtle.exportKey("raw", pair.publicKey);

console.log(`VAPID_PUBLIC_KEY=${b64u(new Uint8Array(raw))}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log("VAPID_SUBJECT=mailto:seu-email@exemplo.com");
