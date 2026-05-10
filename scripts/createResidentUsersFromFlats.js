import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, update } from "firebase/database";
import { firebaseConfig } from "../src/firebase.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function normalizePhone(phone = "") {
  return String(phone).replace(/\D/g, "").slice(-10);
}

function normalizeSocieties(value) {
  if (!value) return [];

  return Object.entries(value).map(([id, society]) => ({
    id,
    ...(society.profile || society),
  }));
}

function normalizeList(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map((item, index) => ({
        id: item?.id || String(index),
        ...item,
      }));
  }

  return Object.entries(value).map(([key, item]) => ({
    id: item?.id || key,
    ...item,
  }));
}

async function createResidentUsersFromFlats() {
  console.log("Reading societies...");

  const snapshot = await get(ref(db));
  const data = snapshot.val() || {};

  const societies = normalizeSocieties(data.societies || {});
  const updates = {};
  const now = Date.now();

  for (const society of societies) {
    const societyId = society.id;
    if (!societyId) continue;

    const flatsSnapshot = await get(ref(db, `societies/${societyId}/flats`));
    const flats = normalizeList(flatsSnapshot.val() || {});

    for (const flat of flats) {
      const phone = normalizePhone(flat.phone);

      if (!phone || phone.length !== 10) continue;

      const userId = `resident_${phone}`;

      updates[`users/${userId}/id`] = userId;
      updates[`users/${userId}/name`] = flat.ownerName || `Flat ${flat.flatNo}`;
      updates[`users/${userId}/phone`] = phone;
      updates[`users/${userId}/role`] = "Resident";
      updates[`users/${userId}/active`] = true;
      updates[`users/${userId}/flatId`] = flat.id;
      updates[`users/${userId}/societyIds/${societyId}`] = true;
      updates[`users/${userId}/updatedAt`] = now;

      if (!data.users?.[userId]?.createdAt) {
        updates[`users/${userId}/createdAt`] = now;
      }
    }
  }

  await update(ref(db), updates);

  console.log("✅ Resident users created/updated from flats.");
}

createResidentUsersFromFlats().catch((error) => {
  console.error("❌ Failed:", error);
  process.exit(1);
});