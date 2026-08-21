import fs from "node:fs";

const appPath = new URL("../src/App.jsx", import.meta.url);
let app = fs.readFileSync(appPath, "utf8");

const demoPassword = '    password: "123456",\n';
if (app.includes(demoPassword)) {
  app = app.replace(demoPassword, "");
}

const oldBlock = `      // Production-safe self-heal: persist merged role/society assignments to
      // the canonical UID record. The legacy record is intentionally retained.
      if (legacyProfileKey && legacyProfileKey !== authUser.uid) {
        update(ref(db, \`users/\${authUser.uid}\`), {
          ...profile,
          id: authUser.uid,
          uid: authUser.uid,
          legacyProfileKey,
          updatedAt: Date.now(),
        }).catch((error) => {
          console.warn("User profile self-heal skipped", error);
        });
      }
`;

const newBlock = `      // Persist legacy permissions only when the legacy record has a strong
      // identity binding to this Firebase Auth user. Phone/key-only matches are
      // still allowed for backward-compatible in-memory access, but they must
      // never silently persist roles or society assignments to a canonical UID.
      const legacyProfile = legacyMatch?.profile || {};
      const legacyUid = String(legacyProfile.uid || legacyProfile.authUid || "").trim();
      const legacyEmail = String(
        legacyProfile.email || legacyProfile.loginEmail || legacyProfile.authEmail || ""
      ).trim().toLowerCase();
      const authenticatedEmail = String(authUser.email || "").trim().toLowerCase();
      const canPersistLegacyProfile =
        legacyProfileKey &&
        legacyProfileKey !== authUser.uid &&
        (legacyUid === authUser.uid ||
          (!!authenticatedEmail && legacyEmail === authenticatedEmail));

      if (canPersistLegacyProfile) {
        update(ref(db, \`users/\${authUser.uid}\`), {
          ...profile,
          id: authUser.uid,
          uid: authUser.uid,
          legacyProfileKey,
          updatedAt: Date.now(),
        }).catch((error) => {
          console.warn("User profile self-heal skipped", error);
        });
      }
`;

if (app.includes(oldBlock)) {
  app = app.replace(oldBlock, newBlock);
} else if (!app.includes("const canPersistLegacyProfile =")) {
  throw new Error("Expected login self-heal block was not found; refusing to patch App.jsx.");
}

fs.writeFileSync(appPath, app);
console.log("Batch 7 auth hardening patch applied idempotently.");
