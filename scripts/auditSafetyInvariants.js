import fs from "node:fs";

const appPath = new URL("../src/App.jsx", import.meta.url);
const gitignorePath = new URL("../.gitignore", import.meta.url);

const app = fs.readFileSync(appPath, "utf8");
const gitignore = fs.readFileSync(gitignorePath, "utf8");

const hardFailures = [];
const warnings = [];

const forbiddenRootWritePatterns = [
  /(?:set|update|remove)\s*\(\s*ref\s*\(\s*db\s*,\s*["'`]\/?["'`]\s*\)/m,
  /remove\s*\(\s*ref\s*\(\s*db\s*\)\s*\)/m,
];

for (const pattern of forbiddenRootWritePatterns) {
  if (pattern.test(app)) {
    hardFailures.push(`Potential root-level Firebase write detected: ${pattern}`);
  }
}

if (!gitignore.includes("serviceAccountKey.json")) {
  hardFailures.push("serviceAccountKey.json is not ignored by Git.");
}

if (!gitignore.includes("backups/")) {
  hardFailures.push("backups/ is not ignored by Git.");
}

if (/password:\s*["']123456["']/.test(app)) {
  warnings.push("Legacy demo password is still present in source and should be removed during cleanup.");
}

if (/update\s*\(\s*ref\s*\(\s*db\s*,\s*`users\/\$\{authUser\.uid\}`/.test(app)) {
  warnings.push("Login-time canonical user self-heal write is present; keep this migration-only and tightly scoped.");
}

if (/8950701015|OrwmuwfCdwtA2pULu1c|amount\s*===\s*5800/.test(app)) {
  warnings.push("Client-specific legacy ledger correction is still present; do not remove until historical balances are baseline-verified.");
}

console.log("SocioLedger safety invariant audit");
for (const warning of warnings) console.warn(`WARN: ${warning}`);

if (hardFailures.length) {
  for (const failure of hardFailures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log("PASS: no root-level Firebase destructive write pattern or backup/secret ignore regression detected.");
