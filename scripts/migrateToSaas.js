import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, update } from "firebase/database";
import { firebaseConfig } from "../src/firebase.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

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

function cleanUndefined(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function toSocietyIdsMap(value, fallbackSocietyIds = []) {
  const ids = Array.isArray(value) ? value : Object.values(value || {});
  const map = {};

  ids.forEach((id) => {
    if (id) map[id] = true;
  });

  fallbackSocietyIds.forEach((id) => {
    if (id) map[id] = true;
  });

  return map;
}

async function migrateToSaas() {
  console.log("Reading old Firebase data...");

  const snapshot = await get(ref(db));
  const old = snapshot.val() || {};

  const oldSocieties = normalizeList(old.societies || {});
  const oldFlats = normalizeList(old.flats || {});
  const oldPayments = normalizeList(old.payments || {});
  const oldExpenses = normalizeList(old.expenses || {});
  const oldRateHistory = normalizeList(old.rateHistory || {});
  const oldUsers = normalizeList(old.users || {});

  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const societyIds =
    oldSocieties.length > 0
      ? oldSocieties.map((s) => s.id || "default_society")
      : ["default_society"];

  const updates = {};

  console.log("Creating society SaaS profiles...");

  if (oldSocieties.length === 0) {
    updates["societies/default_society/profile"] = {
      id: "default_society",
      name: "Default Society",
      address: "",
      active: true,
      planId: "starter",
      subscriptionStatus: "trial",
      createdAt: now,
      updatedAt: now,
    };
  }

  for (const society of oldSocieties) {
    const societyId = society.id || "default_society";

    updates[`societies/${societyId}/profile`] = cleanUndefined({
      id: societyId,
      name: society.name || "Unnamed Society",
      address: society.address || "",
      active: society.active !== false,
      planId: society.planId || "starter",
      subscriptionStatus: society.subscriptionStatus || "trial",
      createdAt: society.createdAt || now,
      updatedAt: now,
    });

    updates[`societies/${societyId}/paymentSettings`] = cleanUndefined({
      upiId: old.paymentSettings?.upiId || "",
      qrImage: old.paymentSettings?.qrImage || "",
      gatewayEnabled: false,
      updatedBy: old.paymentSettings?.updatedBy || "",
      updatedAt: old.paymentSettings?.updatedAt || now,
    });

    updates[`societies/${societyId}/subscription`] = cleanUndefined({
      planId: society.planId || "starter",
      status: society.subscriptionStatus || "trial",
      billingCycle: "monthly",
      maxFlats: 25,
      billingAmount: 499,
      startDate: today,
      endDate: "",
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log("Migrating flats...");

  for (const flat of oldFlats) {
    const societyId = flat.societyId || "default_society";
    const flatId = flat.id;

    if (!flatId) continue;

    updates[`societies/${societyId}/flats/${flatId}`] = cleanUndefined({
      id: flatId,
      flatNo: flat.flatNo || "",
      ownerName: flat.ownerName || "",
      phone: flat.phone || "",
      openingDue: Number(flat.openingDue || 0),
      active: flat.active !== false,
      advance: Number(flat.advance || 0),
      createdAt: flat.createdAt || now,
      updatedAt: now,
    });
  }

  console.log("Migrating payments...");

  for (const payment of oldPayments) {
    const societyId = payment.societyId || "default_society";
    const paymentId = payment.id;

    if (!paymentId) continue;

    updates[`societies/${societyId}/payments/${paymentId}`] = cleanUndefined({
      id: paymentId,
      flatId: payment.flatId || "",
      amount: Number(payment.amount || 0),
      mode: payment.mode || "Cash",
      date: payment.date || today,
      forMonth: payment.forMonth || payment.month || payment.paymentMonth || "",
      note: payment.note || "",
      verified: payment.verified ?? true,
      gatewayPaymentId: payment.gatewayPaymentId || "",
      createdBy: payment.createdBy || "",
      createdAt: payment.createdAt || now,
      updatedAt: now,
    });
  }

  console.log("Migrating expenses...");

  for (const expense of oldExpenses) {
    const societyId = expense.societyId || "default_society";
    const expenseId = expense.id;

    if (!expenseId) continue;

    updates[`societies/${societyId}/expenses/${expenseId}`] = cleanUndefined({
      id: expenseId,
      amount: Number(expense.amount || 0),
      category: expense.category || "General",
      date: expense.date || today,
      note: expense.note || "",
      createdBy: expense.createdBy || "",
      createdAt: expense.createdAt || now,
      updatedAt: now,
    });
  }

  console.log("Migrating rate history...");

  for (const rate of oldRateHistory) {
    const societyId = rate.societyId || "default_society";
    const rateId = rate.id;

    if (!rateId) continue;

    updates[`societies/${societyId}/rateHistory/${rateId}`] = cleanUndefined({
      id: rateId,
      fromMonth: rate.fromMonth || "",
      amount: Number(rate.amount || 0),
      createdAt: rate.createdAt || now,
      updatedAt: now,
    });
  }

  console.log("Migrating users...");

  for (const user of oldUsers) {
    const userId = user.id || `user_${user.phone || now}`;

    const fallbackSocieties =
      user.role === "Super Admin" ? societyIds : [];

    const societyIdsMap = toSocietyIdsMap(user.societyIds, fallbackSocieties);

    updates[`users/${userId}`] = cleanUndefined({
      ...user,
      id: userId,
      societyIds: societyIdsMap,
      updatedAt: now,
    });
  }

  console.log("Creating SaaS plans...");

  updates["plans/starter"] = {
    id: "starter",
    name: "Starter",
    monthlyPrice: 499,
    yearlyPrice: 4999,
    maxFlats: 25,
    maxManagers: 1,
    whatsappEnabled: false,
    paymentGatewayEnabled: false,
    active: true,
  };

  updates["plans/growth"] = {
    id: "growth",
    name: "Growth",
    monthlyPrice: 999,
    yearlyPrice: 9999,
    maxFlats: 75,
    maxManagers: 3,
    whatsappEnabled: true,
    paymentGatewayEnabled: false,
    active: true,
  };

  updates["plans/pro"] = {
    id: "pro",
    name: "Pro",
    monthlyPrice: 1999,
    yearlyPrice: 19999,
    maxFlats: 200,
    maxManagers: 10,
    whatsappEnabled: true,
    paymentGatewayEnabled: true,
    active: true,
  };

  updates["superAdminAnalytics/migrationVersion"] = "saas-v1";
  updates["superAdminAnalytics/lastMigrationAt"] = now;

  console.log("Writing SaaS structure to Firebase...");
  await update(ref(db), updates);

  console.log("✅ SaaS migration complete.");
  console.log("Old root nodes are untouched. Do not delete them yet.");
}

migrateToSaas().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});