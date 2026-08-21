import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const failures = [];

function requirePattern(label, pattern) {
  if (!pattern.test(app)) failures.push(label);
}

requirePattern(
  "deleteManager must enforce Super Admin authorization",
  /async function deleteManager[\s\S]*?if \(!isSuperAdmin\(\)\)[\s\S]*?Only Super Admin can delete manager/
);
requirePattern(
  "deleteManager must require explicit confirmation",
  /async function deleteManager[\s\S]*?window\.confirm\([\s\S]*?await remove\(ref\(db, `users\/\$\{manager\.id\}`\)\)/
);
requirePattern(
  "deleteSociety must enforce Super Admin authorization",
  /async function deleteSociety[\s\S]*?if \(!isSuperAdmin\(\)\)[\s\S]*?Only Super Admin can delete a society/
);
requirePattern(
  "protected default/Happy Homes society deletion guard is missing",
  /async function deleteSociety[\s\S]*?society\.id === "default_society"[\s\S]*?cannot be deleted/
);
requirePattern(
  "society deletion must require exact-name confirmation",
  /async function deleteSociety[\s\S]*?window\.prompt\([\s\S]*?typedName !== String\(society\.name \|\| ""\)/
);
requirePattern(
  "society deletion must require final confirmation",
  /async function deleteSociety[\s\S]*?finalConfirm = window\.confirm[\s\S]*?if \(!finalConfirm\) return/
);
requirePattern(
  "flat deletion must remain Super Admin only",
  /async function deleteFlat[\s\S]*?!isSuperAdmin\(\)[\s\S]*?Only Super Admin can delete flat/
);
requirePattern(
  "flat deletion must require confirmation and remain society-scoped",
  /async function deleteFlat[\s\S]*?window\.confirm[\s\S]*?remove\(ref\(db, societyPath\(selectedSocietyId, `flats\/\$\{id\}`\)\)\)/
);
requirePattern(
  "payment deletion must require manager/admin authorization",
  /async function deletePayment[\s\S]*?!canManage\(\)[\s\S]*?Only Super Admin \/ Manager can delete payment/
);
requirePattern(
  "payment deletion must require confirmation",
  /async function deletePayment[\s\S]*?window\.confirm\([\s\S]*?if \(!ok\) return/
);
requirePattern(
  "payment deletion must preserve an audit snapshot before removal",
  /async function deletePayment[\s\S]*?paymentDeletionLogs[\s\S]*?paymentSnapshot: payment[\s\S]*?remove\(ref\(db, societyPath\(selectedSocietyId, `payments\/\$\{paymentId\}`\)\)\)/
);
requirePattern(
  "expense deletion must remain Super Admin only",
  /async function deleteExpense[\s\S]*?!isSuperAdmin\(\)[\s\S]*?Only Super Admin can delete expense/
);
requirePattern(
  "expense deletion must require confirmation and remain society-scoped",
  /async function deleteExpense[\s\S]*?window\.confirm[\s\S]*?remove\(ref\(db, societyPath\(selectedSocietyId, `expenses\/\$\{id\}`\)\)\)/
);

const directSocietyRemoves = app.match(/remove\s*\(\s*ref\s*\(\s*db\s*,\s*`societies\/[^`]+`\s*\)\s*\)/g) || [];
if (directSocietyRemoves.length) {
  failures.push(`Direct society remove() calls found (${directSocietyRemoves.length}); society deletion must stay behind the protected flow.`);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}

console.log("PASS: destructive manager, society, flat, payment and expense actions retain authorization, confirmation and society-scope guards.");
console.log("PASS: payment deletion keeps an audit snapshot before removal.");
console.log("NOTE: financial balance calculation logic is intentionally outside this audit and remains frozen.");
