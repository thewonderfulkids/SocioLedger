import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const failures = [];

function requirePattern(label, pattern) {
  if (!pattern.test(app)) failures.push(label);
}

requirePattern(
  "canAccessSociety must allow Super Admin globally",
  /function canAccessSociety[\s\S]*?normalizeRole\(user\.role\) === roles\.SUPER_ADMIN[\s\S]*?return true/
);
requirePattern(
  "non-admin society access must be assignment-based",
  /function canAccessSociety[\s\S]*?getUserSocietyIds\(user\)\.includes\(String\(societyId\)\)/
);
requirePattern(
  "selected society must be checked before realtime subscriptions",
  /useEffect\(\(\) => \{[\s\S]*?if \(!canAccessSociety\(user, selectedSocietyId\)\)[\s\S]*?You do not have access to this society[\s\S]*?const basePath = societyPath\(selectedSocietyId\)/
);
requirePattern(
  "Manager society list must be filtered by assigned society IDs",
  /currentRole === roles\.MANAGER[\s\S]*?data\.societies\.filter\(\(s\) => userSocietyIds\.includes\(s\.id\)\)/
);
requirePattern(
  "Resident visible flats must be restricted to linked flats",
  /currentRole === roles\.RESIDENT[\s\S]*?societyData\.flats\.filter\(\(flat\) => isFlatLinkedToUser\(flat, user, authUser, selectedSocietyId\)\)/
);
requirePattern(
  "Resident pay action must require a linked flat",
  /function canShowPayButton[\s\S]*?roles\.RESIDENT[\s\S]*?isFlatLinkedToUser\(flat, user, authUser, selectedSocietyId\)/
);
requirePattern(
  "write-management helper must be limited to Super Admin or Manager",
  /function canManage\(\)[\s\S]*?role === roles\.SUPER_ADMIN \|\| role === roles\.MANAGER/
);

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}

console.log("PASS: Super Admin, Manager and Resident society/flat access invariants remain present.");
console.log("NOTE: this audit protects access behavior only; financial balance calculations remain frozen and are not modified.");
