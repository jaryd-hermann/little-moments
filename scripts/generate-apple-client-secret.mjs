#!/usr/bin/env node
/**
 * Builds the Apple "client secret" JWT for Sign in with Apple (OAuth / Supabase).
 * Usage:
 *   node scripts/generate-apple-client-secret.mjs \
 *     --p8 /path/to/AuthKey_XXX.p8 \
 *     --team-id YOUR_TEAM_ID \
 *     --key-id YOUR_KEY_ID \
 *     --services-id com.example.your.services.id
 *
 * Paste the printed JWT into Supabase Auth → Apple → Secret Key (expires ≤ 6 months).
 * Do not commit .p8 files or this script’s output.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as jose from "jose";

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return null;
  return process.argv[i + 1];
}

const p8Path = arg("--p8");
const teamId = arg("--team-id");
const keyId = arg("--key-id");
const servicesId = arg("--services-id");

if (!p8Path || !teamId || !keyId || !servicesId) {
  console.error(
    "Missing args. Required: --p8 <path> --team-id <id> --key-id <id> --services-id <id>"
  );
  process.exit(1);
}

const pem = readFileSync(resolve(p8Path), "utf8");
const privateKey = await jose.importPKCS8(pem, "ES256");

const jwt = await new jose.SignJWT({})
  .setProtectedHeader({ alg: "ES256", kid: keyId })
  .setIssuer(teamId)
  .setAudience("https://appleid.apple.com")
  .setSubject(servicesId)
  .setIssuedAt()
  .setExpirationTime("180d")
  .sign(privateKey);

console.log(jwt);
