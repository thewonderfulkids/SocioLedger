import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const input = process.argv[2];

if (!input) {
  console.error("Usage: npm run verify:backup -- backups/<file>.json");
  process.exit(1);
}

const backupPath = path.resolve(input);
const checksumPath = `${backupPath}.sha256`;

if (!fs.existsSync(backupPath)) {
  console.error(`Backup not found: ${backupPath}`);
  process.exit(1);
}

const payload = fs.readFileSync(backupPath, "utf8");
const checksum = crypto.createHash("sha256").update(payload).digest("hex");

if (fs.existsSync(checksumPath)) {
  const expected = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
  if (expected !== checksum) {
    console.error("Backup checksum mismatch.");
    process.exit(1);
  }
}

const data = JSON.parse(payload);
const societies = data.societies && typeof data.societies === "object" ? data.societies : {};
const users = data.users && typeof data.users === "object" ? data.users : {};

const societySummary = Object.entries(societies).map(([societyId, societyValue]) => {
  const society = societyValue || {};
  const profile = society.profile || society;
  return {
    societyId,
    name: profile.name || "",
    flats: society.flats && typeof society.flats === "object" ? Object.keys(society.flats).length : 0,
    payments: society.payments && typeof society.payments === "object" ? Object.keys(society.payments).length : 0,
    expenses: society.expenses && typeof society.expenses === "object" ? Object.keys(society.expenses).length : 0,
  };
});

console.log("Backup checksum verified.");
console.log({
  checksum,
  users: Object.keys(users).length,
  societies: societySummary.length,
  societySummary,
});
