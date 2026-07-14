import React, { useEffect, useMemo, useState } from "react";
import { ref, onValue, set, push, update, remove, get } from "firebase/database";
import { db } from "./firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { auth } from "./firebase";
import "./App.css";
import logo from "./assets/socioledger-logo.png";
import socioLedgerIcon from "./assets/socioledger-app-icon.png";
import vioraIcon from "./assets/viora-app-icon.png";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const roles = {
  SUPER_ADMIN: "super_admin",
  MANAGER: "manager",
  RESIDENT: "resident",
};

const roleLabels = {
  super_admin: "Super Admin",
  manager: "Building Manager",
  resident: "Resident",
  "Super Admin": "Super Admin",
  "Building Manager": "Building Manager",
  Resident: "Resident",
};

const emptyFlatForm = {
  id: "",
  flatNo: "",
  ownerName: "",
  phone: "",
  openingDue: "",
};

const initialData = {
  users: [],
  societies: [],
  flats: [],
  rateHistory: [],
  payments: [],
  expenses: [],
  paymentSettings: {
    upiId: "",
    qrImage: "",
    gatewayEnabled: false,
  },
  subscription: null,
};

const seedUsers = {
  super_admin: {
    id: "super_admin",
    phone: "9999999999",
    role: roles.SUPER_ADMIN,
    name: "Super Admin",
  },
  manager: {
    id: "manager",
    phone: "8888888888",
    role: roles.MANAGER,
    name: "Manager",
    password: "123456",
    societyIds: ["default_society"],
  },
};

const seedRateHistory = {
  rate_2025_12: {
    id: "rate_2025_12",
    fromMonth: "2025-12",
    amount: 1000,
  },
  rate_2026_04: {
    id: "rate_2026_04",
    fromMonth: "2026-04",
    amount: 800,
  },
};

const seedSocieties = {
  default_society: {
    id: "default_society",
    name: "Default Society",
    address: "",
    active: true,
    createdAt: Date.now(),
  },
};

const seedPaymentSettings = {
  upiId: "",
  qrImage: "",
  updatedAt: 0,
};

function normalizePhone(phone = "") {
  return String(phone).replace(/\D/g, "").slice(-10);
}

function phoneToEmail(phone = "") {
  return `${normalizePhone(phone)}@socioledger.local`;
}

/**
 * Backward-compatible Firebase Auth aliases.
 * Older SocioLedger users may have been created with a different synthetic
 * email suffix. Keep all known variants here so mobile-number login remains
 * compatible without changing existing Firebase Auth users.
 */
function getLoginEmailCandidates(phone = "") {
  const normalizedPhone = normalizePhone(phone);

  if (normalizedPhone.length !== 10) return [];

  return [
    `${normalizedPhone}@socioledger.local`,
    `${normalizedPhone}@socioledger.com`,
    `${normalizedPhone}@socioledger.in`,
  ];
}

function findLegacyUserProfile(usersValue, authUser, profileHint = null) {
  if (!usersValue || !authUser) return null;

  const authEmail = String(authUser.email || "").trim().toLowerCase();
  const hintedEmail = String(
    profileHint?.email || profileHint?.loginEmail || profileHint?.authEmail || ""
  ).trim().toLowerCase();

  const authPhone = normalizePhone(
    profileHint?.phone ||
      profileHint?.mobile ||
      profileHint?.mobileNumber ||
      authUser.phoneNumber ||
      authEmail.split("@")[0]
  );

  for (const [key, profileValue] of Object.entries(usersValue)) {
    if (key === authUser.uid) continue;

    const profile = profileValue || {};
    const profileUid = String(profile.uid || profile.authUid || "").trim();
    const profileEmail = String(
      profile.email || profile.loginEmail || profile.authEmail || ""
    ).trim().toLowerCase();
    const profilePhone = normalizePhone(
      profile.phone || profile.mobile || profile.mobileNumber || ""
    );

    const keyPhone = normalizePhone(key);
    const keyMatchesPhone =
      key === `resident_${authPhone}` ||
      key === `manager_${authPhone}` ||
      (!!authPhone && keyPhone === authPhone);

    if (
      profileUid === authUser.uid ||
      (!!authEmail && profileEmail === authEmail) ||
      (!!hintedEmail && profileEmail === hintedEmail) ||
      (!!authPhone && profilePhone === authPhone) ||
      keyMatchesPhone
    ) {
      return {
        key,
        profile,
      };
    }
  }

  return null;
}

function mergeBooleanMaps(...values) {
  const merged = {};

  values.forEach((value) => {
    normalizeBooleanMapIds(value).forEach((id) => {
      merged[String(id)] = true;
    });
  });

  return merged;
}

function mergeFlatIdMaps(...values) {
  const merged = {};

  values.forEach((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;

    Object.entries(value).forEach(([societyId, flatIds]) => {
      merged[societyId] = {
        ...(merged[societyId] || {}),
        ...mergeBooleanMaps(flatIds),
      };
    });
  });

  return merged;
}

function mergeUserProfiles(legacyProfile, directProfile) {
  const legacy = legacyProfile || {};
  const direct = directProfile || {};

  return {
    ...legacy,
    ...direct,
    societyIds: mergeBooleanMaps(
      legacy.societyIds,
      legacy.societyId,
      legacy.assignedSocietyId,
      legacy.assignedSocieties,
      direct.societyIds,
      direct.societyId,
      direct.assignedSocietyId,
      direct.assignedSocieties
    ),
    flatIds: mergeFlatIdMaps(legacy.flatIds, direct.flatIds),
    flatId: direct.flatId || legacy.flatId || "",
  };
}

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(monthKey) {
  if (monthKey === "OPENING") return "Opening Due";
  if (!monthKey || !monthKey.includes("-")) return "-";

  const [y, m] = monthKey.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function rupee(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function getExpenseMonth(expense) {
  return String(expense?.date || expense?.expenseDate || "").slice(0, 7);
}

function toDateOnly(dateValue) {
  if (!dateValue) return new Date();

  if (typeof dateValue === "number") {
    return new Date(dateValue);
  }

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

function getSubscriptionAccess(subscription) {
  const today = getTodayISO();

  if (!subscription) {
    return {
      status: "trial",
      blocked: false,
      label: "Trial",
      trialEndsAt: "",
      daysLeft: 15,
    };
  }

  const status = subscription.status || "trial";

  const trialStart =
    subscription.trialStartDate ||
    subscription.startDate ||
    subscription.createdAt ||
    today;

  const trialEndsAt = subscription.trialEndsAt || addDaysISO(trialStart, 15);
  const endDate = subscription.endDate || "";

  const isActivePaid = status === "active" && (!endDate || endDate >= today);
  const isTrialValid = status === "trial" && trialEndsAt >= today;

  const blocked =
    status === "blocked" ||
    status === "expired" ||
    status === "past_due" ||
    (!isActivePaid && !isTrialValid);

  const daysLeft = Math.max(
    Math.ceil((toDateOnly(trialEndsAt) - toDateOnly(today)) / (1000 * 60 * 60 * 24)),
    0
  );

  return {
    status,
    blocked,
    label: isActivePaid ? "Active" : isTrialValid ? "Trial" : "Expired",
    trialEndsAt,
    endDate,
    daysLeft,
  };
}

function monthRange(start, end) {
  const result = [];
  if (!start || !end) return result;

  let [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);

  while (sy < ey || (sy === ey && sm <= em)) {
    result.push(`${sy}-${String(sm).padStart(2, "0")}`);
    sm++;

    if (sm > 12) {
      sm = 1;
      sy++;
    }
  }

  return result;
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

function normalizeSocieties(value) {
  if (!value) return [];

  return Object.entries(value).map(([id, society]) => ({
    id,
    ...(society.profile || society),
  }));
}

function societyPath(societyId, child = "") {
  return child ? `societies/${societyId}/${child}` : `societies/${societyId}`;
}

function normalizeRole(role = "") {
  const value = String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (["super_admin", "superadmin", "admin"].includes(value)) return roles.SUPER_ADMIN;
  if (["manager", "building_manager", "buildingmanager"].includes(value)) return roles.MANAGER;
  if (["resident", "flat_owner", "flatowner"].includes(value)) return roles.RESIDENT;

  return value;
}

function normalizeBooleanMapIds(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }

  if (typeof value === "object") {
    return Object.keys(value).filter((id) => value[id] === true || value[id] === "true" || value[id] === 1);
  }

  return [String(value)].filter(Boolean);
}

function getUserSocietyIds(user) {
  const ids = new Set();

  [
    user?.societyIds,
    user?.societyId,
    user?.assignedSocietyId,
    user?.assignedSocieties,
    user?.societies,
    user?.buildingId,
  ].forEach((value) => {
    normalizeBooleanMapIds(value).forEach((id) => ids.add(String(id)));
  });

  if (user?.flatIds && typeof user.flatIds === "object" && !Array.isArray(user.flatIds)) {
    Object.keys(user.flatIds).forEach((societyId) => ids.add(String(societyId)));
  }

  return Array.from(ids);
}

function canAccessSociety(user, societyId) {
  if (!user || !societyId) return false;

  if (normalizeRole(user.role) === roles.SUPER_ADMIN) return true;

  return getUserSocietyIds(user).includes(String(societyId));
}

function getUserFlatIds(user, societyId) {
  const ids = new Set();

  normalizeBooleanMapIds(user?.flatIds?.[societyId]).forEach((id) => ids.add(id));
  normalizeBooleanMapIds(user?.flatIds).forEach((id) => ids.add(id));

  if (user?.flatId) ids.add(String(user.flatId));

  return Array.from(ids);
}

function isFlatLinkedToUser(flat, user, authUser, societyId) {
  if (!flat || !user) return false;

  const flatId = String(flat.id || "");
  const linkedFlatIds = getUserFlatIds(user, societyId);
  const userIds = [authUser?.uid, user?.uid, user?.id].filter(Boolean).map(String);
  const userPhone = normalizePhone(user?.phone);
  const flatPhone = normalizePhone(flat?.phone);

  return (
    linkedFlatIds.includes(flatId) ||
    userIds.includes(String(flat.residentUid || "")) ||
    (!!userPhone && userPhone === flatPhone)
  );
}


function toMoney(value) {
  const n = Number(String(value ?? 0).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function getPaymentAmount(payment) {
  return toMoney(
    payment?.amount ??
      payment?.paidAmount ??
      payment?.paymentAmount ??
      payment?.receivedAmount ??
      payment?.amountReceived ??
      payment?.collectedAmount ??
      payment?.advanceAmount ??
      payment?.totalAmount
  );
}


function getEffectivePaymentAmount(payment, flat, data) {
  const amount = getPaymentAmount(payment);

  // Legacy production data correction:
  // Rajat / Flat 201 has one combined April 2026 entry saved as ₹5800
  // with note "Carried Forward from Previous months and last amount received included".
  // Business meaning confirmed: only ₹1000 was the April-side receipt; ₹800
  // belongs to April maintenance and only ₹200 should move to May as advance.
  // Without this correction the generic wallet engine sees ₹1000 surplus and
  // incorrectly consumes ₹800 in May + ₹200 in June.
  const isRajatFlat201 =
    normalizeText(flat?.ownerName).includes("rajat") ||
    normalizeText(flat?.flatNo) === "201" ||
    normalizePhone(flat?.phone) === "8950701015";

  const isRajatAprilCombinedEntry =
    isRajatFlat201 &&
    String(payment?.id || "") === "-OrwmuwfCdwtA2pULu1c" &&
    getPaymentMonth(payment) === "2026-04" &&
    amount === 5800;

  if (isRajatAprilCombinedEntry) {
    const aprilCharge = getRateForMonth(data.rateHistory, "2026-04") || 800;
    return Math.max(0, amount - aprilCharge);
  }

  return amount;
}

function getPaymentMonth(payment) {
  const directMonth =
    payment?.forMonth ||
    payment?.month ||
    payment?.paymentMonth ||
    payment?.maintenanceMonth ||
    payment?.billingMonth ||
    payment?.advanceMonth;

  if (directMonth) {
    const normalizedDirectMonth = normalizePaymentMonthValue(directMonth, payment);
    if (normalizedDirectMonth) return normalizedDirectMonth;
  }

  const date = payment?.date || payment?.paymentDate || payment?.paidAt || payment?.createdAt;
  return normalizePaymentMonthValue(date, payment);
}

function normalizePaymentMonthValue(value, payment = {}) {
  if (!value) return "";

  const text = String(value).trim();
  const yearMonthMatch = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);

  if (!yearMonthMatch) return "";

  const year = yearMonthMatch[1];
  const month = Number(yearMonthMatch[2]);

  if (month >= 1 && month <= 12) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  // Legacy production data safety:
  // A few carried-forward records were saved with an invalid date like
  // 2026-31-31. Slicing that to 2026-31 makes the ledger treat the payment
  // as covering all future months. For carried-forward maintenance entries,
  // anchor such invalid dates to the April 2026 close month used in the
  // imported production ledger. This fixes Simi/Saad without changing DB data.
  const note = normalizeText(payment?.note);
  if (note.includes("carried forward") || note.includes("previous months")) {
    return `${year}-04`;
  }

  return "";
}

function getPaymentAppliedUntilMonth(payment) {
  const month = getPaymentMonth(payment);
  if (month && month !== "OPENING") return month;

  const date = payment?.date || payment?.paymentDate || payment?.paidAt || payment?.createdAt;
  if (typeof date === "string" && date.length >= 7) return date.slice(0, 7);

  return "";
}



function addMonthsToMonthKey(monthKey, offset) {
  if (!monthKey || !monthKey.includes("-")) return "";

  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";

  const date = new Date(year, month - 1 + Number(offset || 0), 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getPaymentCoverageInfo(payment, flat, data, effectiveAmount, appliedUntilMonth) {
  const rate = getRateForMonth(data.rateHistory, appliedUntilMonth) || getRateForMonth(data.rateHistory, getCurrentMonth()) || 0;
  const amount = toMoney(effectiveAmount);

  if (!appliedUntilMonth || appliedUntilMonth === "OPENING" || rate <= 0 || amount <= 0) {
    return { coverageEndMonth: "", isWholeMonthPackage: false };
  }

  const coveredMonthCount = Math.max(1, Math.ceil(amount / rate));
  const coverageEndMonth = addMonthsToMonthKey(appliedUntilMonth, coveredMonthCount - 1);
  const isWholeMonthPackage = amount > rate && Math.abs(amount % rate) < 0.001;

  return { coverageEndMonth, isWholeMonthPackage };
}

function isMonthOnOrAfter(month, startMonth) {
  if (!startMonth) return true;
  if (month === "OPENING") return false;
  if (!month || !month.includes("-")) return false;
  return month >= startMonth;
}

function getNextMonthKey(monthKey) {
  if (!monthKey || !monthKey.includes("-")) return "";

  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";

  const next = new Date(year, month, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function isMonthOnOrBefore(month, limitMonth) {
  if (!limitMonth) return true;
  if (month === "OPENING") return true;
  if (!month || !month.includes("-")) return true;
  return month <= limitMonth;
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isPaymentForFlat(payment, flat) {
  if (!payment || !flat) return false;

  const paymentFlatIds = [payment.flatId, payment.flatID, payment.flatKey, payment.unitId, payment.residentFlatId]
    .filter(Boolean)
    .map(String);

  if (paymentFlatIds.includes(String(flat.id))) return true;

  const paymentFlatNos = [payment.flatNo, payment.flatNumber, payment.unitNo, payment.unitNumber]
    .filter(Boolean)
    .map(normalizeText);

  if (paymentFlatNos.includes(normalizeText(flat.flatNo))) return true;

  const paymentPhones = [payment.phone, payment.mobile, payment.residentPhone, payment.ownerPhone]
    .map(normalizePhone)
    .filter(Boolean);

  if (paymentPhones.includes(normalizePhone(flat.phone))) return true;

  const paymentResidentIds = [payment.residentUid, payment.residentId, payment.userId, payment.uid]
    .filter(Boolean)
    .map(String);

  return paymentResidentIds.includes(String(flat.residentUid || ""));
}


function getLegacyAdvanceOverride(_flat, computedAdvance) {
  // Kept as a backward-compatible hook for older deployments.
  // Advance is now consumed by the next month's ledger entry, so no flat-level
  // hardcode is required for Rajat 201 or Ashwini 203.
  return computedAdvance;
}

function getRateForMonth(rateHistory, monthKey) {
  const validRates = [...rateHistory]
    .filter((rate) => rate.fromMonth <= monthKey)
    .sort((a, b) => b.fromMonth.localeCompare(a.fromMonth));

  return Number(validRates[0]?.amount || 0);
}

function getLaterMonth(a, b) {
  if (!a) return b || getCurrentMonth();
  if (!b) return a || getCurrentMonth();
  return String(a) >= String(b) ? a : b;
}

function buildLedger(flat, data, throughMonth = getCurrentMonth()) {
  const currentMonth = getLaterMonth(getCurrentMonth(), throughMonth);

  const firstRateMonth =
    [...data.rateHistory].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth))[0]?.fromMonth || currentMonth;

  const months = monthRange(firstRateMonth, currentMonth);

  const entries = months.map((month) => {
    const charge = getRateForMonth(data.rateHistory, month);

    return {
      month,
      charge,
      paid: 0,
      directPaid: 0,
      advanceAdjusted: 0,
      due: charge,
    };
  });

  if (Number(flat.openingDue || 0) > 0) {
    entries.unshift({
      month: "OPENING",
      charge: Number(flat.openingDue || 0),
      paid: 0,
      directPaid: 0,
      advanceAdjusted: 0,
      due: Number(flat.openingDue || 0),
    });
  }

  const flatPayments = data.payments
    .filter((p) => {
      if (!isPaymentForFlat(p, flat)) return false;

      const isOpeningPayment = getPaymentMonth(p) === "OPENING";

      if (isOpeningPayment && Number(flat.openingDue || 0) <= 0) return false;

      return true;
    })
    .sort((a, b) => {
      const aDate = a.date || a.paymentDate || a.paidAt || a.createdAt || 0;
      const bDate = b.date || b.paymentDate || b.paidAt || b.createdAt || 0;
      return new Date(aDate).getTime() - new Date(bDate).getTime();
    });

  const applyAmountToEntries = (rawAmount, predicate, source = "direct") => {
    let amount = toMoney(rawAmount);

    for (const entry of entries) {
      if (amount <= 0) break;
      if (!predicate(entry)) continue;
      if (entry.due <= 0) continue;

      const adjusted = Math.min(entry.due, amount);
      entry.paid += adjusted;
      if (source === "advance") entry.advanceAdjusted += adjusted;
      else entry.directPaid += adjusted;
      entry.due -= adjusted;
      amount -= adjusted;
    }

    return amount;
  };

  let advance = toMoney(flat.advance || flat.openingAdvance || flat.advanceBalance || 0);

  if (advance > 0) {
    advance = applyAmountToEntries(advance, (entry) => entry.month !== "OPENING", "advance");
  }

  for (const payment of flatPayments) {
    const originalPaymentAmount = getEffectivePaymentAmount(payment, flat, data);
    let amount = originalPaymentAmount;
    const appliedUntilMonth = getPaymentAppliedUntilMonth(payment);
    const { coverageEndMonth, isWholeMonthPackage } = getPaymentCoverageInfo(
      payment,
      flat,
      data,
      originalPaymentAmount,
      appliedUntilMonth
    );

    // Production accounting rule:
    // 1) Payment first clears dues up to the month it belongs to.
    // 2) Any extra becomes an advance wallet and is consumed month-by-month in
    //    the future: 800, then 800, then partial 200, etc.
    // 3) Whole-month advance packages are capped to their natural coverage
    //    window. Example: ₹3200 paid in Apr at ₹800/month covers Apr-Jul only;
    //    it must not keep rolling into Aug because another legacy entry already
    //    covered one of those months.
    amount = applyAmountToEntries(
      amount,
      (entry) => isMonthOnOrBefore(entry.month, appliedUntilMonth),
      "direct"
    );

    if (amount > 0) {
      amount = applyAmountToEntries(
        amount,
        (entry) =>
          entry.month !== "OPENING" &&
          !isMonthOnOrBefore(entry.month, appliedUntilMonth) &&
          (!coverageEndMonth || isMonthOnOrBefore(entry.month, coverageEndMonth)),
        "advance"
      );
    }

    if (amount > 0) {
      if (!isWholeMonthPackage || !coverageEndMonth || isMonthOnOrAfter(coverageEndMonth, currentMonth)) {
        advance += amount;
      }
    }
  }

  const totalDue = entries.reduce((sum, e) => sum + e.due, 0);
  const visibleAdvance = getLegacyAdvanceOverride(flat, advance);

  return {
    entries,
    totalDue,
    advance: visibleAdvance,
    netPayable: totalDue,
    totalCharge: entries.reduce((sum, e) => sum + e.charge, 0),
    totalAdjusted: entries.reduce((sum, e) => sum + e.paid, 0),
    totalPaid: flatPayments.reduce((sum, p) => sum + getEffectivePaymentAmount(p, flat, data), 0),
  };
}

function getMonthPaymentInfo(flat, data, monthKey) {
  const ledger = buildLedger(flat, data, monthKey);
  const entry = ledger.entries.find((e) => e.month === monthKey);

  const charge = Number(entry?.charge ?? getRateForMonth(data.rateHistory, monthKey) ?? 0);

  const monthPaid = data.payments
    .filter((p) => {
      if (!isPaymentForFlat(p, flat)) return false;

      const forMonth = getPaymentMonth(p);
      if (forMonth) return forMonth === monthKey;

      return false;
    })
    .reduce((sum, p) => sum + getPaymentAmount(p), 0);

  const availableAdvance = Number(ledger.advance || 0);
  const monthAdvanceAdjusted = Number(entry?.advanceAdjusted || 0);

  // Advance is already consumed inside buildLedger. Do not subtract it again
  // from total due, otherwise due silently becomes lower than the actual ledger.
  const paid = Number(entry?.paid ?? monthPaid ?? 0);
  const due = Math.max(Number(entry?.due ?? charge - paid), 0);
  const grossTotalDue = Number(ledger.totalDue || 0);
  const netPayable = grossTotalDue;

  let status = "Pending";

  if (charge <= 0) status = "No Charge";
  else if (due <= 0) status = "Paid";
  else if (paid > 0) status = "Partial";

  return {
    charge,
    paid,
    due,
    status,
    totalDue: grossTotalDue,
    advance: availableAdvance,
    advanceAdjusted: monthAdvanceAdjusted,
    netPayable,
  };
}

function downloadCSV(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}


function NeoLoginIcon({ type, className = "" }) {
  const common = {
    viewBox: "0 0 24 24",
    className,
    "aria-hidden": "true",
  };

  if (type === "key") return <svg {...common}><circle cx="8" cy="12" r="3"/><path d="M11 12h9m-3 0v3m-3-3v2"/></svg>;
  if (type === "camera") return <svg {...common}><path d="M3 7h12v10H3z"/><path d="m15 10 6-3v10l-6-3z"/><circle cx="9" cy="12" r="2.5"/></svg>;
  if (type === "lift") return <svg {...common}><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M12 6v14M8 3l-2 2m2-2 2 2m6 0 2-2m-2 2-2-2"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/></svg>;
  if (type === "building") return <svg {...common}><path d="M4 21V6l8-3v18M12 9h8v12M7 8h2m-2 4h2m-2 4h2m8-4h1m-1 4h1M2 21h20"/></svg>;
  if (type === "rupee") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M8 7h8M8 10h8M9 7c4 0 5 5 0 5l6 5"/></svg>;
  if (type === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (type === "shield") return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-5"/></svg>;
  if (type === "door") return <svg {...common}><path d="M4 21h16M6 21V4l10-2v19M16 5h3v16"/><circle cx="13" cy="12" r=".7"/></svg>;
  if (type === "phone") return <svg {...common}><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/></svg>;
  if (type === "lock") return <svg {...common}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
  if (type === "eye") return <svg {...common}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
  if (type === "eyeOff") return <svg {...common}><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A11 11 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-2 3M6.6 6.6C3.5 8.4 2 12 2 12s3.5 8 10 8a10 10 0 0 0 4.1-.9"/></svg>;
  if (type === "bolt") return <svg {...common}><path d="m13 2-9 12h8l-1 8 9-12h-8z"/></svg>;
  return null;
}

export default function App() {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  const [user, setUser] = useState(null);
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [resetPhone, setResetPhone] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [authUser, setAuthUser] = useState(null);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [darkMode, setDarkMode] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [selectedFlatId, setSelectedFlatId] = useState("");
  const [selectedSocietyId, setSelectedSocietyId] = useState("default_society");
  const [reportMonth, setReportMonth] = useState(getCurrentMonth());
  const [statusMonth, setStatusMonth] = useState(getCurrentMonth());
  const [dashboardMonth, setDashboardMonth] = useState(getCurrentMonth());
  const [expenseMonth, setExpenseMonth] = useState(getCurrentMonth());
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState("All");

  const [payModalFlatId, setPayModalFlatId] = useState("");

  function openTab(tabName) {
    setActiveTab(tabName);
    setMobileNavOpen(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    });
  }

  const [flatForm, setFlatForm] = useState(emptyFlatForm);

  const [rateForm, setRateForm] = useState({
    fromMonth: getCurrentMonth(),
    amount: "",
  });

  const [paymentForm, setPaymentForm] = useState({
    flatId: "",
    amount: "",
    mode: "Cash",
    date: new Date().toISOString().slice(0, 10),
    forMonth: getCurrentMonth(),
    note: "",
  });

  const [expenseForm, setExpenseForm] = useState({
    amount: "",
    category: "General",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });

  const [paymentSettingsForm, setPaymentSettingsForm] = useState({
    upiId: "",
    qrImage: "",
  });

  const [societyForm, setSocietyForm] = useState({
    id: "",
    name: "",
    address: "",
  });

  const [managerForm, setManagerForm] = useState({
    id: "",
    name: "",
    phone: "",
    password: "",
    societyIds: [],
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthUser(firebaseUser || null);
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

useEffect(() => {
  if (!authReady) return;

  if (!authUser) {
    setUser(null);
    setData(initialData);
    setSelectedSocietyId("default_society");
    setLoading(false);
    return;
  }

  let unsubUsers = () => {};
  let unsubSocieties = () => {};
  let disposed = false;

  const attachProfile = async () => {
    setLoading(true);

    try {
      const [directSnapshot, usersSnapshot] = await Promise.all([
        get(ref(db, `users/${authUser.uid}`)),
        get(ref(db, "users")),
      ]);

      const directProfile = directSnapshot.val();
      const usersValue = usersSnapshot.val() || {};
      const legacyMatch = findLegacyUserProfile(usersValue, authUser, directProfile);
      const legacyProfileKey = legacyMatch?.key || "";

      // A manager may have a canonical UID profile created by a later auth
      // migration while the original manager record still owns societyIds.
      // Merge both records instead of treating the incomplete UID record as
      // authoritative and silently removing manager access.
      const profile = mergeUserProfiles(legacyMatch?.profile, directProfile);

      if (disposed) return;

      if (!profile || Object.keys(profile).length === 0 || profile.active === false) {
        setUser(null);
        setLoading(false);
        return;
      }

      const loggedUser = {
        ...profile,
        id: authUser.uid,
        uid: authUser.uid,
        role: normalizeRole(profile.role),
      };

      setUser(loggedUser);

      // Production-safe self-heal: persist merged role/society assignments to
      // the canonical UID record. The legacy record is intentionally retained.
      if (legacyProfileKey && legacyProfileKey !== authUser.uid) {
        update(ref(db, `users/${authUser.uid}`), {
          ...profile,
          id: authUser.uid,
          uid: authUser.uid,
          legacyProfileKey,
          updatedAt: Date.now(),
        }).catch((error) => {
          console.warn("User profile self-heal skipped", error);
        });
      }

      const loginSocietyIds = getUserSocietyIds(loggedUser);

      if (loggedUser.role === roles.MANAGER && loginSocietyIds.length === 0) {
        console.error("Manager has no society assignment after profile merge", {
          uid: authUser.uid,
          phone: loggedUser.phone,
          legacyProfileKey,
        });
      }

      unsubSocieties();
      unsubUsers();

      if (loggedUser.role === roles.SUPER_ADMIN) {
        unsubSocieties = onValue(ref(db, "societies"), (societySnapshot) => {
          const societies = normalizeSocieties(societySnapshot.val() || {}).sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""))
          );

          setData((prev) => ({
            ...prev,
            societies,
          }));

          setSelectedSocietyId((prev) => prev || societies[0]?.id || "default_society");
        });

        unsubUsers = onValue(ref(db, "users"), (usersSnapshot) => {
          const users = normalizeList(usersSnapshot.val() || [])
            .map((item) => ({ ...item, role: normalizeRole(item.role) }))
            .sort((a, b) =>
              String(a.name || a.phone || "").localeCompare(String(b.name || b.phone || ""))
            );

          setData((prev) => ({
            ...prev,
            users,
          }));
        });
      } else {
        const societyUnsubs = loginSocietyIds.map((societyId) =>
          onValue(ref(db, `societies/${societyId}/profile`), (societySnapshot) => {
            const societyProfile = societySnapshot.val();

            setData((prev) => {
              const withoutCurrent = prev.societies.filter((s) => s.id !== societyId);
              const nextSocieties = societyProfile
                ? [...withoutCurrent, { id: societyId, ...societyProfile }]
                : withoutCurrent;

              return {
                ...prev,
                societies: nextSocieties.sort((a, b) =>
                  String(a.name || "").localeCompare(String(b.name || ""))
                ),
              };
            });
          })
        );

        unsubSocieties = () => {
          societyUnsubs.forEach((unsubscribe) => unsubscribe());
        };

        if (loginSocietyIds[0]) {
          setSelectedSocietyId(loginSocietyIds[0]);
        }
      }

      // Do not force dashboard on every realtime/profile refresh.
      setLoading(false);
    } catch (error) {
      console.error("Unable to load user profile", error);
      if (!disposed) {
        setUser(null);
        setLoading(false);
      }
    }
  };

  attachProfile();

  return () => {
    disposed = true;
    unsubSocieties();
    unsubUsers();
  };
}, [authReady, authUser]);

useEffect(() => {
  if (!authUser || !user || !selectedSocietyId) return;

  if (!canAccessSociety(user, selectedSocietyId)) {
    alert("You do not have access to this society.");
    setSelectedSocietyId("");
    return;
  }

  const basePath = societyPath(selectedSocietyId);

  const unsubFlats = onValue(ref(db, `${basePath}/flats`), (snapshot) => {
    let flats = normalizeList(snapshot.val() || []).sort((a, b) =>
      String(a.flatNo || "").localeCompare(String(b.flatNo || ""), undefined, {
        numeric: true,
      })
    );

    setData((prev) => ({
      ...prev,
      flats,
    }));
  });

  const unsubRates = onValue(ref(db, `${basePath}/rateHistory`), (snapshot) => {
    const rateHistory = normalizeList(snapshot.val() || []).sort((a, b) =>
      String(a.fromMonth || "").localeCompare(String(b.fromMonth || ""))
    );

    setData((prev) => ({
      ...prev,
      rateHistory,
    }));
  });

  const unsubPayments = onValue(ref(db, `${basePath}/payments`), (snapshot) => {
    let payments = normalizeList(snapshot.val() || []).sort(
      (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );

    setData((prev) => ({
      ...prev,
      payments,
    }));
  });

  const unsubExpenses = onValue(ref(db, `${basePath}/expenses`), (snapshot) => {
    const expenses = normalizeList(snapshot.val() || []).sort(
      (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );

    setData((prev) => ({
      ...prev,
      expenses,
    }));
  });

  const unsubPaymentSettings = onValue(
    ref(db, `${basePath}/paymentSettings`),
    (snapshot) => {
      setData((prev) => ({
        ...prev,
        paymentSettings: snapshot.val() || seedPaymentSettings,
      }));
    }
  );

  const unsubSubscription = onValue(
    ref(db, `${basePath}/subscription`),
    (snapshot) => {
      setData((prev) => ({
        ...prev,
        subscription: snapshot.val() || null,
      }));
    }
  );

  return () => {
    unsubFlats();
    unsubRates();
    unsubPayments();
    unsubExpenses();
    unsubPaymentSettings();
    unsubSubscription();
  };
}, [authUser, user, selectedSocietyId]);

  useEffect(() => {
    setPaymentSettingsForm({
      upiId: data.paymentSettings?.upiId || "",
      qrImage: data.paymentSettings?.qrImage || "",
    });
  }, [data.paymentSettings?.upiId, data.paymentSettings?.qrImage]);

  function createFirebaseId(path) {
    return push(ref(db, path)).key;
  }

  function canManage() {
    const role = normalizeRole(user?.role);
    return role === roles.SUPER_ADMIN || role === roles.MANAGER;
  }

  function isSuperAdmin() {
    return normalizeRole(user?.role) === roles.SUPER_ADMIN;
  }

  function canShowPayButton(flat) {
    if (normalizeRole(user?.role) !== roles.RESIDENT) return false;
    return isFlatLinkedToUser(flat, user, authUser, selectedSocietyId);
  }

  const userSocietyIds = getUserSocietyIds(user);

  const currentRole = normalizeRole(user?.role);

  const allowedSocieties =
    currentRole === roles.SUPER_ADMIN
      ? data.societies
      : currentRole === roles.MANAGER
      ? data.societies.filter((s) => userSocietyIds.includes(s.id))
      : data.societies.filter((s) => s.id === selectedSocietyId);

  const societyData = {
    ...data,
    flats: data.flats,
    payments: data.payments,
    expenses: data.expenses,
    rateHistory: data.rateHistory,
  };

  const activeFlats = societyData.flats.filter((flat) => flat.active !== false);

  const visibleFlats =
    currentRole === roles.RESIDENT
      ? societyData.flats.filter((flat) => isFlatLinkedToUser(flat, user, authUser, selectedSocietyId))
      : societyData.flats;

  const selectedFlat = useMemo(() => {
    return visibleFlats.find((flat) => flat.id === selectedFlatId) || visibleFlats[0] || null;
  }, [selectedFlatId, visibleFlats]);

  const payModalFlat = useMemo(() => {
    return societyData.flats.find((flat) => flat.id === payModalFlatId) || null;
  }, [societyData.flats, payModalFlatId]);

  const dashboard = useMemo(() => {
    let totalDue = 0;
    let totalAdvance = 0;
    let totalCharge = 0;

    societyData.flats.forEach((flat) => {
      const ledger = buildLedger(flat, societyData);
      totalDue += ledger.totalDue;
      totalAdvance += ledger.advance;
      totalCharge += ledger.totalCharge;
    });

    const collection = societyData.payments.reduce((sum, payment) => sum + getPaymentAmount(payment), 0);
    const totalExpense = societyData.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    return {
      flats: societyData.flats.length,
      active: activeFlats.length,
      inactive: societyData.flats.length - activeFlats.length,
      totalDue,
      totalAdvance,
      totalCharge,
      collection,
      totalExpense,
      netBalance: collection - totalExpense,
    };
  }, [societyData, activeFlats.length]);

  const dashboardMonthlyExpense = useMemo(() => {
    const expenses = societyData.expenses.filter(
      (expense) => getExpenseMonth(expense) === dashboardMonth
    );

    const categoryTotals = expenses.reduce((acc, expense) => {
      const key = expense.category || "General";
      acc[key] = (acc[key] || 0) + Number(expense.amount || 0);
      return acc;
    }, {});

    const categories = Object.entries(categoryTotals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    return {
      month: dashboardMonth,
      expenses,
      total: expenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0
      ),
      categories,
    };
  }, [societyData.expenses, dashboardMonth]);

  const expenseMonthSummary = useMemo(() => {
    const monthExpenses = societyData.expenses.filter(
      (expense) => getExpenseMonth(expense) === expenseMonth
    );

    const categoryTotals = monthExpenses.reduce((acc, expense) => {
      const key = expense.category || "General";
      acc[key] = (acc[key] || 0) + Number(expense.amount || 0);
      return acc;
    }, {});

    const categories = Object.entries(categoryTotals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const filteredExpenses =
      expenseCategoryFilter === "All"
        ? monthExpenses
        : monthExpenses.filter(
            (expense) =>
              (expense.category || "General") === expenseCategoryFilter
          );

    return {
      total: monthExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0
      ),
      categories,
      expenses: monthExpenses,
      filteredExpenses,
    };
  }, [societyData.expenses, expenseMonth, expenseCategoryFilter]);

  function openExpenseCategory(category = "All", month = dashboardMonth) {
    setExpenseMonth(month);
    setExpenseCategoryFilter(category);
    openTab("expenses");
  }

  const monthlyReport = useMemo(() => {
    const monthPayments = societyData.payments.filter((p) => getPaymentMonth(p) === reportMonth || String(p.date || p.paymentDate || "").startsWith(reportMonth));
    const monthExpenses = societyData.expenses.filter((e) => String(e.date || "").startsWith(reportMonth));

    const collected = monthPayments.reduce((sum, p) => sum + getPaymentAmount(p), 0);
    const expenses = monthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const categoryTotals = monthExpenses.reduce((acc, expense) => {
      const key = expense.category || "General";
      acc[key] = (acc[key] || 0) + Number(expense.amount || 0);
      return acc;
    }, {});

    const modeTotals = monthPayments.reduce((acc, payment) => {
      const key = payment.mode || "Other";
      acc[key] = (acc[key] || 0) + getPaymentAmount(payment);
      return acc;
    }, {});

    return {
      month: reportMonth,
      payments: monthPayments,
      expenses: monthExpenses,
      collected,
      expenseTotal: expenses,
      net: collected - expenses,
      categoryTotals,
      modeTotals,
    };
  }, [societyData.payments, societyData.expenses, reportMonth]);

  const monthlyStatus = useMemo(() => {
    const rows = activeFlats.map((flat) => {
      const info = getMonthPaymentInfo(flat, societyData, statusMonth);
      return { flat, ...info };
    });

    return {
      month: statusMonth,
      rows,
      paidCount: rows.filter((r) => r.status === "Paid").length,
      partialCount: rows.filter((r) => r.status === "Partial").length,
      pendingCount: rows.filter((r) => r.status === "Pending").length,
      totalCharge: rows.reduce((sum, r) => sum + Number(r.charge || 0), 0),
      totalPaid: rows.reduce((sum, r) => sum + Number(r.paid || 0), 0),
      totalMonthDue: rows.reduce((sum, r) => sum + Number(r.due || 0), 0),
      totalAllDue: rows.reduce((sum, r) => sum + Number(r.totalDue || 0), 0),
      totalAdvanceAdjusted: rows.reduce((sum, r) => sum + Number(r.advanceAdjusted || 0), 0),
      totalAdvance: rows.reduce((sum, r) => sum + Number(r.advance || 0), 0),
      totalNetPayable: rows.reduce((sum, r) => sum + Number(r.netPayable || 0), 0),
    };
  }, [activeFlats, societyData, statusMonth]);

  const subscriptionAccess = useMemo(() => {
    return getSubscriptionAccess(data.subscription);
  }, [data.subscription]);

  const isSubscriptionBlocked =
    user &&
    normalizeRole(user.role) !== roles.SUPER_ADMIN &&
    subscriptionAccess.blocked;

  async function login() {
    const identifier = String(loginPhone || "").trim().toLowerCase();
    const password = loginPassword.trim();

    if (!identifier) {
      alert("Please enter your registered mobile number or personal email.");
      return;
    }

    if (!password) {
      alert("Please enter your password.");
      return;
    }

    const isEmail = identifier.includes("@");
    const rawPhone = normalizePhone(identifier);

    if (!isEmail && rawPhone.length !== 10) {
      alert("Please enter a valid 10-digit mobile number or email address.");
      return;
    }

    const emailCandidates = isEmail
      ? [identifier]
      : getLoginEmailCandidates(rawPhone);

    let lastError = null;

    for (const email of emailCandidates) {
      try {
        await signInWithEmailAndPassword(auth, email, password);
        return;
      } catch (error) {
        lastError = error;

        const retryableCodes = [
          "auth/invalid-credential",
          "auth/user-not-found",
          "auth/wrong-password",
          "auth/invalid-login-credentials",
        ];

        if (!retryableCodes.includes(error?.code)) {
          console.error(error);
          break;
        }
      }
    }

    console.error(lastError);

    if (
      lastError?.code === "auth/too-many-requests" ||
      lastError?.code === "auth/user-disabled"
    ) {
      alert(lastError.code);
      return;
    }

    alert(
      "Login failed. Check the mobile/email and password. Residents who changed their Authentication email must log in with their verified personal email."
    );
  }

async function requestPasswordReset() {
  const identifier = String(resetPhone || loginPhone || "").trim().toLowerCase();
  const isEmail = identifier.includes("@");
  const rawPhone = normalizePhone(identifier);

  if (!identifier || (!isEmail && rawPhone.length !== 10)) {
    alert("Please enter your registered personal email or 10-digit mobile number.");
    return;
  }

  setResetLoading(true);

  try {
    const emailCandidates = isEmail
      ? [identifier]
      : getLoginEmailCandidates(rawPhone);

    let resetSent = false;
    let lastMailError = null;

    for (const email of emailCandidates) {
      try {
        await sendPasswordResetEmail(auth, email);
        resetSent = true;
        break;
      } catch (mailError) {
        lastMailError = mailError;
        console.warn(`Firebase reset email skipped for ${email}`, mailError);
      }
    }

    await push(ref(db, "passwordResetRequests"), {
      identifier,
      mobile: isEmail ? "" : rawPhone,
      phone: isEmail ? "" : rawPhone,
      requestedEmail: isEmail ? identifier : "",
      status: resetSent ? "email_sent" : "pending_manual_help",
      source: "login_page",
      createdAt: Date.now(),
    });

    if (!resetSent) throw lastMailError || new Error("Reset email could not be sent.");

    alert("Password reset email sent. Please check your inbox and spam folder.");
    setResetPhone("");
    setResetOpen(false);
  } catch (error) {
    console.error(error);
    alert(
      "Reset email could not be sent. If your Authentication email was changed, enter that verified personal email instead of the mobile number."
    );
  } finally {
    setResetLoading(false);
  }
}

  async function logout() {
    await signOut(auth);

    setUser(null);
    setAuthUser(null);
    setLoginPhone("");
    setLoginPassword("");
    setActiveTab("dashboard");
    setSelectedFlatId("");
    setPayModalFlatId("");
  }
  
  function toggleManagerSociety(societyId) {
    setManagerForm((prev) => {
      const exists = prev.societyIds.includes(societyId);

      return {
        ...prev,
        societyIds: exists
          ? prev.societyIds.filter((id) => id !== societyId)
          : [...prev.societyIds, societyId],
      };
    });
  }

  function editManager(manager) {
    setManagerForm({
      id: manager.id,
      name: manager.name || "",
      phone: manager.phone || "",
      password: manager.password || "",
      societyIds: Array.isArray(manager.societyIds) 
        ? manager.societyIds 
        : Object.keys(manager.societyIds || {}).filter((id) => manager.societyIds[id]),
    });

    setActiveTab("managers");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveManager() {
    if (!isSuperAdmin()) {
      alert("Only Super Admin can manage managers.");
      return;
    }

    const rawPhone = String(managerForm.phone || "").replace(/\D/g, "");
    const phone = rawPhone;
    const password = managerForm.password.trim();

    if (!managerForm.name.trim() || phone.length !== 10 || !password) {
      alert("Manager name, valid phone and password required hai.");
      return;
    }

    const strongPassword =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%^&*!]).{8,}$/.test(password);

    if (!strongPassword) {
      alert(
        "Password strong hona chahiye.\nExample: Abcd@123\n\nMinimum 8 characters with:\n- 1 uppercase\n- 1 lowercase\n- 1 number\n- 1 special character"
      );
      return;
    }

    const societyIdsMap = {};
      managerForm.societyIds.forEach((societyId) => {
      societyIdsMap[societyId] = true;
    });

    const id = managerForm.id || createFirebaseId("users");

    const payload = {
      id,
      name: managerForm.name.trim(),
      phone,
      password: managerForm.password.trim(),
      role: roles.MANAGER,
      active: true,
      societyIds: societyIdsMap,
      updatedAt: Date.now(),
    };

    if (!managerForm.id) {
      payload.createdAt = Date.now();
    }

    await update(ref(db, `users/${id}`), payload);

    setManagerForm({
      id: "",
      name: "",
      phone: "",
      password: "",
      societyIds: [],
    });

    alert(managerForm.id ? "Manager updated." : "Manager added.");
    setActiveTab("dashboard");
    setTimeout(() => {
      setActiveTab("managers");
    }, 50);
  }

  async function toggleManagerStatus(manager) {
    if (!isSuperAdmin()) {
      alert("Only Super Admin can update manager.");
      return;
    }

    await update(ref(db, `users/${manager.id}`), {
      active: manager.active === false ? true : false,
      updatedAt: Date.now(),
    });
  }

async function deleteManager(manager) {
  if (!isSuperAdmin()) {
    alert("Only Super Admin can delete manager.");
    return;
  }

  const ok = window.confirm(
    `Manager "${manager.name || manager.phone}" ko permanently delete karna hai?`
  );

  if (!ok) return;

  await remove(ref(db, `users/${manager.id}`));

  if (managerForm.id === manager.id) {
    setManagerForm({
      id: "",
      name: "",
      phone: "",
      password: "",
      societyIds: [],
    });
  }

  alert("Manager deleted.");
}

async function saveSociety() {
    if (!isSuperAdmin()) {
      alert("Only Super Admin can Manage society.");
      return;
    }

    if (!societyForm.name.trim()) {
      alert("Society name required hai.");
      return;
    }

    if (societyForm.id) {
      await update(ref(db, `societies/${societyForm.id}/profile`), {
        name: societyForm.name.trim(),
        address: societyForm.address.trim(),
        updatedAt: Date.now(),
      });

    alert("Society updated.");
  } else {
    const id = createFirebaseId("societies");

    await set(ref(db, `societies/${id}/profile`), {
      id,
      name: societyForm.name.trim(),
      address: societyForm.address.trim(),
      active: true,
      planId: "starter",
      subscriptionStatus: "trial",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await set(ref(db, `societies/${id}/paymentSettings`), {
  upiId: "",
  qrImage: "",
  gatewayEnabled: false,
  updatedAt: Date.now(),
});

const today = getTodayISO();
await set(ref(db, `societies/${id}/subscription`), {
  planId: "starter",
  status: "trial",
  billingCycle: "monthly",
  maxFlats: 25,
  billingAmount: 499,
  trialStartDate: today,
  trialEndsAt: addDaysISO(today, 15),
  startDate: today,
  endDate: "",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

    setSelectedSocietyId(id);
    alert("Society added.");
  }
    setSelectedFlatId("");
    setSocietyForm({ id: "", name: "", address: "" });
    setActiveTab("societies");
  }

  function editSociety(society) {
    setSocietyForm({
      id: society.id,
      name: society.name || "",
      address: society.address || "",
    });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function toggleSocietyStatus(society) {
  if (!isSuperAdmin()) {
    alert("Only Super Admin can update society.");
    return;
  }

  if (society.id === "default_society" && society.active !== false) {
    alert("Default Society ko deactivate mat karo. Pehle another society active rakho.");
    return;
  }

  await update(ref(db, `societies/${society.id}/profile`), {
    active: society.active === false ? true : false,
    updatedAt: Date.now(),
  });
}

async function deleteSociety(society) {
  if (!isSuperAdmin()) {
    alert("Only Super Admin can delete a society.");
    return;
  }

  if (!society?.id) return;

  if (society.id === "default_society") {
    alert("Happy Homes / default society is protected and cannot be deleted from the app.");
    return;
  }

  const typedName = window.prompt(
    `This permanently deletes ${society.name} and all its flats, payments, expenses, rates, settings and subscription data.\n\nType the society name exactly to continue:`
  );

  if (typedName !== String(society.name || "")) {
    if (typedName !== null) alert("Society name did not match. Nothing was deleted.");
    return;
  }

  const finalConfirm = window.confirm(
    `Final confirmation: permanently delete ${society.name}? This cannot be undone.`
  );
  if (!finalConfirm) return;

  const usersSnapshot = await get(ref(db, "users"));
  const usersValue = usersSnapshot.val() || {};
  const atomicUpdates = {
    [`societies/${society.id}`]: null,
  };

  Object.entries(usersValue).forEach(([userId, profile]) => {
    if (!profile) return;

    if (profile.societyIds?.[society.id] !== undefined) {
      atomicUpdates[`users/${userId}/societyIds/${society.id}`] = null;
    }

    const linkedFlatMap = profile.flatIds?.[society.id];
    if (linkedFlatMap !== undefined) {
      const linkedFlatIds = normalizeBooleanMapIds(linkedFlatMap);
      atomicUpdates[`users/${userId}/flatIds/${society.id}`] = null;

      if (profile.flatId && linkedFlatIds.includes(String(profile.flatId))) {
        atomicUpdates[`users/${userId}/flatId`] = null;
      }
    }
  });

  await update(ref(db), atomicUpdates);

  if (selectedSocietyId === society.id) {
    const fallbackSociety = data.societies.find((item) => item.id !== society.id);
    setSelectedSocietyId(fallbackSociety?.id || "default_society");
    setSelectedFlatId("");
    setActiveTab("dashboard");
  }

  if (societyForm.id === society.id) {
    setSocietyForm({ id: "", name: "", address: "" });
  }

  alert("Society and its linked user assignments were deleted successfully.");
}

async function markSocietyPaid(society) {
  if (!isSuperAdmin()) {
    alert("Only Super Admin can update subscription.");
    return;
  }

  const today = getTodayISO();
  const endDate = addDaysISO(today, 30);

  await update(ref(db, `societies/${society.id}/subscription`), {
    status: "active",
    paidAt: Date.now(),
    lastPaidAt: Date.now(),
    billingCycle: "monthly",
    startDate: today,
    endDate,
    updatedAt: Date.now(),
  });

  await update(ref(db, `societies/${society.id}/profile`), {
    subscriptionStatus: "active",
    updatedAt: Date.now(),
  });

  alert(`Subscription active kar diya. Valid till ${endDate}`);
}

async function blockSocietySubscription(society) {
  if (!isSuperAdmin()) {
    alert("Only Super Admin can block subscription.");
    return;
  }

  const ok = window.confirm(`${society.name} ka subscription block karna hai?`);
  if (!ok) return;

  await update(ref(db, `societies/${society.id}/subscription`), {
    status: "blocked",
    blockedAt: Date.now(),
    updatedAt: Date.now(),
  });

  await update(ref(db, `societies/${society.id}/profile`), {
    subscriptionStatus: "blocked",
    updatedAt: Date.now(),
  });

  alert("Subscription blocked.");
}

async function resetSocietyTrial(society) {
  if (!isSuperAdmin()) {
    alert("Only Super Admin can reset trial.");
    return;
  }

  const today = getTodayISO();

  await update(ref(db, `societies/${society.id}/subscription`), {
    status: "trial",
    trialStartDate: today,
    trialEndsAt: addDaysISO(today, 15),
    startDate: today,
    endDate: "",
    updatedAt: Date.now(),
  });

  await update(ref(db, `societies/${society.id}/profile`), {
    subscriptionStatus: "trial",
    updatedAt: Date.now(),
  });

  alert("15 days trial reset kar diya.");
}

async function saveFlat() {
    if (!canManage()) {
      alert("You do not have permission.");
      return;
    }

    if (!flatForm.flatNo.trim() || !flatForm.ownerName.trim() || !flatForm.phone.trim()) {
      alert("Flat no, owner name aur phone required hai.");
      return;
    }

    const phone = normalizePhone(flatForm.phone);

    if (phone.length !== 10) {
      alert("Valid 10 digit mobile number enter karo.");
      return;
    }

    const duplicateFlat = data.flats.find(
      (flat) =>
        flat.id !== flatForm.id &&
        String(flat.flatNo || "").trim().toLowerCase() === flatForm.flatNo.trim().toLowerCase()
    );

    if (duplicateFlat) {
      alert("Ye flat number already added hai.");
      return;
    }

    const payload = {
      societyId: selectedSocietyId,
      flatNo: flatForm.flatNo.trim(),
      ownerName: flatForm.ownerName.trim(),
      phone,
      openingDue: Number(flatForm.openingDue || 0),
      residentUid: `resident_${phone}`,
    };

    let savedFlatId = flatForm.id;
    
    if (flatForm.id) {
      await update(ref(db, societyPath(selectedSocietyId, `flats/${flatForm.id}`)), payload);
    } else {
      const id = createFirebaseId(societyPath(selectedSocietyId, "flats"));
      savedFlatId = id;

      await set(ref(db, societyPath(selectedSocietyId, `flats/${id}`)), {
        id,
        ...payload,
        active: true,
        advance: 0,
        createdAt: Date.now(),
      });
    }
    const residentUserId = `resident_${phone}`;

    await update(ref(db, `users/${residentUserId}`), {
      id: residentUserId,
      name: flatForm.ownerName.trim(),
      phone,
      role: roles.RESIDENT,
      active: true,
      flatId: savedFlatId,
      flatIds: {
        [selectedSocietyId]: {
          [savedFlatId]: true,
        },
      },
      societyIds: {
        [selectedSocietyId]: true,
      },
      updatedAt: Date.now(),
  });

    setFlatForm(emptyFlatForm);
  }

  function editFlat(flat) {
    setFlatForm({
      id: flat.id,
      flatNo: flat.flatNo || "",
      ownerName: flat.ownerName || "",
      phone: flat.phone || "",
      openingDue: flat.openingDue || "",
    });

    setActiveTab("flats");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deactivateFlat(id) {
    if (!canManage()) return alert("You do not have permission.");
    if (!window.confirm("Is flat ko deactivate karna hai?")) return;

    await update(ref(db, societyPath(selectedSocietyId, `flats/${id}`)), {
      active: false,
      updatedAt: Date.now(),
    });
  }

  async function reactivateFlat(id) {
    if (!canManage()) return alert("You do not have permission.");

    await update(ref(db, societyPath(selectedSocietyId, `flats/${id}`)), {
      active: true,
      updatedAt: Date.now(),
    });
  }

  async function deleteFlat(id) {
    if (!isSuperAdmin()) return alert("Only Super Admin can delete flat.");
    if (!window.confirm("Flat permanently delete karna hai?")) return;

    await remove(ref(db, societyPath(selectedSocietyId, `flats/${id}`)));
    if (selectedFlatId === id) setSelectedFlatId("");
  }

  async function saveRate() {
    if (!canManage()) return alert("You do not have permission.");

    if (!rateForm.fromMonth || !rateForm.amount) {
      alert("Month aur amount required hai.");
      return;
    }

    const existingRate = data.rateHistory.find((rate) => rate.fromMonth === rateForm.fromMonth);
    const id =
      existingRate?.id ||
      createFirebaseId(societyPath(selectedSocietyId, "rateHistory"));

    await set(ref(db, societyPath(selectedSocietyId, `rateHistory/${id}`)), {
      id,
      fromMonth: rateForm.fromMonth,
      amount: Number(rateForm.amount),
      updatedAt: Date.now(),
    });

    setRateForm({
      fromMonth: getCurrentMonth(),
      amount: "",
    });
  }

  async function addPayment() {
    if (!canManage()) return alert("You do not have permission.");

    if (!paymentForm.flatId || !paymentForm.amount) {
      alert("Flat aur amount required hai.");
      return;
    }

    const id = createFirebaseId(societyPath(selectedSocietyId, "payments"));

    const paymentFlat = data.flats.find((flat) => flat.id === paymentForm.flatId);

    await set(ref(db, societyPath(selectedSocietyId, `payments/${id}`)), {
      id,
      flatId: paymentForm.flatId,
      flatNo: paymentFlat?.flatNo || "",
      residentUid: paymentFlat?.residentUid || (paymentFlat?.phone ? `resident_${normalizePhone(paymentFlat.phone)}` : ""),
      amount: Number(paymentForm.amount),
      mode: paymentForm.mode,
      date: paymentForm.date,
      forMonth: paymentForm.forMonth,
      note: paymentForm.note.trim(),
      createdBy: user?.name || "",
      createdAt: Date.now(),
    });

    setPaymentForm({
      flatId: "",
      amount: "",
      mode: "Cash",
      date: new Date().toISOString().slice(0, 10),
      forMonth: getCurrentMonth(),
      note: "",
    });
  }

  async function deletePayment(payment) {
    if (!canManage()) return alert("Only Super Admin / Manager can delete payment.");

    const paymentId = payment?.id;
    if (!paymentId) return alert("Payment id missing hai. Refresh karke dobara try karein.");

    const flat = societyData.flats.find((f) => isPaymentForFlat(payment, f));
    const flatLabel = flat?.flatNo || payment?.flatNo || payment?.flatNumber || "Unknown flat";
    const amountLabel = rupee(getPaymentAmount(payment));
    const monthLabel = formatMonth(getPaymentMonth(payment));

    const ok = window.confirm(
      `${flatLabel} ki ${amountLabel} payment delete karni hai?\nMonth: ${monthLabel}\nDate: ${payment?.date || payment?.paymentDate || "-"}\n\nYe action collection, ledger aur payment status se record hata dega.`
    );
    if (!ok) return;

    const deletedAt = Date.now();
    const deletedBy = user?.name || user?.phone || authUser?.email || "";
    const logId = createFirebaseId(societyPath(selectedSocietyId, "paymentDeletionLogs"));

    await set(ref(db, societyPath(selectedSocietyId, `paymentDeletionLogs/${logId}`)), {
      id: logId,
      paymentId,
      deletedAt,
      deletedBy,
      paymentSnapshot: payment,
    });

    await remove(ref(db, societyPath(selectedSocietyId, `payments/${paymentId}`)));
  }

  async function addExpense() {
    if (!canManage()) return alert("Only Super Admin / Manager can add expense.");

    if (!expenseForm.amount) {
      alert("Expense amount required hai.");
      return;
    }

    const id = createFirebaseId(societyPath(selectedSocietyId, "expenses"));

    await set(ref(db, societyPath(selectedSocietyId, `expenses/${id}`)), {
      id,
      amount: Number(expenseForm.amount),
      category: expenseForm.category,
      date: expenseForm.date,
      note: expenseForm.note.trim(),
      createdBy: user?.name || "",
      createdAt: Date.now(),
    });

    setExpenseForm({
      amount: "",
      category: "General",
      date: new Date().toISOString().slice(0, 10),
      note: "",
    });
  }

  async function deleteExpense(id) {
    if (!isSuperAdmin()) return alert("Only Super Admin can delete expense.");
    if (!window.confirm("Expense permanently delete karna hai?")) return;

    await remove(ref(db, societyPath(selectedSocietyId, `expenses/${id}`)));
  }

  function handleQrUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Only image file upload karo.");
      return;
    }

    if (file.size > 900 * 1024) {
      alert("QR image 900KB se kam rakho. Image compress karke upload karo.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPaymentSettingsForm((prev) => ({
        ...prev,
        qrImage: reader.result,
      }));
    };
    reader.readAsDataURL(file);
  }

  async function savePaymentSettings() {
    if (!canManage()) {
      alert("Only Super Admin / Manager can update payment settings.");
      return;
    }

    await set(ref(db, societyPath(selectedSocietyId, "paymentSettings")), {
      upiId: paymentSettingsForm.upiId.trim(),
      qrImage: paymentSettingsForm.qrImage || "",
      gatewayEnabled: data.paymentSettings?.gatewayEnabled || false,
      updatedBy: user?.name || "",
      updatedAt: Date.now(),
    });

    alert("Payment settings updated.");
  }

  function copyUpiId() {
    const upiId = data.paymentSettings?.upiId || "";
    if (!upiId) {
      alert("Manager ne UPI ID add nahi ki hai.");
      return;
    }

    navigator.clipboard
      ?.writeText(upiId)
      .then(() => alert("UPI ID copied."))
      .catch(() => alert(`UPI ID: ${upiId}`));
  }

  function getWhatsAppLink(flat) {
    const ledger = buildLedger(flat, societyData);

    const message = encodeURIComponent(
      `SocioLedger Receipt\n\n` +
        `Flat: ${flat.flatNo}\n` +
        `Name: ${flat.ownerName}\n` +
        `Total Due: ${rupee(ledger.totalDue)}\n` +
        `Advance: ${rupee(ledger.advance)}\n\n` +
        `Thank you.`
    );

    return `https://wa.me/91${normalizePhone(flat.phone)}?text=${message}`;
  }

  function getWhatsAppSummaryLink() {
    const message = encodeURIComponent(
      `SocioLedger Monthly Summary\n\n` +
        `Month: ${formatMonth(monthlyReport.month)}\n` +
        `Collection: ${rupee(monthlyReport.collected)}\n` +
        `Expense: ${rupee(monthlyReport.expenseTotal)}\n` +
        `Net Balance: ${rupee(monthlyReport.net)}\n\n` +
        `Generated from SocioLedger.`
    );

    return `https://wa.me/?text=${message}`;
  }

  function exportReportCSV() {
    const rows = [
      ["SocioLedger Monthly Report"],
      ["Month", formatMonth(monthlyReport.month)],
      [],
      ["Summary"],
      ["Collection", monthlyReport.collected],
      ["Expense", monthlyReport.expenseTotal],
      ["Net Balance", monthlyReport.net],
      [],
      ["Payments"],
      ["Date", "Flat", "Amount", "Mode", "Note"],
      ...monthlyReport.payments.map((p) => {
        const flat = societyData.flats.find((f) => f.id === p.flatId);
        return [p.date, flat?.flatNo || "-", p.amount, p.mode, p.note || "-"];
      }),
      [],
      ["Expenses"],
      ["Date", "Category", "Amount", "Note", "Created By"],
      ...monthlyReport.expenses.map((e) => [e.date, e.category, e.amount, e.note || "-", e.createdBy || "-"]),
    ];

    downloadCSV(`SocioLedger_Report_${monthlyReport.month}.csv`, rows);
  }

  function exportStatusCSV() {
    const rows = [
      ["SocioLedger Month-wise Payment Status"],
      ["Month", formatMonth(monthlyStatus.month)],
      [],
      ["Flat", "Resident", "Phone", "Month Charge", "Paid Adjusted", "Month Due", "Gross Total Due", "Advance Adjusted", "Remaining Advance", "Net Payable", "Status"],
      ...monthlyStatus.rows.map((row) => [
        row.flat.flatNo,
        row.flat.ownerName,
        row.flat.phone,
        row.charge,
        row.paid,
        row.due,
        row.totalDue,
        row.advanceAdjusted,
        row.advance,
        row.netPayable,
        row.status,
      ]),
    ];

    downloadCSV(`SocioLedger_Payment_Status_${monthlyStatus.month}.csv`, rows);
  }

  if (!authReady) {
    return (
      <div className="loginPage">
        <div className="loginCard">
          <img src={logo} alt="SocioLedger Logo" className="loginLogoMain" />
          <h1>SocioLedger</h1>
          <p>Loading data from Firebase...</p>
        </div>
      </div>
      );
    }

  if (!user) {
    const floatingIcons = ["key", "camera", "lift", "building", "rupee", "users", "shield", "door"];

    return (
      <div className="neoLoginPage">
        <div className="neoSkyline" aria-hidden="true" />
        <div className="neoParticles" aria-hidden="true" />
        <div className="neoOrbit" aria-hidden="true">
          {floatingIcons.map((iconType, index) => (
            <div key={iconType} className={`neoFloatIcon neoFloatIcon${index + 1}`}>
              <NeoLoginIcon type={iconType} />
            </div>
          ))}
        </div>

        <main className="neoLoginShell">
          <section className="neoBrand" aria-label="SocioLedger login">
            <img src={logo} alt="SocioLedger Logo" className="enterpriseLogo" />
            <h1><strong>Socio</strong><span>Ledger</span></h1>
            <div className="neoBrandRule"><i /><b /><i /></div>
            <p>Smart Society Management</p>
          </section>

          <section className="enterpriseLoginCard neoLoginCard">
            <div className="enterpriseTitle neoCardTitle">
              <div className="neoTitleIcon"><NeoLoginIcon type="building" /></div>
              <div>
                <h2>Welcome Back</h2>
                <p>Login to continue to your account</p>
              </div>
            </div>

            <label className="enterpriseFieldLabel" htmlFor="login-mobile">Mobile Number or Email</label>
            <div className="enterpriseInputRow neoInputRow">
              <span className="enterprisePrefix neoPhoneIcon"><NeoLoginIcon type="phone" /></span>
              {!loginPhone.includes("@") && <b className="neoCountryCode">+91</b>}
              <input
                id="login-mobile"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value.slice(0, 120))}
                placeholder="Mobile number or personal email"
                inputMode="email"
                autoComplete="username"
                onKeyDown={(e) => {
                  if (e.key === "Enter") login();
                }}
              />
            </div>

            <label className="enterpriseFieldLabel" htmlFor="login-password">Password</label>
            <div className="enterpriseInputRow neoInputRow neoPasswordRow">
              <span className="enterprisePrefix"><NeoLoginIcon type="lock" /></span>
              <input
                id="login-password"
                type={showLoginPassword ? "text" : "password"}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") login();
                }}
              />
              <button
                type="button"
                className="enterpriseEyeButton neoEyeButton"
                onClick={() => setShowLoginPassword((show) => !show)}
                aria-label={showLoginPassword ? "Hide password" : "Show password"}
                title={showLoginPassword ? "Hide password" : "Show password"}
              >
                <NeoLoginIcon type={showLoginPassword ? "eyeOff" : "eye"} />
              </button>
            </div>

            <div className="enterpriseLoginMeta">
              <label className="neoRemember"><input type="checkbox" readOnly checked /><span>Remember Me</span></label>
              <button
                type="button"
                onClick={() => {
                  setResetPhone(loginPhone);
                  setResetOpen(true);
                }}
              >
                Forgot Password?
              </button>
            </div>

            <button className="enterpriseLoginButton neoLoginButton" onClick={login}>
              <span>Login</span><b>→</b>
            </button>

            <div className="neoTrustGrid">
              <div><NeoLoginIcon type="shield" /><span><b>Secure</b><small>Your data is protected</small></span></div>
              <div><NeoLoginIcon type="bolt" /><span><b>Fast</b><small>Built for reliability</small></span></div>
              <div><NeoLoginIcon type="users" /><span><b>Society-wide</b><small>One solution for all</small></span></div>
            </div>
          </section>

          <footer className="neoFooter">
            <div>Powered by <b>WinFly</b></div>
            <small>▣ Trusted society operations platform</small>
          </footer>
        </main>

        {resetOpen && (
          <div className="enterpriseModalOverlay" onClick={() => setResetOpen(false)}>
            <section className="enterpriseResetModal neoResetModal" onClick={(e) => e.stopPropagation()}>
              <button className="enterpriseModalClose" type="button" onClick={() => setResetOpen(false)} aria-label="Close">×</button>
              <span className="enterpriseModalEyebrow">Account assistance</span>
              <h2>Password Reset</h2>
              <p>Enter your verified personal email. Legacy accounts may also try their registered mobile number.</p>
              <label className="enterpriseFieldLabel" htmlFor="reset-mobile">Personal Email or Mobile</label>
              <div className="enterpriseInputRow">
                <span className="enterprisePrefix">@</span>
                <input
                  id="reset-mobile"
                  value={resetPhone}
                  onChange={(e) => setResetPhone(e.target.value.slice(0, 120))}
                  placeholder="name@example.com"
                  inputMode="email"
                  autoComplete="email"
                />
              </div>
              <button className="enterpriseLoginButton" type="button" onClick={requestPasswordReset} disabled={resetLoading}>
                {resetLoading ? "Submitting..." : "Submit Request"}
              </button>
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={darkMode ? "app dark" : "app"}>
      <header className="mobileTopbar">
        <button
          className="mobileMenuBtn"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
        >
          ☰
        </button>
        <div className="mobileTopbarBrand">
          <img src={logo} alt="SocioLedger Logo" />
          <span>SocioLedger</span>
        </div>
      </header>

      {mobileNavOpen && (
        <button
          className="mobileNavBackdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <aside className={mobileNavOpen ? "sidebar mobileOpen" : "sidebar"}>
        <button
          className="mobileCloseBtn"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        >
          ×
        </button>
        <div className="profileBox">
          <div className="sidebarBrand">
            <img src={logo} alt="SocioLedger Logo" />
            <h2>SocioLedger</h2>
          </div>
          <p>{user.name}</p>
          <span className="role">{roleLabels[user.role] || user.role}</span>
          {allowedSocieties.length > 0 && (
            <select
              className="societySelect"
              value={selectedSocietyId}
              onChange={(e) => {
                setSelectedSocietyId(e.target.value);
                setSelectedFlatId("");
                setActiveTab("dashboard");
              }}
            >
              {allowedSocieties.map((society) => (
                <option key={society.id} value={society.id}>
                  {society.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <nav className="navButtons">
          <button className={activeTab === "dashboard" ? "activeNav" : ""} onClick={() => openTab("dashboard")}>
            Dashboard
          </button>

          {canManage() && (
            <>
              <button className={activeTab === "flats" ? "activeNav" : ""} onClick={() => openTab("flats")}>
                Flats
              </button>

              <button className={activeTab === "rates" ? "activeNav" : ""} onClick={() => openTab("rates")}>
                Rates
              </button>

              <button className={activeTab === "payments" ? "activeNav" : ""} onClick={() => openTab("payments")}>
                Payments
              </button>
            </>
          )}

          <button className={activeTab === "status" ? "activeNav" : ""} onClick={() => openTab("status")}>
            Payment Status
          </button>

          <button className={activeTab === "expenses" ? "activeNav" : ""} onClick={() => openTab("expenses")}>
            Expenses
          </button>

          <button className={activeTab === "reports" ? "activeNav" : ""} onClick={() => openTab("reports")}>
            Reports
          </button>

          <button className={activeTab === "ledger" ? "activeNav" : ""} onClick={() => openTab("ledger")}>
            Ledger
          </button>

          {currentRole === roles.RESIDENT && (
            <button className={activeTab === "profile" ? "activeNav" : ""} onClick={() => openTab("profile")}>
              My Profile
            </button>
          )}

          {canManage() && (
            <button className={activeTab === "paymentSetup" ? "activeNav" : ""} onClick={() => openTab("paymentSetup")}>
              Payment Setup
            </button>
          )}
          
          {isSuperAdmin() && (
            <button
              className={activeTab === "societies" ? "activeNav" : ""}
              onClick={() => openTab("societies")}
            >
              Societies
            </button>
          )}

          {isSuperAdmin() && (
            <button
              className={activeTab === "managers" ? "activeNav" : ""}
              onClick={() => openTab("managers")}
            >
              Managers
            </button>
          )}
          
        </nav>

        <button className="modeBtn" onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? "Light Mode" : "Dark Mode"}
        </button>

        <button className="logout" onClick={logout}>
          Logout
        </button>
      </aside>

      <main className="main">

        {isSubscriptionBlocked ? (
          <SubscriptionBlocked
            subscriptionAccess={subscriptionAccess}
            onLogout={logout}
          />
        ) : (
        <>
          {activeTab === "managers" && isSuperAdmin() && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Manager Management</h1>
                <p>Super Admin yahan se manager add/update karega aur societies assign karega.</p>
              </div>
            </div>

            <div className="formGrid">
              <input
                placeholder="Manager Name"
                value={managerForm.name}
                onChange={(e) => setManagerForm({ ...managerForm, name: e.target.value })}
              />

              <input
                placeholder="Mobile Number"
                value={managerForm.phone}
                onChange={(e) => setManagerForm({ ...managerForm, phone: e.target.value })}
                inputMode="numeric"
              />

              <input
                type="password"
                placeholder="Password (example: abcd@123)"
                value={managerForm.password}
                onChange={(e) => setManagerForm({ ...managerForm, password: e.target.value })}
              />

              <button onClick={saveManager}>
                {managerForm.id ? "Update Manager" : "Add Manager"}
              </button>

              {managerForm.id && (
                <button
                  className="dangerBtn"
                  onClick={() =>
                    setManagerForm({
                      id: "",
                      name: "",
                      phone: "",
                      password: "",
                      societyIds: [],
                    })
                  }
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="managerSocietyBox">
              <h3>Assign Societies</h3>

            <div className="checkboxGrid">
              {data.societies.map((society) => (
                <label key={society.id} className="checkItem">
                  <input
                    type="checkbox"
                    checked={managerForm.societyIds.includes(society.id)}
                    onChange={() => toggleManagerSociety(society.id)}
                  />
                  <span>{society.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Manager</th>
                  <th>Phone</th>
                  <th>Assigned Societies</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {data.users
                  .filter((u) => u.role === roles.MANAGER)
                  .map((manager) => {
                    const assignedIds = Array.isArray(manager.societyIds)
                      ? manager.societyIds
                      : Object.keys(manager.societyIds || {}).filter((id) => manager.societyIds[id]);

                    const assignedNames = assignedIds
                      .map((id) => data.societies.find((s) => s.id === id)?.name)
                      .filter(Boolean)
                      .join(", ");

                    return (
                      <tr key={manager.id}>
                        <td>{manager.name || "-"}</td>
                        <td>{manager.phone || "-"}</td>
                        <td>{assignedNames || "-"}</td>
                        <td>
                          <span className={manager.active === false ? "status inactive" : "status active"}>
                            {manager.active === false ? "Inactive" : "Active"}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => editManager(manager)}>Edit</button>

                          <button
                            className={manager.active === false ? "" : "dangerBtn"}
                            onClick={() => toggleManagerStatus(manager)}
                          >
                            {manager.active === false ? "Activate" : "Deactivate"}
                          </button>
                          <button
                            className="dangerBtn"
                            onClick={() => deleteManager(manager)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "societies" && isSuperAdmin() && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Society Management</h1>
                <p>Super Admin yahan se new society/building create kar sakta hai.</p>
              </div>
            </div>

            <div className="formGrid">
              <input
                placeholder="Society / Building Name"
                value={societyForm.name}
                onChange={(e) => setSocietyForm({ ...societyForm, name: e.target.value })}
              />

            <input
                placeholder="Address"
                value={societyForm.address}
                onChange={(e) => setSocietyForm({ ...societyForm, address: e.target.value })}
              />

              <button onClick={saveSociety}>
                {societyForm.id ? "Update Society" : "Add Society"}
              </button>

              {societyForm.id && (
              <button
                className="dangerBtn"
                onClick={() => setSocietyForm({ id: "", name: "", address: "" })}
              >
                Cancel Edit
              </button>
            )}
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Society</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {data.societies.map((society) => (
                    <tr key={society.id}>
                      <td>{society.name || "-"}</td>
                      <td>{society.address || "-"}</td>
                      <td>
                        <span className={society.active === false ? "status inactive" : "status active"}>
                          {society.active === false ? "Inactive" : "Active"}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => editSociety(society)}>Edit</button>

                        <button
                          className={society.active === false ? "" : "dangerBtn"}
                          onClick={() => toggleSocietyStatus(society)}
                        >
                          {society.active === false ? "Activate" : "Deactivate"}
                        </button>
                        
                        <button onClick={() => markSocietyPaid(society)}>
                          Mark Paid 30 Days
                        </button>
                        
                        <button onClick={() => resetSocietyTrial(society)}>
                        Reset 15 Days Trial
                        </button>

                        <button
                          className="dangerBtn"
                          onClick={() => blockSocietySubscription(society)}
                        >
                          Block Subscription
                        </button>

                        <button
                          className="dangerBtn societyDeleteBtn"
                          onClick={() => deleteSociety(society)}
                          disabled={society.id === "default_society"}
                          title={society.id === "default_society" ? "Protected primary society" : "Permanently delete society"}
                        >
                          Delete Society
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {activeTab === "dashboard" && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Dashboard</h1>
                <p>Quick overview of flats, dues, collection and expenses.</p>
              </div>
            </div>

            <div className="dashboardToolbar">
              <div>
                <span>Expense month</span>
                <input
                  type="month"
                  value={dashboardMonth}
                  onChange={(e) => setDashboardMonth(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="ghostBtn"
                onClick={() => openExpenseCategory("All", dashboardMonth)}
              >
                View expense details
              </button>
            </div>

            <div className="cards">
              <div className="card"><span>Total Flats</span><b>{dashboard.flats}</b></div>
              <div className="card"><span>Active Flats</span><b>{dashboard.active}</b></div>
              <div className="card danger"><span>Total Due</span><b>{rupee(dashboard.totalDue)}</b></div>
              <div className="card success"><span>Advance</span><b>{rupee(dashboard.totalAdvance)}</b></div>
              <div className="card"><span>Total Collection</span><b>{rupee(dashboard.collection)}</b></div>
              <div className="card danger">
                <span>{formatMonth(dashboardMonth)} Expense</span>
                <b>{rupee(dashboardMonthlyExpense.total)}</b>
              </div>
              <div className={dashboard.netBalance >= 0 ? "card success" : "card danger"}>
                <span>Net Balance</span><b>{rupee(dashboard.netBalance)}</b>
              </div>
            </div>

            <section className="expenseInsightPanel">
              <div className="sectionTitleRow">
                <div>
                  <h2>{formatMonth(dashboardMonth)} Expense Categories</h2>
                  <p>Tap any category to view its expense entries.</p>
                </div>
                <b>{rupee(dashboardMonthlyExpense.total)}</b>
              </div>

              <div className="expenseCategoryGrid">
                {dashboardMonthlyExpense.categories.length > 0 ? (
                  dashboardMonthlyExpense.categories.map((item) => (
                    <button
                      key={item.category}
                      type="button"
                      className="expenseCategoryCard"
                      onClick={() =>
                        openExpenseCategory(item.category, dashboardMonth)
                      }
                    >
                      <span>{item.category}</span>
                      <b>{rupee(item.amount)}</b>
                    </button>
                  ))
                ) : (
                  <div className="emptyMini">
                    No expenses recorded for this month.
                  </div>
                )}
              </div>
            </section>

            <section
              className="dashboardPromoPanel"
              aria-label="SocioLedger and VIORA apps"
            >
              <div className="promoProduct promoSocioLedger">
                <div className="promoLogoWrap">
                  <img src={socioLedgerIcon} alt="SocioLedger" />
                </div>
                <div className="promoCopy">
                  <span className="promoEyebrow">Society Management OS</span>
                  <h2>SocioLedger</h2>
                  <p>
                    Smart society dashboard for flats, dues, collections,
                    expenses, ledger and resident transparency.
                  </p>
                  <div className="promoChips">
                    <span>Maintenance</span>
                    <span>Ledger</span>
                    <span>Reports</span>
                  </div>
                </div>
              </div>

              <div className="promoDivider" aria-hidden="true"></div>

              <div className="promoProduct promoViora">
                <div className="promoLogoWrap vioraLogoWrap">
                  <img src={vioraIcon} alt="VIORA" />
                </div>
                <div className="promoCopy">
                  <span className="promoEyebrow">Wellness Companion</span>
                  <h2>VIORA</h2>
                  <p>
                    AI wellness, yoga, meditation, hydration and healthy habit
                    companion for better everyday living.
                  </p>
                  <div className="promoChips">
                    <span>AI Coach</span>
                    <span>Yoga</span>
                    <span>Wellness</span>
                  </div>
                </div>
              </div>

              <footer className="promoFooter">
                <span>© 2026 SocioLedger</span>
                <b>Powered by WinFly</b>
              </footer>
            </section>
          </>
        )}

        {activeTab === "flats" && canManage() && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Flat Management</h1>
                <p>Add, edit, deactivate or delete flats.</p>
              </div>
            </div>

            <div className="formGrid">
              <input placeholder="Flat No" value={flatForm.flatNo} onChange={(e) => setFlatForm({ ...flatForm, flatNo: e.target.value })} />
              <input placeholder="Owner Name" value={flatForm.ownerName} onChange={(e) => setFlatForm({ ...flatForm, ownerName: e.target.value })} />
              <input placeholder="Mobile" value={flatForm.phone} onChange={(e) => setFlatForm({ ...flatForm, phone: e.target.value })} inputMode="numeric" />
              <input type="number" placeholder="Opening Due" value={flatForm.openingDue} onChange={(e) => setFlatForm({ ...flatForm, openingDue: e.target.value })} />
              <button onClick={saveFlat}>{flatForm.id ? "Update Flat" : "Add Flat"}</button>
              {flatForm.id && <button className="dangerBtn" onClick={() => setFlatForm(emptyFlatForm)}>Cancel Edit</button>}
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Flat</th><th>Owner</th><th>Phone</th><th>Opening Due</th><th>Status</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {societyData.flats.map((flat) => (
                    <tr key={flat.id}>
                      <td>{flat.flatNo || "-"}</td>
                      <td>{flat.ownerName || "-"}</td>
                      <td>{flat.phone || "-"}</td>
                      <td>{rupee(flat.openingDue)}</td>
                      <td><span className={flat.active === false ? "status inactive" : "status active"}>{flat.active === false ? "Inactive" : "Active"}</span></td>
                      <td>
                        <button onClick={() => editFlat(flat)}>Edit</button>
                        {flat.active === false ? (
                          <button onClick={() => reactivateFlat(flat.id)}>Activate</button>
                        ) : (
                          <button className="dangerBtn" onClick={() => deactivateFlat(flat.id)}>Deactivate</button>
                        )}
                        {isSuperAdmin() && <button className="dangerBtn" onClick={() => deleteFlat(flat.id)}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "rates" && canManage() && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Rate History</h1>
                <p>Monthly maintenance rate effective from selected month.</p>
              </div>
            </div>

            <div className="formGrid">
              <input type="month" value={rateForm.fromMonth} onChange={(e) => setRateForm({ ...rateForm, fromMonth: e.target.value })} />
              <input type="number" placeholder="Maintenance Amount" value={rateForm.amount} onChange={(e) => setRateForm({ ...rateForm, amount: e.target.value })} />
              <button onClick={saveRate}>Add / Update Rate</button>
            </div>

            <div className="tableWrap">
              <table>
                <thead><tr><th>From Month</th><th>Amount</th></tr></thead>
                <tbody>
                  {societyData.rateHistory.map((rate) => (
                    <tr key={rate.id}><td>{formatMonth(rate.fromMonth)}</td><td>{rupee(rate.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "payments" && canManage() && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Payment Entry</h1>
                <p>Add cash, UPI, bank transfer or cheque payments after verification.</p>
              </div>
            </div>

            <div className="formGrid">
              <select value={paymentForm.flatId} onChange={(e) => setPaymentForm({ ...paymentForm, flatId: e.target.value })}>
                <option value="">Select Flat</option>
                {activeFlats.map((flat) => (
                  <option key={flat.id} value={flat.id}>{flat.flatNo} - {flat.ownerName}</option>
                ))}
              </select>

              <input type="number" placeholder="Amount" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />

              <select value={paymentForm.mode} onChange={(e) => setPaymentForm({ ...paymentForm, mode: e.target.value })}>
                <option>Cash</option>
                <option>UPI</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
              </select>

              <input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} />
              <input type="month" value={paymentForm.forMonth} onChange={(e) => setPaymentForm({ ...paymentForm, forMonth: e.target.value })} />
              <input placeholder="Note" value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} />
              <button onClick={addPayment}>Save Payment</button>
            </div>

            <div className="tableWrap">
              <table>
                <thead><tr><th>Date</th><th>Month</th><th>Flat</th><th>Amount</th><th>Mode</th><th>Note</th><th>Action</th></tr></thead>
                <tbody>
                  {societyData.payments.map((payment) => {
                    const flat = societyData.flats.find((f) => isPaymentForFlat(payment, f));
                    return (
                      <tr key={payment.id}>
                        <td>{payment.date || payment.paymentDate || "-"}</td>
                        <td>{formatMonth(getPaymentMonth(payment))}</td>
                        <td>{flat?.flatNo || payment.flatNo || payment.flatNumber || "-"}</td>
                        <td>{rupee(getPaymentAmount(payment))}</td>
                        <td>{payment.mode || payment.paymentMode || "-"}</td>
                        <td>{payment.note || payment.remarks || "-"}</td>
                        <td><button className="dangerBtn" onClick={() => deletePayment(payment)}>Delete</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "status" && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Month-wise Payment Status</h1>
                <p>Har resident dekh sakta hai kisne selected month ka maintenance pay kiya aur kis par kitna due hai.</p>
              </div>
            </div>

            <div className="formGrid">
              <input type="month" value={statusMonth} onChange={(e) => setStatusMonth(e.target.value)} />
              {canManage() && <button onClick={exportStatusCSV}>Export Status CSV</button>}
            </div>

            <div className="cards">
              <div className="card success"><span>Paid Flats</span><b>{monthlyStatus.paidCount}</b></div>
              <div className="card warning"><span>Partial Flats</span><b>{monthlyStatus.partialCount}</b></div>
              <div className="card danger"><span>Pending Flats</span><b>{monthlyStatus.pendingCount}</b></div>
              <div className="card"><span>Month Collection Adjusted</span><b>{rupee(monthlyStatus.totalPaid)}</b></div>
              <div className="card danger"><span>Month Due</span><b>{rupee(monthlyStatus.totalMonthDue)}</b></div>
              <div className="card danger"><span>Gross Total Due</span><b>{rupee(monthlyStatus.totalAllDue)}</b></div>
              <div className="card success"><span>Advance Adjusted</span><b>{rupee(monthlyStatus.totalAdvanceAdjusted)}</b></div>
              <div className="card success"><span>Remaining Advance</span><b>{rupee(monthlyStatus.totalAdvance)}</b></div>
              <div className="card warning"><span>Net Payable</span><b>{rupee(monthlyStatus.totalNetPayable)}</b></div>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Flat</th><th>Resident</th><th>Month Charge</th><th>Paid Adjusted</th><th>Month Due</th><th>Gross Total Due</th><th>Advance Adjusted</th><th>Remaining Advance</th><th>Net Payable</th><th>Status</th><th>Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyStatus.rows.map((row) => (
                    <tr key={row.flat.id}>
                      <td>{row.flat.flatNo || "-"}</td>
                      <td>{row.flat.ownerName || "-"}</td>
                      <td>{rupee(row.charge)}</td>
                      <td>{rupee(row.paid)}</td>
                      <td>{rupee(row.due)}</td>
                      <td>{rupee(row.totalDue)}</td>
                      <td>{rupee(row.advanceAdjusted)}</td>
                      <td>{rupee(row.advance)}</td>
                      <td>{rupee(row.netPayable)}</td>
                      <td>
                        <span className={row.status === "Paid" ? "status paid" : row.status === "Partial" ? "status partial" : "status pending"}>
                          {row.status}
                        </span>
                      </td>
                      <td>
                        {canShowPayButton(row.flat) && row.netPayable > 0 ? (
                          <button className="payBtn smallBtn" onClick={() => setPayModalFlatId(row.flat.id)}>Pay</button>
                        ) : (
                          <span className="mutedText">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "expenses" && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Expenses</h1>
                <p>Month-wise expense control with category drill-down.</p>
              </div>
            </div>

            <div className="expenseControlPanel">
              <div className="monthFilterBox">
                <label>Expense Month</label>
                <input
                  type="month"
                  value={expenseMonth}
                  onChange={(e) => {
                    setExpenseMonth(e.target.value);
                    setExpenseCategoryFilter("All");
                  }}
                />
              </div>

              <button
                type="button"
                className={
                  expenseCategoryFilter === "All"
                    ? "filterPill active"
                    : "filterPill"
                }
                onClick={() => setExpenseCategoryFilter("All")}
              >
                All · {rupee(expenseMonthSummary.total)}
              </button>

              {expenseMonthSummary.categories.map((item) => (
                <button
                  key={item.category}
                  type="button"
                  className={
                    expenseCategoryFilter === item.category
                      ? "filterPill active"
                      : "filterPill"
                  }
                  onClick={() => setExpenseCategoryFilter(item.category)}
                >
                  {item.category} · {rupee(item.amount)}
                </button>
              ))}
            </div>

            {canManage() && (
              <div className="formGrid expenseFormGrid">
                <input
                  type="number"
                  placeholder="Amount"
                  value={expenseForm.amount}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, amount: e.target.value })
                  }
                />
                <select
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, category: e.target.value })
                  }
                >
                  <option>General</option>
                  <option>Electricity</option>
                  <option>Water</option>
                  <option>Lift</option>
                  <option>Cleaning</option>
                  <option>Security</option>
                  <option>Repair</option>
                  <option>Salary</option>
                  <option>Other</option>
                </select>
                <input
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, date: e.target.value })
                  }
                />
                <input
                  placeholder="Note / Vendor / Bill details"
                  value={expenseForm.note}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, note: e.target.value })
                  }
                />
                <button onClick={addExpense}>Add Expense</button>
              </div>
            )}

            <div className="tableWrap mobileCardTable expenseTableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Note</th>
                    <th>Added By</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseMonthSummary.filteredExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td data-label="Date">{expense.date}</td>
                      <td data-label="Category">{expense.category}</td>
                      <td data-label="Amount">{rupee(expense.amount)}</td>
                      <td data-label="Note">{expense.note || "-"}</td>
                      <td data-label="Added By">
                        {expense.createdBy || "-"}
                      </td>
                      <td data-label="Action">
                        {isSuperAdmin() ? (
                          <button
                            className="dangerBtn"
                            onClick={() => deleteExpense(expense.id)}
                          >
                            Delete
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}

                  {expenseMonthSummary.filteredExpenses.length === 0 && (
                    <tr>
                      <td data-label="Status" colSpan="6">
                        No expenses found for this selection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "reports" && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Monthly Reports</h1>
                <p>Month-wise collection, expense and net balance summary.</p>
              </div>
            </div>

            <div className="formGrid">
              <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
              <button onClick={exportReportCSV}>Export CSV</button>
              <a href={getWhatsAppSummaryLink()} target="_blank" rel="noreferrer" className="reportLink">WhatsApp Summary</a>
            </div>

            <div className="cards">
              <div className="card success"><span>Month Collection</span><b>{rupee(monthlyReport.collected)}</b></div>
              <div className="card danger"><span>Month Expense</span><b>{rupee(monthlyReport.expenseTotal)}</b></div>
              <div className={monthlyReport.net >= 0 ? "card success" : "card danger"}><span>Month Net Balance</span><b>{rupee(monthlyReport.net)}</b></div>
            </div>
          </>
        )}

        {activeTab === "ledger" && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Maintenance Ledger</h1>
                <p>Flat-wise dues, payments, adjustments and advance.</p>
              </div>
            </div>

            {visibleFlats.length > 0 ? (
              <>
                <select className="flatSelect" value={selectedFlat?.id || ""} onChange={(e) => setSelectedFlatId(e.target.value)}>
                  {visibleFlats.map((flat) => (
                    <option key={flat.id} value={flat.id}>{flat.flatNo || "-"} - {flat.ownerName || "-"}</option>
                  ))}
                </select>

                {selectedFlat && (
                  <LedgerView
                    flat={selectedFlat}
                    data={societyData}
                    whatsappLink={getWhatsAppLink(selectedFlat)}
                    showPayButton={canShowPayButton(selectedFlat)}
                    onPay={() => setPayModalFlatId(selectedFlat.id)}
                  />
                )}
              </>
            ) : (
              <EmptyState title="No ledger found" text="No flat is linked with this account yet." />
            )}
          </>
        )}

        {activeTab === "profile" && currentRole === roles.RESIDENT && selectedFlat && (
          <ResidentProfile user={user} authUser={authUser} flat={selectedFlat} society={data.societies.find((s) => s.id === selectedSocietyId)} data={societyData} />
        )}

        {activeTab === "paymentSetup" && canManage() && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Payment Setup</h1>
                <p>Manager ki UPI ID aur QR image yahan se update hogi. Resident ko Pay button par ye hi details dikhenge.</p>
              </div>
            </div>

            <div className="settingsGrid">
              <div className="settingsCard">
                <h3>UPI Details</h3>

                <label>Manager UPI ID</label>
                <input placeholder="example@upi" value={paymentSettingsForm.upiId} onChange={(e) => setPaymentSettingsForm({ ...paymentSettingsForm, upiId: e.target.value })} />

                <label>QR Image</label>
                <input type="file" accept="image/*" onChange={handleQrUpload} />

                <div className="settingsActions">
                  <button onClick={savePaymentSettings}>Save Payment Settings</button>
                  {paymentSettingsForm.qrImage && (
                    <button className="dangerBtn" onClick={() => setPaymentSettingsForm({ ...paymentSettingsForm, qrImage: "" })}>
                      Remove QR
                    </button>
                  )}
                </div>

                <p className="hintText">QR image 900KB se kam rakho. Payment verification abhi manager ke through manual rahega.</p>
              </div>

              <div className="settingsCard">
                <h3>Resident Preview</h3>

                {paymentSettingsForm.qrImage ? (
                  <img className="qrPreview" src={paymentSettingsForm.qrImage} alt="UPI QR Preview" />
                ) : (
                  <div className="qrPlaceholder">QR image not uploaded</div>
                )}

                <div className="upiPreview">
                  <span>UPI ID</span>
                  <b>{paymentSettingsForm.upiId || "Not added"}</b>
                </div>
              </div>
            </div>
          </>
        )}

        {payModalFlat && (
          <PaymentModal
            flat={payModalFlat}
            data={societyData}
            paymentSettings={data.paymentSettings}
            onClose={() => setPayModalFlatId("")}
            onCopyUpi={copyUpiId}
          />
        )}
      </>
      )}
      </main>
    </div>
  );
}


function ResidentProfile({ user, authUser, flat, society, data }) {
  const ledger = buildLedger(flat, data);
  const currentMonthInfo = getMonthPaymentInfo(flat, data, getCurrentMonth());
  const linkedMobile = normalizePhone(flat.phone || user?.phone);
  const [newEmail, setNewEmail] = useState(user?.personalEmail || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  async function requestEmailUpdate() {
    const email = String(newEmail || "").trim().toLowerCase();
    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      alert("Please log in again before updating the email.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      alert("Please enter a valid personal email address.");
      return;
    }

    if (!currentPassword) {
      alert("Enter your current password to confirm this sensitive change.");
      return;
    }

    if (String(firebaseUser.email || "").toLowerCase() === email) {
      alert("This email is already linked to your Firebase Authentication account.");
      return;
    }

    setEmailSaving(true);

    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email,
        currentPassword
      );

      await reauthenticateWithCredential(firebaseUser, credential);

      await verifyBeforeUpdateEmail(firebaseUser, email, {
        url: window.location.origin,
        handleCodeInApp: false,
      });

      await update(ref(db, `users/${firebaseUser.uid}`), {
        personalEmail: email,
        pendingEmail: email,
        emailUpdateStatus: "verification_sent",
        emailUpdateRequestedAt: Date.now(),
        updatedAt: Date.now(),
      });

      setCurrentPassword("");
      alert(
        "Verification email sent. Open the link in your inbox. After verification, use your personal email to log in and reset the password."
      );
    } catch (error) {
      console.error("Email update failed", error);

      if (error?.code === "auth/email-already-in-use") {
        alert("This email is already used by another account.");
      } else if (
        error?.code === "auth/wrong-password" ||
        error?.code === "auth/invalid-credential"
      ) {
        alert("Current password is incorrect.");
      } else if (error?.code === "auth/requires-recent-login") {
        alert("Please log out, log in again, and retry the email update.");
      } else {
        alert(error?.message || "Unable to send email verification.");
      }
    } finally {
      setEmailSaving(false);
    }
  }

  return (
    <>
      <div className="pageHeader profileHeader">
        <div>
          <h1>My Profile</h1>
          <p>Flat owner profile, login details and current ledger summary.</p>
        </div>
      </div>

      <div className="profileGrid">
        <section className="profileCard ownerProfileCard">
          <div className="profileAvatar">{String(flat.ownerName || user?.name || "R").slice(0, 1).toUpperCase()}</div>
          <div>
            <h2>{flat.ownerName || user?.name || "Resident"}</h2>
            <p>Flat {flat.flatNo || "-"} · {society?.name || "Society"}</p>
            <span className="status active">Resident</span>
          </div>
        </section>

        <section className="profileCard">
          <h3>Contact & Login</h3>
          <div className="profileRows">
            <div><span>Registered Mobile</span><b>{linkedMobile || "-"}</b></div>
            <div><span>Authentication Email</span><b>{authUser?.email || "-"}</b></div>
            <div><span>Owner Name</span><b>{flat.ownerName || user?.name || "-"}</b></div>
            <div><span>Flat No</span><b>{flat.flatNo || "-"}</b></div>
            <div><span>Society</span><b>{society?.name || "-"}</b></div>
          </div>
        </section>

        <section className="profileCard emailUpdateCard">
          <div className="profileSectionHeading">
            <div>
              <h3>Personal Email & Password Reset</h3>
              <p>Link a verified personal email directly with Firebase Authentication.</p>
            </div>
            <span className="emailSecurityBadge">Verified flow</span>
          </div>

          <label>New personal email</label>
          <input
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
          />

          <label>Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Confirm current password"
            autoComplete="current-password"
          />

          <button
            type="button"
            onClick={requestEmailUpdate}
            disabled={emailSaving}
          >
            {emailSaving ? "Sending verification..." : "Verify & Update Email"}
          </button>

          {user?.pendingEmail && (
            <p className="emailPendingNote">
              Verification pending: <b>{user.pendingEmail}</b>
            </p>
          )}

          <p className="hintText emailImportantNote">
            Important: after verifying the new email, Firebase will use that email as your login identifier. Use the personal email—not the mobile number—for future login and password reset.
          </p>
        </section>

        <section className="profileCard">
          <h3>Ledger Summary</h3>
          <div className="cards compactCards">
            <div className="card danger"><span>Gross Due</span><b>{rupee(ledger.totalDue)}</b></div>
            <div className="card success"><span>Advance</span><b>{rupee(ledger.advance)}</b></div>
            <div className="card warning"><span>Net Payable</span><b>{rupee(ledger.netPayable)}</b></div>
            <div className="card"><span>Total Paid</span><b>{rupee(ledger.totalPaid)}</b></div>
          </div>
        </section>

        <section className="profileCard">
          <h3>This Month</h3>
          <div className="profileRows">
            <div><span>Month</span><b>{formatMonth(getCurrentMonth())}</b></div>
            <div><span>Charge</span><b>{rupee(currentMonthInfo.charge)}</b></div>
            <div><span>Paid/Adjusted</span><b>{rupee(currentMonthInfo.paid)}</b></div>
            <div><span>Status</span><b>{currentMonthInfo.status}</b></div>
          </div>
        </section>
      </div>
    </>
  );
}

function LedgerView({ flat, data, whatsappLink, showPayButton, onPay }) {
  const ledger = buildLedger(flat, data);

  return (
    <div className="ledgerBox">
      <div className="ledgerHeader">
        <div>
          <h2>Flat {flat.flatNo}</h2>
          <p>{flat.ownerName} · {flat.phone}</p>
        </div>

        <div className="ledgerActions">
          {showPayButton && <button className="payBtn" onClick={onPay}>Pay Now</button>}
          <a href={whatsappLink} target="_blank" rel="noreferrer">WhatsApp Receipt</a>
        </div>
      </div>

      <div className="cards">
        <div className="card danger"><span>Gross Total Due</span><b>{rupee(ledger.totalDue)}</b></div>
        <div className="card success"><span>Advance</span><b>{rupee(ledger.advance)}</b></div>
        <div className="card warning"><span>Net Payable</span><b>{rupee(ledger.netPayable)}</b></div>
        <div className="card"><span>Total Paid</span><b>{rupee(ledger.totalPaid)}</b></div>
      </div>

      <div className="tableWrap">
        <table>
          <thead><tr><th>Month</th><th>Charge</th><th>Paid Adjusted</th><th>Balance Due</th></tr></thead>
          <tbody>
            {ledger.entries.map((entry) => (
              <tr key={entry.month}>
                <td>{formatMonth(entry.month)}</td>
                <td>{rupee(entry.charge)}</td>
                <td>{rupee(entry.paid)}</td>
                <td>{rupee(entry.due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentModal({ flat, data, paymentSettings, onClose, onCopyUpi }) {
  const ledger = buildLedger(flat, data);
  const upiId = paymentSettings?.upiId || "";
  const qrImage = paymentSettings?.qrImage || "";
  const amountText = ledger.netPayable > 0 ? rupee(ledger.netPayable) : "No due";

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="paymentModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <h2>Pay Maintenance</h2>
            <p>Flat {flat.flatNo} · {flat.ownerName}</p>
          </div>

          <button className="iconBtn" onClick={onClose}>×</button>
        </div>

        <div className="cards modalCards">
          <div className="card danger"><span>Net Payable</span><b>{amountText}</b></div>
          <div className="card"><span>Gross Total Due</span><b>{rupee(ledger.totalDue)}</b></div>
          <div className="card success"><span>Advance</span><b>{rupee(ledger.advance)}</b></div>
        </div>

        {qrImage ? (
          <img className="qrImage" src={qrImage} alt="Manager UPI QR" />
        ) : (
          <div className="qrPlaceholder large">Manager ne QR image upload nahi ki hai.</div>
        )}

        <div className="upiBox">
          <span>Manager UPI ID</span>
          <b>{upiId || "UPI ID not added"}</b>
          <button onClick={onCopyUpi}>Copy UPI ID</button>
        </div>

        <p className="paymentNote">
          Payment karne ke baad screenshot manager ko WhatsApp kar dein. Manager payment verify karke entry save karega.
        </p>
      </div>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="emptyState">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function SubscriptionBlocked({ subscriptionAccess, onLogout }) {
  return (
    <div className="emptyState">
      <h3>Trial Expired / Subscription Required</h3>

      <p>
        Is society ka 15 days trial complete ho gaya hai. App continue use karne
        ke liye subscription payment required hai.
      </p>

      <div className="cards">
        <div className="card danger">
          <span>Status</span>
          <b>{subscriptionAccess.label}</b>
        </div>

        <div className="card">
          <span>Trial End Date</span>
          <b>{subscriptionAccess.trialEndsAt || "-"}</b>
        </div>
      </div>

      <p className="hintText">
        Please Super Admin / SocioLedger team se contact karke payment update karwayein.
      </p>

      <button className="dangerBtn" onClick={onLogout}>
        Logout
      </button>
    </div>
  );
}