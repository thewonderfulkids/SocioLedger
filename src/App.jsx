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
  flats: [],
  rateHistory: [],
  payments: [],
  expenses: [],
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
    .filter((p) => p.flatId === flat.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let advance = Number(flat.advance || 0);

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

function downloadCSV(filename, rows) {
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")
    )
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
  const [reportMonth, setReportMonth] = useState(getCurrentMonth());

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
    note: "",
  });

  const [expenseForm, setExpenseForm] = useState({
    amount: "",
    category: "General",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });

  useEffect(() => {
    const unsubscribe = onValue(ref(db), async (snapshot) => {
      const value = snapshot.val() || {};

      if (!value.users) {
        await set(ref(db, "users"), seedUsers);
      }

      if (!value.rateHistory) {
        await set(ref(db, "rateHistory"), seedRateHistory);
      }

      const users = normalizeList(value.users || seedUsers);
      const flats = normalizeList(value.flats || [])
        .filter((flat) => flat && flat.id)
        .sort((a, b) =>
          String(a.flatNo || "").localeCompare(String(b.flatNo || ""), undefined, {
            numeric: true,
          })
        );

      const rateHistory = normalizeList(value.rateHistory || seedRateHistory).sort((a, b) =>
        String(a.fromMonth || "").localeCompare(String(b.fromMonth || ""))
      );

      const payments = normalizeList(value.payments || []).sort(
        (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
      );

      const expenses = normalizeList(value.expenses || []).sort(
        (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
      );

      setData({
        users,
        flats,
        rateHistory,
        payments,
        expenses,
      });

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  function createFirebaseId(path) {
    return push(ref(db, path)).key;
  }

  function canManage() {
    return user?.role === roles.SUPER_ADMIN || user?.role === roles.MANAGER;
  }

  function isSuperAdmin() {
    return user?.role === roles.SUPER_ADMIN;
  }

  const activeFlats = data.flats.filter((flat) => flat.active !== false);

  const visibleFlats =
    user?.role === roles.RESIDENT
      ? data.flats.filter((flat) => normalizePhone(flat.phone) === normalizePhone(user.phone))
      : data.flats;

  const selectedFlat = useMemo(() => {
    return visibleFlats.find((flat) => flat.id === selectedFlatId) || visibleFlats[0] || null;
  }, [selectedFlatId, visibleFlats]);

  const dashboard = useMemo(() => {
    let totalDue = 0;
    let totalAdvance = 0;
    let totalCharge = 0;

    data.flats.forEach((flat) => {
      const ledger = buildLedger(flat, data);

      totalDue += ledger.totalDue;
      totalAdvance += ledger.advance;
      totalCharge += ledger.totalCharge;
    });

    const collection = data.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const totalExpense = data.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    return {
      flats: data.flats.length,
      active: activeFlats.length,
      inactive: data.flats.length - activeFlats.length,
      totalDue,
      totalAdvance,
      totalCharge,
      collection,
      totalExpense,
      netBalance: collection - totalExpense,
    };
  }, [data, activeFlats.length]);

  const monthlyReport = useMemo(() => {
    const monthPayments = data.payments.filter((p) => String(p.date || "").startsWith(reportMonth));
    const monthExpenses = data.expenses.filter((e) => String(e.date || "").startsWith(reportMonth));

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
  }, [data.payments, data.expenses, reportMonth]);

  function login() {
    const phone = normalizePhone(loginPhone);

    if (!phone || phone.length !== 10) {
      alert("Valid 10 digit mobile number enter karo.");
      return;
    }

    let foundUser = data.users.find((u) => normalizePhone(u.phone) === phone);

    if (!foundUser) {
      const residentFlat = data.flats.find((flat) => normalizePhone(flat.phone) === phone);

      if (residentFlat) {
        foundUser = {
          id: `resident_${phone}`,
          phone,
          role: roles.RESIDENT,
          name: residentFlat.ownerName || `Flat ${residentFlat.flatNo}`,
        };
      }
    }

    if (!foundUser) {
      alert("User not found. Resident ka phone flat me add hona chahiye.");
      return;
    }

    setUser(foundUser);
    setActiveTab("dashboard");
  }

  function logout() {
    setUser(null);
    setLoginPhone("");
    setActiveTab("dashboard");
    setSelectedFlatId("");
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

    if (data.flats.length >= 50 && !flatForm.id) {
      alert("Maximum 50 flats allowed.");
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
      flatNo: flatForm.flatNo.trim(),
      ownerName: flatForm.ownerName.trim(),
      phone,
      openingDue: Number(flatForm.openingDue || 0),
    };

    if (flatForm.id) {
      await update(ref(db, `flats/${flatForm.id}`), payload);
    } else {
      const id = createFirebaseId("flats");

      await set(ref(db, `flats/${id}`), {
        id,
        ...payload,
        active: true,
        advance: 0,
        createdAt: Date.now(),
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
    if (!canManage()) {
      alert("You do not have permission.");
      return;
    }

    const ok = window.confirm("Is flat ko deactivate karna hai?");
    if (!ok) return;

    await update(ref(db, `flats/${id}`), {
      active: false,
      updatedAt: Date.now(),
    });
  }

  async function reactivateFlat(id) {
    if (!canManage()) {
      alert("You do not have permission.");
      return;
    }

    await update(ref(db, `flats/${id}`), {
      active: true,
      updatedAt: Date.now(),
    });
  }

  async function deleteFlat(id) {
    if (!isSuperAdmin()) {
      alert("Only Super Admin can delete flat.");
      return;
    }

    const ok = window.confirm("Flat permanently delete karna hai?");
    if (!ok) return;

    await remove(ref(db, `flats/${id}`));

    if (selectedFlatId === id) setSelectedFlatId("");
  }

  async function saveRate() {
    if (!canManage()) {
      alert("You do not have permission.");
      return;
    }

    if (!rateForm.fromMonth || !rateForm.amount) {
      alert("Month aur amount required hai.");
      return;
    }

    const existingRate = data.rateHistory.find((rate) => rate.fromMonth === rateForm.fromMonth);
    const id = existingRate?.id || createFirebaseId("rateHistory");

    await set(ref(db, `rateHistory/${id}`), {
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
    if (!canManage()) {
      alert("You do not have permission.");
      return;
    }

    if (!paymentForm.flatId || !paymentForm.amount) {
      alert("Flat aur amount required hai.");
      return;
    }

    const id = createFirebaseId("payments");

    await set(ref(db, `payments/${id}`), {
      id,
      flatId: paymentForm.flatId,
      amount: Number(paymentForm.amount),
      mode: paymentForm.mode,
      date: paymentForm.date,
      note: paymentForm.note.trim(),
      createdBy: user?.name || "",
      createdAt: Date.now(),
    });

    setPaymentForm({
      flatId: "",
      amount: "",
      mode: "Cash",
      date: new Date().toISOString().slice(0, 10),
      note: "",
    });
  }

  async function addExpense() {
    if (!canManage()) {
      alert("Only Super Admin / Manager can add expense.");
      return;
    }

    if (!expenseForm.amount) {
      alert("Expense amount required hai.");
      return;
    }

    const id = createFirebaseId("expenses");

    await set(ref(db, `expenses/${id}`), {
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
    if (!isSuperAdmin()) {
      alert("Only Super Admin can delete expense.");
      return;
    }

    const ok = window.confirm("Expense permanently delete karna hai?");
    if (!ok) return;

    await remove(ref(db, `expenses/${id}`));
  }

  function getWhatsAppLink(flat) {
    const ledger = buildLedger(flat, data);

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
        const flat = data.flats.find((f) => f.id === p.flatId);
        return [p.date, flat?.flatNo || "-", p.amount, p.mode, p.note || "-"];
      }),
      [],
      ["Expenses"],
      ["Date", "Category", "Amount", "Note", "Created By"],
      ...monthlyReport.expenses.map((e) => [e.date, e.category, e.amount, e.note || "-", e.createdBy || "-"]),
    ];

    downloadCSV(`SocioLedger_Report_${monthlyReport.month}.csv`, rows);
  }

  if (loading) {
    return (
      <div className="loginPage">
        <div className="loginCard">
          <img src={logo} alt="SocioLedger Logo" className="loginLogo" />
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
          <div className="brandIcon">SL</div>

          <h1>SocioLedger</h1>
          <p>Society maintenance ledger made simple.</p>

          <input
            value={loginPhone}
            onChange={(e) => setLoginPhone(e.target.value)}
            placeholder="Enter mobile number"
            inputMode="numeric"
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

          <button className={activeTab === "expenses" ? "activeNav" : ""} onClick={() => setActiveTab("expenses")}>
            Expenses
          </button>

          <button className={activeTab === "reports" ? "activeNav" : ""} onClick={() => setActiveTab("reports")}>
            Reports
          </button>

          <button className={activeTab === "ledger" ? "activeNav" : ""} onClick={() => setActiveTab("ledger")}>
            Ledger
          </button>
        </nav>

        <button className="modeBtn" onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? "Light Mode" : "Dark Mode"}
        </button>

        <button className="logout" onClick={logout}>
          Logout
        </button>
      </aside>

      <main className="main">
        {activeTab === "dashboard" && (
          <>
            <div className="pageHeader">
              <div>
                <h1>Dashboard</h1>
                <p>Quick overview of flats, dues, collection and expenses.</p>
              </div>
            </div>

            <div className="cards">
              <div className="card">
                <span>Total Flats</span>
                <b>{dashboard.flats}</b>
              </div>

              <div className="card">
                <span>Active Flats</span>
                <b>{dashboard.active}</b>
              </div>

              <div className="card danger">
                <span>Total Due</span>
                <b>{rupee(dashboard.totalDue)}</b>
              </div>

              <div className="card success">
                <span>Advance</span>
                <b>{rupee(dashboard.totalAdvance)}</b>
              </div>

              <div className="card">
                <span>Total Collection</span>
                <b>{rupee(dashboard.collection)}</b>
              </div>

              <div className="card danger">
                <span>Total Expense</span>
                <b>{rupee(dashboard.totalExpense)}</b>
              </div>

              <div className={dashboard.netBalance >= 0 ? "card success" : "card danger"}>
                <span>Net Balance</span>
                <b>{rupee(dashboard.netBalance)}</b>
              </div>
            </div>

            <div className="chartGrid">
              <div className="chartCard">
                <h3>Collection vs Due</h3>

                <div className="barRow">
                  <span>Collected</span>

                  <div className="barTrack">
                    <div
                      className="barFill successBar"
                      style={{
                        width: `${Math.min(
                          100,
                          (dashboard.collection / Math.max(dashboard.collection + dashboard.totalDue, 1)) * 100
                        )}%`,
                      }}
                    />
                  </div>

                  <b>{rupee(dashboard.collection)}</b>
                </div>

                <div className="barRow">
                  <span>Due</span>

                  <div className="barTrack">
                    <div
                      className="barFill dangerBar"
                      style={{
                        width: `${Math.min(
                          100,
                          (dashboard.totalDue / Math.max(dashboard.collection + dashboard.totalDue, 1)) * 100
                        )}%`,
                      }}
                    />
                  </div>

                  <b>{rupee(dashboard.totalDue)}</b>
                </div>
              </div>

              <div className="chartCard">
                <h3>Building Health</h3>

                <div className="donut">
                  <div>
                    <b>{dashboard.active}</b>
                    <span>Active Flats</span>
                  </div>
                </div>

                <p className="centerText">{dashboard.inactive} inactive flats</p>
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
              <input
                placeholder="Flat No"
                value={flatForm.flatNo}
                onChange={(e) => setFlatForm({ ...flatForm, flatNo: e.target.value })}
              />

              <input
                placeholder="Owner Name"
                value={flatForm.ownerName}
                onChange={(e) => setFlatForm({ ...flatForm, ownerName: e.target.value })}
              />

              <input
                placeholder="Mobile"
                value={flatForm.phone}
                onChange={(e) => setFlatForm({ ...flatForm, phone: e.target.value })}
                inputMode="numeric"
              />

              <input
                type="number"
                placeholder="Opening Due"
                value={flatForm.openingDue}
                onChange={(e) => setFlatForm({ ...flatForm, openingDue: e.target.value })}
              />

              <button onClick={saveFlat}>{flatForm.id ? "Update Flat" : "Add Flat"}</button>

              {flatForm.id && (
                <button className="dangerBtn" onClick={() => setFlatForm(emptyFlatForm)}>
                  Cancel Edit
                </button>
              )}
            </div>

            {data.flats.length === 0 ? (
              <EmptyState title="No flats added yet" text="Start by adding your first society flat." />
            ) : (
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Flat</th>
                      <th>Owner</th>
                      <th>Phone</th>
                      <th>Opening Due</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.flats.map((flat) => (
                      <tr key={flat.id}>
                        <td>{flat.flatNo || "-"}</td>
                        <td>{flat.ownerName || "-"}</td>
                        <td>{flat.phone || "-"}</td>
                        <td>{rupee(flat.openingDue)}</td>
                        <td>
                          <span className={flat.active === false ? "status inactive" : "status active"}>
                            {flat.active === false ? "Inactive" : "Active"}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => editFlat(flat)}>Edit</button>

                          {flat.active === false ? (
                            <button onClick={() => reactivateFlat(flat.id)}>Activate</button>
                          ) : (
                            <button className="dangerBtn" onClick={() => deactivateFlat(flat.id)}>
                              Deactivate
                            </button>
                          )}

                          {isSuperAdmin() && (
                            <button className="dangerBtn" onClick={() => deleteFlat(flat.id)}>
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              <input
                type="month"
                value={rateForm.fromMonth}
                onChange={(e) => setRateForm({ ...rateForm, fromMonth: e.target.value })}
              />

              <input
                type="number"
                placeholder="Maintenance Amount"
                value={rateForm.amount}
                onChange={(e) => setRateForm({ ...rateForm, amount: e.target.value })}
              />

              <button onClick={saveRate}>Add / Update Rate</button>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>From Month</th>
                    <th>Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {data.rateHistory.map((rate) => (
                    <tr key={rate.id}>
                      <td>{formatMonth(rate.fromMonth)}</td>
                      <td>{rupee(rate.amount)}</td>
                    </tr>
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
                <p>Add cash, UPI, bank transfer or cheque payments.</p>
              </div>
            </div>

            <div className="formGrid">
              <select value={paymentForm.flatId} onChange={(e) => setPaymentForm({ ...paymentForm, flatId: e.target.value })}>
                <option value="">Select Flat</option>

                {activeFlats.map((flat) => (
                  <option key={flat.id} value={flat.id}>
                    {flat.flatNo} - {flat.ownerName}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder="Amount"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
              />

              <select value={paymentForm.mode} onChange={(e) => setPaymentForm({ ...paymentForm, mode: e.target.value })}>
                <option>Cash</option>
                <option>UPI</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
              </select>

              <input
                type="date"
                value={paymentForm.date}
                onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
              />

              <input
                placeholder="Note"
                value={paymentForm.note}
                onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
              />

              <button onClick={addPayment}>Save Payment</button>
            </div>

            {data.payments.length === 0 ? (
              <EmptyState title="No payments yet" text="Payments will appear here after entry." />
            ) : (
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Flat</th>
                      <th>Amount</th>
                      <th>Mode</th>
                      <th>Note</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.payments.map((payment) => {
                      const flat = data.flats.find((f) => f.id === payment.flatId);

                      return (
                        <tr key={payment.id}>
                          <td>{payment.date}</td>
                          <td>{flat?.flatNo || "-"}</td>
                          <td>{rupee(payment.amount)}</td>
                          <td>{payment.mode}</td>
                          <td>{payment.note || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
                <input
                  type="number"
                  placeholder="Amount"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                />

                <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
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
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                />

                <input
                  placeholder="Note / Vendor / Bill details"
                  value={expenseForm.note}
                  onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })}
                />

                <button onClick={addExpense}>Add Expense</button>
              </div>
            )}

            {data.expenses.length === 0 ? (
              <EmptyState title="No expenses yet" text="Expense records will appear here." />
            ) : (
              <div className="tableWrap">
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
                    {data.expenses.map((expense) => (
                      <tr key={expense.id}>
                        <td>{expense.date}</td>
                        <td>{expense.category}</td>
                        <td>{rupee(expense.amount)}</td>
                        <td>{expense.note || "-"}</td>
                        <td>{expense.createdBy || "-"}</td>
                        <td>
                          {isSuperAdmin() ? (
                            <button className="dangerBtn" onClick={() => deleteExpense(expense.id)}>
                              Delete
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

              <a href={getWhatsAppSummaryLink()} target="_blank" rel="noreferrer" className="reportLink">
                WhatsApp Summary
              </a>
            </div>

            <div className="cards">
              <div className="card success">
                <span>Month Collection</span>
                <b>{rupee(monthlyReport.collected)}</b>
              </div>

              <div className="card danger">
                <span>Month Expense</span>
                <b>{rupee(monthlyReport.expenseTotal)}</b>
              </div>

              <div className={monthlyReport.net >= 0 ? "card success" : "card danger"}>
                <span>Month Net Balance</span>
                <b>{rupee(monthlyReport.net)}</b>
              </div>
            </div>

            <div className="chartGrid">
              <div className="chartCard">
                <h3>Payment Mode Summary</h3>

                {Object.keys(monthlyReport.modeTotals).length === 0 && <p>No payments this month.</p>}

                {Object.entries(monthlyReport.modeTotals).map(([mode, amount]) => (
                  <div className="barRow" key={mode}>
                    <span>{mode}</span>

                    <div className="barTrack">
                      <div
                        className="barFill successBar"
                        style={{
                          width: `${Math.min(100, (amount / Math.max(monthlyReport.collected, 1)) * 100)}%`,
                        }}
                      />
                    </div>

                    <b>{rupee(amount)}</b>
                  </div>
                ))}
              </div>

              <div className="chartCard">
                <h3>Expense Category Summary</h3>

                {Object.keys(monthlyReport.categoryTotals).length === 0 && <p>No expenses this month.</p>}

                {Object.entries(monthlyReport.categoryTotals).map(([cat, amount]) => (
                  <div className="barRow" key={cat}>
                    <span>{cat}</span>

                    <div className="barTrack">
                      <div
                        className="barFill dangerBar"
                        style={{
                          width: `${Math.min(100, (amount / Math.max(monthlyReport.expenseTotal, 1)) * 100)}%`,
                        }}
                      />
                    </div>

                    <b>{rupee(amount)}</b>
                  </div>
                ))}
              </div>
            </div>

            <h2>Payments</h2>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Flat</th>
                    <th>Amount</th>
                    <th>Mode</th>
                    <th>Note</th>
                  </tr>
                </thead>

                <tbody>
                  {monthlyReport.payments.map((p) => {
                    const flat = data.flats.find((f) => f.id === p.flatId);

                    return (
                      <tr key={p.id}>
                        <td>{p.date}</td>
                        <td>{flat?.flatNo || "-"}</td>
                        <td>{rupee(p.amount)}</td>
                        <td>{p.mode}</td>
                        <td>{p.note || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h2>Expenses</h2>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Note</th>
                    <th>Added By</th>
                  </tr>
                </thead>

                <tbody>
                  {monthlyReport.expenses.map((e) => (
                    <tr key={e.id}>
                      <td>{e.date}</td>
                      <td>{e.category}</td>
                      <td>{rupee(e.amount)}</td>
                      <td>{e.note || "-"}</td>
                      <td>{e.createdBy || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                <select
                  className="flatSelect"
                  value={selectedFlat?.id || ""}
                  onChange={(e) => setSelectedFlatId(e.target.value)}
                >
                  {visibleFlats.map((flat) => (
                    <option key={flat.id} value={flat.id}>
                      {flat.flatNo || "-"} - {flat.ownerName || "-"}
                    </option>
                  ))}
                </select>

                {selectedFlat && <LedgerView flat={selectedFlat} data={data} whatsappLink={getWhatsAppLink(selectedFlat)} />}
              </>
            ) : (
              <EmptyState title="No ledger found" text="No flat is linked with this account yet." />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function LedgerView({ flat, data, whatsappLink }) {
  const ledger = buildLedger(flat, data);

  return (
    <div className="ledgerBox">
      <div className="ledgerHeader">
        <div>
          <h2>Flat {flat.flatNo}</h2>
          <p>
            {flat.ownerName} · {flat.phone}
          </p>
        </div>

        <a href={whatsappLink} target="_blank" rel="noreferrer">
          WhatsApp Receipt
        </a>
      </div>

      <div className="cards">
        <div className="card danger">
          <span>Total Due</span>
          <b>{rupee(ledger.totalDue)}</b>
        </div>

        <div className="card success">
          <span>Advance</span>
          <b>{rupee(ledger.advance)}</b>
        </div>

        <div className="card">
          <span>Total Paid</span>
          <b>{rupee(ledger.totalPaid)}</b>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Charge</th>
              <th>Paid Adjusted</th>
              <th>Balance Due</th>
            </tr>
          </thead>

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

function EmptyState({ title, text }) {
  return (
    <div className="emptyState">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}