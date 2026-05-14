import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, update } from "firebase/database";
import { firebaseConfig } from "../src/firebase.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function toDateOnly(dateValue) {
  if (!dateValue) return new Date();
  if (typeof dateValue === "number") return new Date(dateValue);
  return new Date(`${dateValue}T00:00:00`);
}

function addDaysISO(dateValue, days) {
  const date = toDateOnly(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function apply15DayTrial() {
  const snapshot = await get(ref(db, "societies"));
  const societies = snapshot.val() || {};
  const updates = {};
  const today = getTodayISO();

  Object.entries(societies).forEach(([societyId, society]) => {
    const subscription = society.subscription || {};
    const profile = society.profile || {};

    const trialStartDate =
      subscription.trialStartDate ||
      subscription.startDate ||
      today;

    const trialEndsAt =
      subscription.trialEndsAt ||
      addDaysISO(trialStartDate, 15);

    updates[`societies/${societyId}/subscription/trialStartDate`] = trialStartDate;
    updates[`societies/${societyId}/subscription/trialEndsAt`] = trialEndsAt;
    updates[`societies/${societyId}/subscription/status`] =
      subscription.status || profile.subscriptionStatus || "trial";
    updates[`societies/${societyId}/subscription/updatedAt`] = Date.now();

    updates[`societies/${societyId}/profile/subscriptionStatus`] =
      profile.subscriptionStatus || subscription.status || "trial";
  });

  await update(ref(db), updates);
  console.log("✅ 15 days trial fields applied to all societies.");
}

apply15DayTrial().catch((error) => {
  console.error("❌ Failed:", error);
  process.exit(1);
});