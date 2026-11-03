import { createPrivateKey, sign, type KeyObject } from "node:crypto";

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function privateKey(pem: string): KeyObject {
  return createPrivateKey(pem);
}

export function signJwt(
  algorithm: "ES256" | "RS256",
  header: Record<string, string>,
  claims: Record<string, string | number>,
  key: KeyObject,
): string {
  const unsigned = `${base64url(JSON.stringify({ alg: algorithm, ...header }))}.${base64url(JSON.stringify(claims))}`;
  const signature = sign(
    "sha256",
    Buffer.from(unsigned),
    algorithm === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key,
  );
  return `${unsigned}.${base64url(signature)}`;
}
