import { incomeTotal } from './lift-cards.js';

export function validDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

// A receipt belongs to exactly one cash month, regardless of its maintenance allocation.
export function cashMonth(payment, getPaymentMonth) {
  const date = payment.date || payment.paymentDate;
  if (validDate(date)) return String(date).slice(0, 7);
  const assigned = getPaymentMonth(payment);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(assigned) ? assigned : '';
}

export function buildMonthlyFundReport({ month, payments = [], expenses = [], otherIncome = [], getPaymentMonth, getPaymentAmount }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Select a valid month.');
  const paymentRows = payments.map(record => ({ record, month: cashMonth(record, getPaymentMonth), amount: getPaymentAmount(record) }));
  const expenseRows = expenses.map(record => ({ record, month: validDate(record.date) ? record.date.slice(0, 7) : '', amount: Number(record.amount || 0) }));
  // Unpaid card issues are receivables, never available cash.
  const incomeRows = otherIncome.filter(record => record.paymentStatus !== 'unpaid').map(record => {
    // Cards initially issued unpaid carry a separate settlement timestamp.
    const date = record.paidByUid && Number(record.paidAt) > 0
      ? new Date(Number(record.paidAt)).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      : record.date;
    return { record, month: validDate(date) ? date.slice(0, 7) : '', amount: incomeTotal([record]) };
  });
  const allRows = [...paymentRows, ...expenseRows, ...incomeRows];
  const errors = [];
  if (allRows.some(row => !row.month || !Number.isFinite(row.amount) || row.amount < 0)) errors.push('Some records have an invalid date or amount. Review them before exporting a fund balance.');
  const fallbackCount = paymentRows.filter(row => !validDate(row.record.date || row.record.paymentDate)).length;
  const sum = (rows, predicate) => rows.filter(predicate).reduce((total, row) => total + row.amount, 0);
  const before = row => row.month < month;
  const during = row => row.month === month;
  const opening = sum(paymentRows, before) + sum(incomeRows, before) - sum(expenseRows, before);
  const collected = sum(paymentRows, during);
  const contribution = sum(incomeRows, during);
  const expenseTotal = sum(expenseRows, during);
  const monthPayments = paymentRows.filter(during).map(row => row.record);
  const monthExpenses = expenseRows.filter(during).map(row => row.record);
  const categoryTotals = Object.fromEntries([...new Set(monthExpenses.map(e => e.category || 'General'))].map(category => [category, monthExpenses.filter(e => (e.category || 'General') === category).reduce((s, e) => s + Number(e.amount), 0)]));
  const modeTotals = Object.fromEntries([...new Set(monthPayments.map(p => p.mode || 'Other'))].map(mode => [mode, monthPayments.filter(p => (p.mode || 'Other') === mode).reduce((s, p) => s + getPaymentAmount(p), 0)]));
  const totalReceipts = collected + contribution;
  const closing = opening + totalReceipts - expenseTotal;
  const closingIndependent = sum(paymentRows, row => row.month <= month) + sum(incomeRows, row => row.month <= month) - sum(expenseRows, row => row.month <= month);
  if (Math.abs(closing - closingIndependent) > 0.005) errors.push('Fund reconciliation failed. Export is unavailable.');
  return { month, payments: monthPayments, expenses: monthExpenses, otherIncome: incomeRows.filter(during).map(row => row.record), collected, incomeTotal: contribution, totalReceipts, opening, availableBeforeExpenses: opening + totalReceipts, expenseTotal, closing, net: totalReceipts - expenseTotal, categoryTotals, modeTotals, errors, fallbackCount };
}
