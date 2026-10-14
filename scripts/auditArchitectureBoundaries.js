import fs from "node:fs";

const access = fs.readFileSync(new URL("../src/domain/access.js", import.meta.url), "utf8");
const auth = fs.readFileSync(new URL("../src/domain/auth.js", import.meta.url), "utf8");
const failures = [];

function requirePattern(source, label, pattern) {
  if (!pattern.test(source)) failures.push(label);
}

requirePattern(access, "access module must export roles", /export const roles/);
requirePattern(access, "access module must export normalizeRole", /export function normalizeRole/);
requirePattern(access, "access module must export canAccessSociety", /export function canAccessSociety/);
requirePattern(access, "access module must keep Super Admin global access", /roles\.SUPER_ADMIN[\s\S]*?return true/);
requirePattern(access, "access module must keep assignment-based society access", /getUserSocietyIds\(user\)\.includes\(String\(societyId\)\)/);
requirePattern(access, "access module must export flat access IDs", /export function getUserFlatIds/);

requirePattern(auth, "auth module must export normalizePhone", /export function normalizePhone/);
requirePattern(auth, "auth module must preserve legacy login aliases", /@socioledger\.local[\s\S]*?@socioledger\.com[\s\S]*?@socioledger\.in/);
requirePattern(auth, "auth module must export legacy profile lookup", /export function findLegacyUserProfile/);
requirePattern(auth, "auth module must export profile merge helper", /export function mergeUserProfiles/);

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}

console.log("PASS: Batch 12 access/auth architecture boundaries are present.");
console.log("NOTE: ledger and balance calculation functions are intentionally excluded from this architecture migration.");
