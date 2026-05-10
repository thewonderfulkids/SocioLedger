import React, { useEffect, useMemo, useState } from "react";
import { ref, onValue, set, push, update, remove } from "firebase/database";
import { db } from "./firebase";
import "./App.css";
import logo from "./assets/socioledger-logo.png";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const roles = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Building Manager",
  RESIDENT: "Resident",
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

function getUserSocietyIds(user) {
  if (!user?.societyIds) return [];

  if (Array.isArray(user.societyIds)) {
    return user.societyIds;
  }

  return Object.keys(user.societyIds).filter((id) => user.societyIds[id]);
}

function getRateForMonth(rateHistory, monthKey) {
  const validRates = [...rateHistory]
    .filter((rate) => rate.fromMonth <= monthKey)
    .sort((a, b) => b.fromMonth.localeCompare(a.fromMonth));

  return Number(validRates[0]?.amount || 0);
}

function buildLedger(flat, data) {
  const currentMonth = getCurrentMonth();

  const firstRateMonth =
    [...data.rateHistory].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth))[0]?.fromMonth || currentMonth;

  const months = monthRange(firstRateMonth, currentMonth);

  const entries = months.map((month) => {
    const charge = getRateForMonth(data.rateHistory, month);

    return {
      month,
      charge,
      paid: 0,
      due: charge,
    };
  });

  if (Number(flat.openingDue || 0) > 0) {
    entries.unshift({
      month: "OPENING",
      charge: Number(flat.openingDue || 0),
      paid: 0,
      due: Number(flat.openingDue || 0),
    });
  }

  const flatPayments = data.payments
  .filter((p) => {
    if (p.flatId !== flat.id) return false;

    const isOpeningPayment =
      p.forMonth === "OPENING" ||
      p.month === "OPENING" ||
      p.paymentMonth === "OPENING";

    if (isOpeningPayment && Number(flat.openingDue || 0) <= 0) return false;

    return true;
  })
  .sort((a, b) => new Date(a.date) - new Date(b.date));

  let advance = 0;

  for (const payment of flatPayments) {
    let amount = Number(payment.amount || 0);

    for (const entry of entries) {
      if (amount <= 0) break;

      if (entry.due > 0) {
        const adjusted = Math.min(entry.due, amount);
        entry.paid += adjusted;
        entry.due -= adjusted;
        amount -= adjusted;
      }
    }

    if (amount > 0) advance += amount;
  }

  return {
    entries,
    totalDue: entries.reduce((sum, e) => sum + e.due, 0),
    advance,
    totalCharge: entries.reduce((sum, e) => sum + e.charge, 0),
    totalAdjusted: entries.reduce((sum, e) => sum + e.paid, 0),
    totalPaid: flatPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
  };
}

function getMonthPaymentInfo(flat, data, monthKey) {
  const ledger = buildLedger(flat, data);
  const entry = ledger.entries.find((e) => e.month === monthKey);

  const charge = Number(entry?.charge ?? getRateForMonth(data.rateHistory, monthKey) ?? 0);

  const monthPaid = data.payments
    .filter((p) => {
      if (p.flatId !== flat.id) return false;

      const forMonth = p.forMonth || p.month || p.paymentMonth || "";
      if (forMonth) return forMonth === monthKey;

      return String(p.date || "").slice(0, 7) === monthKey;
    })
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const availableAdvance = Number(ledger.advance || 0);
  const paidWithAdvance = Math.min(charge, monthPaid + availableAdvance);

  const paid = paidWithAdvance;
  const due = Math.max(charge - paidWithAdvance, 0);
  const netTotalDue = Math.max(Number(ledger.totalDue || 0) - availableAdvance, 0);

  let status = "Pending";

  if (charge <= 0) status = "No Charge";
  else if (due <= 0) status = "Paid";
  else if (paid > 0) status = "Partial";

  return {
    charge,
    paid,
    due,
    status,
    totalDue: netTotalDue,
    advance: availableAdvance,
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

export default function App() {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);

  const [user, setUser] = useState(null);
  const [loginPhone, setLoginPhone] = useState("");

  const [activeTab, setActiveTab] = useState("dashboard");
  const [darkMode, setDarkMode] = useState(false);

  const [selectedFlatId, setSelectedFlatId] = useState("");
  const [selectedSocietyId, setSelectedSocietyId] = useState("default_society");
  const [reportMonth, setReportMonth] = useState(getCurrentMonth());
  const [statusMonth, setStatusMonth] = useState(getCurrentMonth());

  const [payModalFlatId, setPayModalFlatId] = useState("");

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
  const unsubUsers = onValue(ref(db, "users"), (snapshot) => {
    const users = normalizeList(snapshot.val() || []);

    setData((prev) => ({
      ...prev,
      users,
    }));

    setLoading(false);
  });

  const unsubSocieties = onValue(ref(db, "societies"), (snapshot) => {
    const societies = normalizeSocieties(snapshot.val() || {}).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );

    setData((prev) => ({
      ...prev,
      societies,
    }));

    if (!selectedSocietyId && societies[0]?.id) {
      setSelectedSocietyId(societies[0].id);
    }
  });

  return () => {
    unsubUsers();
    unsubSocieties();
  };
}, []);

useEffect(() => {
  if (!user || !selectedSocietyId) return;

  const basePath = societyPath(selectedSocietyId);

  const unsubFlats = onValue(ref(db, `${basePath}/flats`), (snapshot) => {
    const flats = normalizeList(snapshot.val() || []).sort((a, b) =>
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
    const payments = normalizeList(snapshot.val() || []).sort(
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

  const unsubPaymentSettings = onValue(ref(db, `${basePath}/paymentSettings`), (snapshot) => {
    setData((prev) => ({
      ...prev,
      paymentSettings: snapshot.val() || seedPaymentSettings,
    }));
  });

  const unsubSubscription = onValue(ref(db, `${basePath}/subscription`), (snapshot) => {
    setData((prev) => ({
      ...prev,
      subscription: snapshot.val() || null,
    }));
  });

  return () => {
    unsubFlats();
    unsubRates();
    unsubPayments();
    unsubExpenses();
    unsubPaymentSettings();
    unsubSubscription();
  };
}, [user, selectedSocietyId]);

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
    return user?.role === roles.SUPER_ADMIN || user?.role === roles.MANAGER;
  }

  function isSuperAdmin() {
    return user?.role === roles.SUPER_ADMIN;
  }

  function canShowPayButton(flat) {
    if (user?.role !== roles.RESIDENT) return false;
    return normalizePhone(flat.phone) === normalizePhone(user.phone);
  }

  const userSocietyIds = getUserSocietyIds(user);

  const allowedSocieties =
    user?.role === roles.SUPER_ADMIN
      ? data.societies
      : user?.role === roles.MANAGER
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
    user?.role === roles.RESIDENT
      ? societyData.flats.filter((flat) => normalizePhone(flat.phone) === normalizePhone(user.phone))
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

    const collection = societyData.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
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

  const monthlyReport = useMemo(() => {
    const monthPayments = societyData.payments.filter((p) => String(p.date || "").startsWith(reportMonth));
    const monthExpenses = societyData.expenses.filter((e) => String(e.date || "").startsWith(reportMonth));

    const collected = monthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const expenses = monthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const categoryTotals = monthExpenses.reduce((acc, expense) => {
      const key = expense.category || "General";
      acc[key] = (acc[key] || 0) + Number(expense.amount || 0);
      return acc;
    }, {});

    const modeTotals = monthPayments.reduce((acc, payment) => {
      const key = payment.mode || "Other";
      acc[key] = (acc[key] || 0) + Number(payment.amount || 0);
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
    };
  }, [activeFlats, societyData, statusMonth]);

  function login() {
    const rawPhone = String(loginPhone || "").replace(/\D/g, "");

    if (rawPhone.length !== 10) {
      alert("Exactly 10 digit mobile number enter karo.");
      return;
    }

    const phone = rawPhone;
    
    let foundUser = data.users.find((u) => normalizePhone(u.phone) === phone);

    if (!foundUser) {
      alert("User not found. Resident ka phone flat me add hona chahiye.");
      return;
    }
    
    if (foundUser.active === false) {
      alert("This user is inactive. Please contact Super Admin.");
      return;
    }

    const loginSocietyIds = getUserSocietyIds(foundUser);

    if (foundUser.role === roles.SUPER_ADMIN) {
      setSelectedSocietyId((prev) => prev || data.societies[0]?.id || "default_society");
    } else if (loginSocietyIds[0]) {
      setSelectedSocietyId(loginSocietyIds[0]);
    }

    setUser(foundUser);
    setActiveTab("dashboard");
  }

  function logout() {
    setUser(null);
    setLoginPhone("");
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

    const phone = normalizePhone(managerForm.phone);

    if (!managerForm.name.trim() || phone.length !== 10 || !managerForm.password.trim()) {
    
    const password = managerForm.password.trim();
    
    const strongPassword =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%^&*!]).{8,}$/.test(password);

    if (!strongPassword) {
      alert(
        "Password strong hona chahiye.\nExample: Abcd@123\n\nMinimum 8 characters with:\n- 1 uppercase\n- 1 lowercase\n- 1 number\n- 1 special character"
      );
      return;
    }

      alert("Manager name, valid phone and password required hai.");
      return;
    }

    if (managerForm.societyIds.length === 0) {
      alert("Manager ko kam se kam 1 society assign karo.");
      return;
    }

    const duplicate = data.users.find(
      (u) => normalizePhone(u.phone) === phone && u.id !== managerForm.id
    );

    if (duplicate) {
      alert("Ye mobile number already kisi user/manager ke paas hai.");
      return;
    }

    const id = managerForm.id || createFirebaseId("users");

    const payload = {
      id,
      name: managerForm.name.trim(),
      phone,
      password: managerForm.password.trim(),
      role: roles.MANAGER,
      active: true,
      societyIds: managerForm.societyIds,
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

await set(ref(db, `societies/${id}/subscription`), {
  planId: "starter",
  status: "trial",
  billingCycle: "monthly",
  maxFlats: 25,
  billingAmount: 499,
  startDate: new Date().toISOString().slice(0, 10),
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
    };

    let savedFlatId = flatForm.id;
    
    if (flatForm.id) {
      await update(ref(db, societyPath(selectedSocietyId, `flats/${flatForm.id}`)), payload);
    } else {
      const id = createFirebaseId(societyPath(selectedSocietyId, "flats"));
      await set(ref(db, societyPath(selectedSocietyId, `flats/${id}`)), {
        id,
        ...payload,
        active: true,
        advance: 0,
        createdAt: Date.now(),
      });
      
      const residentUserId = `resident_${phone}`;
      
      await update(ref(db, `users/${residentUserId}`), {
        id: residentUserId,
        name: flatForm.ownerName.trim(),
        phone,
        role: roles.RESIDENT,
        active: true,
        flatId: savedFlatId,
        societyIds: {
          [selectedSocietyId]: true,
          },
        updatedAt: Date.now(),
      });
    }

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

    await set(ref(db, societyPath(selectedSocietyId, `payments/${id}`)), {
      id,
      flatId: paymentForm.flatId,
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
      ["Flat", "Resident", "Phone", "Month Charge", "Paid Adjusted", "Month Due", "Total Due", "Advance", "Status"],
      ...monthlyStatus.rows.map((row) => [
        row.flat.flatNo,
        row.flat.ownerName,
        row.flat.phone,
        row.charge,
        row.paid,
        row.due,
        row.totalDue,
        row.advance,
        row.status,
      ]),
    ];

    downloadCSV(`SocioLedger_Payment_Status_${monthlyStatus.month}.csv`, rows);
  }

  if (loading) {
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
    return (
      <div className="loginPage">
        <div className="loginCard">
          <img src={logo} alt="SocioLedger Logo" className="loginLogoMain" />

          <h1>SocioLedger</h1>
          <p>Society maintenance ledger made simple.</p>

          <input
            value={loginPhone}
            onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="Enter mobile number"
            inputMode="numeric"
            maxLength={10}
            onKeyDown={(e) => {
              if (e.key === "Enter") login();
            }}
          />

          <button onClick={login}>Login</button>

          <p className="loginHint">Use registered admin, manager, or resident mobile number.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={darkMode ? "app dark" : "app"}>
      <aside className="sidebar">
        <div className="profileBox">
          <div className="sidebarBrand">
            <img src={logo} alt="SocioLedger Logo" />
            <h2>SocioLedger</h2>
          </div>
          <p>{user.name}</p>
          <span className="role">{user.role}</span>
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
          <button className={activeTab === "dashboard" ? "activeNav" : ""} onClick={() => setActiveTab("dashboard")}>
            Dashboard
          </button>

          {canManage() && (
            <>
              <button className={activeTab === "flats" ? "activeNav" : ""} onClick={() => setActiveTab("flats")}>
                Flats
              </button>

              <button className={activeTab === "rates" ? "activeNav" : ""} onClick={() => setActiveTab("rates")}>
                Rates
              </button>

              <button className={activeTab === "payments" ? "activeNav" : ""} onClick={() => setActiveTab("payments")}>
                Payments
              </button>
            </>
          )}

          <button className={activeTab === "status" ? "activeNav" : ""} onClick={() => setActiveTab("status")}>
            Payment Status
          </button>

          <button className={activeTab === "expenses" ? "activeNav" : ""} onClick={() => setActiveTab("expenses")}>
            Expenses
          </button>

          <button className={activeTab === "reports" ? "activeNav" : ""} onClick={() => setActiveTab("reports")}>
            Reports
          </button>

          <button className={activeTab === "ledger" ? "activeNav" : ""} onClick={() => setActiveTab("ledger")}>
            Ledger
          </button>

          {canManage() && (
            <button className={activeTab === "paymentSetup" ? "activeNav" : ""} onClick={() => setActiveTab("paymentSetup")}>
              Payment Setup
            </button>
          )}
          
          {isSuperAdmin() && (
            <button
              className={activeTab === "societies" ? "activeNav" : ""}
              onClick={() => setActiveTab("societies")}
            >
              Societies
            </button>
          )}

          {isSuperAdmin() && (
            <button
              className={activeTab === "managers" ? "activeNav" : ""}
              onClick={() => setActiveTab("managers")}
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

              <button onClick={saveSociety}>Add Society
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

            <div className="cards">
              <div className="card"><span>Total Flats</span><b>{dashboard.flats}</b></div>
              <div className="card"><span>Active Flats</span><b>{dashboard.active}</b></div>
              <div className="card danger"><span>Total Due</span><b>{rupee(dashboard.totalDue)}</b></div>
              <div className="card success"><span>Advance</span><b>{rupee(dashboard.totalAdvance)}</b></div>
              <div className="card"><span>Total Collection</span><b>{rupee(dashboard.collection)}</b></div>
              <div className="card danger"><span>Total Expense</span><b>{rupee(dashboard.totalExpense)}</b></div>
              <div className={dashboard.netBalance >= 0 ? "card success" : "card danger"}>
                <span>Net Balance</span><b>{rupee(dashboard.netBalance)}</b>
              </div>
            </div>
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
                <thead><tr><th>Date</th><th>Flat</th><th>Amount</th><th>Mode</th><th>Note</th></tr></thead>
                <tbody>
                  {societyData.payments.map((payment) => {
                    const flat = societyData.flats.find((f) => f.id === payment.flatId);
                    return (
                      <tr key={payment.id}>
                        <td>{payment.date}</td><td>{flat?.flatNo || "-"}</td><td>{rupee(payment.amount)}</td><td>{payment.mode}</td><td>{payment.note || "-"}</td>
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
              <div className="card danger"><span>Total Due</span><b>{rupee(monthlyStatus.totalAllDue)}</b></div>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Flat</th><th>Resident</th><th>Month Charge</th><th>Paid Adjusted</th><th>Month Due</th><th>Total Due</th><th>Advance</th><th>Status</th><th>Pay</th>
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
                      <td>{rupee(row.advance)}</td>
                      <td>
                        <span className={row.status === "Paid" ? "status paid" : row.status === "Partial" ? "status partial" : "status pending"}>
                          {row.status}
                        </span>
                      </td>
                      <td>
                        {canShowPayButton(row.flat) && row.totalDue > 0 ? (
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
                <p>Visible to all. Add permission only for admin and manager.</p>
              </div>
            </div>

            {canManage() && (
              <div className="formGrid">
                <input type="number" placeholder="Amount" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                  <option>General</option><option>Electricity</option><option>Water</option><option>Lift</option><option>Cleaning</option><option>Security</option><option>Repair</option><option>Salary</option><option>Other</option>
                </select>
                <input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                <input placeholder="Note / Vendor / Bill details" value={expenseForm.note} onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })} />
                <button onClick={addExpense}>Add Expense</button>
              </div>
            )}

            <div className="tableWrap">
              <table>
                <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Note</th><th>Added By</th><th>Action</th></tr></thead>
                <tbody>
                  {societyData.expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>{expense.date}</td><td>{expense.category}</td><td>{rupee(expense.amount)}</td><td>{expense.note || "-"}</td><td>{expense.createdBy || "-"}</td>
                      <td>{isSuperAdmin() ? <button className="dangerBtn" onClick={() => deleteExpense(expense.id)}>Delete</button> : "-"}</td>
                    </tr>
                  ))}
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
      </main>
    </div>
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
        <div className="card danger"><span>Total Due</span><b>{rupee(ledger.totalDue)}</b></div>
        <div className="card success"><span>Advance</span><b>{rupee(ledger.advance)}</b></div>
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
  const amountText = ledger.totalDue > 0 ? rupee(ledger.totalDue) : "No due";

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
          <div className="card danger"><span>Total Due</span><b>{amountText}</b></div>
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