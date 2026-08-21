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

const directSocietyRemoves = app.match(/remove\s*\(\s*ref\s*\(\s*db\s*,\s*`societies\/[^`]+`\s*\)\s*\)/g) || [];
if (directSocietyRemoves.length) {
  failures.push(`Direct society remove() calls found (${directSocietyRemoves.length}); society deletion must stay behind the protected flow.`);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}

console.log("PASS: destructive manager/society actions retain authorization and confirmation guards.");
console.log("NOTE: financial balance calculation logic is intentionally outside this audit and remains frozen.");
