// Pure, read-only reporting. Allocation snapshots use the existing ledger engine.
export function buildYearlyAuditRows({ year, asOfMonth, flats, data, buildLedger, getPaymentMonth, getEffectivePaymentAmount, isPaymentForFlat }) {
  if (!/^\d{4}$/.test(String(year))) throw new Error("Select a valid year.");
  const rows = [
    ["SocioLedger Yearly Ledger Audit"],
    ["Year", year, "As of month", asOfMonth],
    ["Basis", "Current allocation snapshot, not a historical closing statement. Later receipts may settle earlier months. Future charges are excluded."],
    ["Source", "Active payments only; deleted payments are excluded. No records are changed."],
    [],
    ["Monthly allocations"],
    ["Flat", "Resident", "Month", "Charge", "Direct adjusted", "Advance adjusted", "Total adjusted", "Due"],
  ];
  const summaries = [];
  for (const flat of flats) {
    const ledger = buildLedger(flat, data, asOfMonth);
    const entries = ledger.entries.filter(e => e.month.startsWith(`${year}-`) && e.month <= asOfMonth);
    for (const e of entries) rows.push([flat.flatNo, flat.ownerName, e.month, e.charge, e.directPaid, e.advanceAdjusted, e.paid, e.due]);
    summaries.push([flat.flatNo, flat.ownerName,
      entries.reduce((s,e) => s + e.charge, 0),
      entries.reduce((s,e) => s + e.paid, 0),
      entries.reduce((s,e) => s + e.due, 0),
      ledger.totalDue, ledger.advance,
      ledger.totalPaid, ledger.totalAdjusted,
      ledger.totalPaid + Number(flat.advance || flat.openingAdvance || flat.advanceBalance || 0) - ledger.totalAdjusted - ledger.advance,
    ]);
  }
  rows.push([], ["Flat summary"],
    ["Flat", "Resident", "Year charges", "Year adjusted", "Year due", "All-time due as of month", "Remaining advance as of month", "All-time effective receipts", "All-time adjusted", "Unallocated historical difference (review if nonzero)"],
    ...summaries, [], ["Active receipts assigned to selected year"],
    ["Flat", "Payment ID", "Raw date", "Assigned month", "Recorded amount", "Effective ledger amount", "Mode", "Note"]);
  for (const flat of flats) {
    for (const payment of data.payments.filter(p => isPaymentForFlat(p, flat) && getPaymentMonth(p).startsWith(`${year}-`))) {
      rows.push([flat.flatNo, payment.id, payment.date || payment.paymentDate || "", getPaymentMonth(payment),
        payment.amount ?? payment.paidAmount ?? payment.paymentAmount ?? payment.receivedAmount ?? payment.amountReceived ?? payment.collectedAmount ?? payment.advanceAmount ?? payment.totalAmount ?? 0,
        getEffectivePaymentAmount(payment, flat, data), payment.mode, payment.note]);
    }
  }
  return rows;
}

export function serializeCSV(rows) {
  const cell = value => {
    let text = String(value ?? "");
    // Spreadsheet formula injection protection for imported names/notes/IDs.
    if (typeof value !== "number" && /^[\s\uFEFF]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n");
}
