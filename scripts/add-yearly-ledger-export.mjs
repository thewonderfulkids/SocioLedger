import fs from 'node:fs';

const file = 'src/App.jsx';
let src = fs.readFileSync(file, 'utf8');

const marker = 'function rupee(n) {';
if (!src.includes(marker)) throw new Error('rupee marker not found');

const helper = `function csvCell(value) {
  const text = String(value ?? "");
  return /[",\\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function downloadYearlyLedgerCsv(flat, data, year) {
  const y = Number(year);
  if (!flat || !Number.isInteger(y)) return;

  const months = Array.from({ length: 12 }, (_, index) =>
    \`\${y}-\${String(index + 1).padStart(2, "0")}\`
  );

  const rows = [[
    "Year", "Flat No", "Owner", "Month", "Maintenance Charge",
    "Payment Received", "Paid/Adjusted", "Closing Due", "Closing Advance"
  ]];

  months.forEach((month) => {
    const ledger = buildLedger(flat, data, month);
    const entry = ledger.entries.find((item) => item.month === month);
    const payments = data.payments.filter((payment) =>
      String(payment.flatId || payment.flatID || payment.flat || "") === String(flat.id) &&
      getPaymentMonth(payment) === month
    );
    const received = payments.reduce((sum, payment) => sum + getPaymentAmount(payment), 0);

    rows.push([
      y,
      flat.flatNo || flat.id || "",
      flat.ownerName || "",
      formatMonth(month),
      entry?.charge || 0,
      received,
      entry?.paid || 0,
      ledger.totalDue || 0,
      ledger.advance || 0,
    ]);
  });

  const csv = '\\uFEFF' + rows.map((row) => row.map(csvCell).join(",")).join("\\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = \`SocioLedger_\${flat.flatNo || flat.id}_\${y}_ledger.csv\`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

`;

src = src.replace(marker, helper + marker);

const ledgerMarker = '{/* Ledger table */}';
if (!src.includes(ledgerMarker)) throw new Error('ledger UI marker not found');

const ui = `{/* Read-only yearly export: uses existing ledger engine; never writes financial data. */}
              <button
                type="button"
                className="secondary"
                onClick={() => downloadYearlyLedgerCsv(selectedFlat, data, Number(selectedMonth?.slice(0, 4) || getCurrentMonth().slice(0, 4)))}
                disabled={!selectedFlat}
                title="Download Jan-Dec ledger as CSV"
              >
                Download Yearly Ledger CSV
              </button>
              ${ledgerMarker}`;

src = src.replace(ledgerMarker, ui);
fs.writeFileSync(file, src);
console.log('Yearly ledger CSV export added without changing ledger calculations or Firebase data.');
