#!/usr/bin/env node
// Fills the SUPPORT_DESTINATION_EMAIL placeholder in wrangler.jsonc and
// writes the result to a gitignored wrangler.generated.jsonc. Every
// dev/deploy script runs this first — see the "Generated Wrangler
// configuration" pattern Cloudflare's own docs describe for exactly this
// case (a build step swapping in a value the tracked config shouldn't
// carry). Doing it as a plain string replace (not a JSONC parse/stringify)
// keeps every comment in wrangler.jsonc intact in the output.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const dotEnv = loadDotEnv(join(root, ".env"));
const destinationEmail = process.env.SUPPORT_DESTINATION_EMAIL ?? dotEnv.SUPPORT_DESTINATION_EMAIL;

if (!destinationEmail) {
  console.error(
    "SUPPORT_DESTINATION_EMAIL is not set (checked the environment and .env).\n" +
      "Add SUPPORT_DESTINATION_EMAIL=you@example.com to .env for local use,\n" +
      "or set it as a secret in CI.",
  );
  process.exit(1);
}

const template = readFileSync(join(root, "wrangler.jsonc"), "utf8");
const generated = template.replaceAll("__SUPPORT_DESTINATION_EMAIL__", destinationEmail);
writeFileSync(join(root, "wrangler.generated.jsonc"), generated);
console.log("Wrote wrangler.generated.jsonc");
