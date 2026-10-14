import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import serviceAccount from "../serviceAccountKey.json" with { type: "json" };

const databaseURL =
  "https://socioledger-8e2f6-default-rtdb.asia-southeast1.firebasedatabase.app";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL,
});

const db = admin.database();

function safeCount(value) {
  if (!value || typeof value !== "object") return 0;
  return Object.keys(value).length;
}

async function main() {
  const snapshot = await db.ref("/").once("value");
  const data = snapshot.val() || {};

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve("backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const payload = JSON.stringify(data, null, 2);
  const checksum = crypto.createHash("sha256").update(payload).digest("hex");

  const backupPath = path.join(backupDir, `socioledger-${timestamp}.json`);
  const checksumPath = `${backupPath}.sha256`;

  fs.writeFileSync(backupPath, payload, { mode: 0o600 });
  fs.writeFileSync(checksumPath, `${checksum}  ${path.basename(backupPath)}\n`, { mode: 0o600 });

  console.log("Firebase backup completed in READ-ONLY mode.");
  console.log(`Backup: ${backupPath}`);
  console.log(`SHA-256: ${checksum}`);
  console.log({
    users: safeCount(data.users),
    societies: safeCount(data.societies),
  });

  await admin.app().delete();
}

main().catch(async (error) => {
  console.error("Firebase backup failed:", error);
  try {
    await admin.app().delete();
  } catch {
    // Ignore cleanup errors.
  }
  process.exit(1);
});
