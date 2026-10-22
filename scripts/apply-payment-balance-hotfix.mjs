import fs from 'node:fs';

const file = 'src/App.jsx';
let source = fs.readFileSync(file, 'utf8');

const oldBlock = `    await set(ref(db, societyPath(selectedSocietyId, \`payments/\${id}\`)), {
      id,
      flatId: paymentForm.flatId,
      flatNo: paymentFlat?.flatNo || "",
      residentUid: paymentFlat?.residentUid || (paymentFlat?.phone ? \`resident_\${normalizePhone(paymentFlat.phone)}\` : ""),
      amount: Number(paymentForm.amount),
      mode: paymentForm.mode,
      date: paymentForm.date,
      forMonth: paymentForm.forMonth,
      note: paymentForm.note.trim(),
      createdBy: user?.name || "",
      createdAt: Date.now(),
    });`;

const newBlock = `    const paymentPayload = {
      id,
      flatId: paymentForm.flatId,
      flatNo: paymentFlat?.flatNo || "",
      residentUid: paymentFlat?.residentUid || (paymentFlat?.phone ? \`resident_\${normalizePhone(paymentFlat.phone)}\` : ""),
      amount: Number(paymentForm.amount),
      mode: paymentForm.mode,
      date: paymentForm.date,
      forMonth: paymentForm.forMonth,
      note: paymentForm.note.trim(),
      createdBy: user?.name || "",
      createdAt: Date.now(),
    };

    await set(ref(db, societyPath(selectedSocietyId, \`payments/\${id}\`)), paymentPayload);

    // Do not wait for the realtime listener before recalculating balances.
    // The listener will shortly replace this optimistic copy by the same Firebase record.
    setData((prev) => ({
      ...prev,
      payments: [
        ...prev.payments.filter((payment) => payment.id !== id),
        paymentPayload,
      ],
    }));`;

if (!source.includes(oldBlock)) {
  throw new Error('Expected addPayment block not found; refusing unsafe patch.');
}
source = source.replace(oldBlock, newBlock);

// Android date input hotfix: keep payment date directly editable while preserving ISO storage.
const oldDate = `<input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} />`;
const newDate = `<input type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} aria-label="Payment date (YYYY-MM-DD)" />`;
if (source.includes(oldDate)) source = source.replace(oldDate, newDate);

fs.writeFileSync(file, source);
console.log('Applied payment balance refresh hotfix.');
