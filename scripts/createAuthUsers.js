import admin from "firebase-admin";
import serviceAccount from "../serviceAccountKey.json" with { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://socioledger-8e2f6-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const db = admin.database();
const auth = admin.auth();

function normalizePhone(phone = "") {
  return String(phone).replace(/\D/g, "").slice(-10);
}

function phoneToEmail(phone = "") {
  return `${normalizePhone(phone)}@socioledger.local`;
}

function getDefaultPassword(user) {
  const phone = normalizePhone(user.phone);
  const fallbackPassword = `${phone.slice(-4)}@Socio`;

  const existingPassword = String(user.password || "").trim();

  if (existingPassword.length >= 6) {
    return existingPassword;
  }

  return fallbackPassword;
}

async function createOrUpdateAuthUsers() {
  const snapshot = await db.ref("users").once("value");
  const users = snapshot.val() || {};

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const [userId, user] of Object.entries(users)) {
    const phone = normalizePhone(user.phone);

    if (!phone || phone.length !== 10) {
      skipped++;
      continue;
    }

    const email = phoneToEmail(phone);
    const password = getDefaultPassword(user);
    const displayName = user.name || phone;

    try {
      const existing = await auth.getUserByEmail(email);

      await auth.updateUser(existing.uid, {
        displayName,
        disabled: user.active === false,
      });

      await db.ref(`users/${userId}`).update({
        uid: existing.uid,
        email,
        authMigratedAt: Date.now(),
      });

      updated++;
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        console.error(`Failed for ${email}`, error);
        skipped++;
        continue;
      }

      const createdUser = await auth.createUser({
        email,
        password,
        displayName,
        disabled: user.active === false,
      });

      await db.ref(`users/${userId}`).update({
        uid: createdUser.uid,
        email,
        authMigratedAt: Date.now(),
      });

      created++;
    }
  }

  console.log("✅ Auth user migration complete.");
  console.log({ created, updated, skipped });
  console.log("Resident default password: last4digits@Socio");
}

createOrUpdateAuthUsers().catch((error) => {
  console.error("❌ Failed:", error);
  process.exit(1);
});