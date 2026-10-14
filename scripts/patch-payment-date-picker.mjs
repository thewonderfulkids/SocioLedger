import fs from 'node:fs';

const path = 'src/App.jsx';
const source = fs.readFileSync(path, 'utf8');
const before = '<input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} />';
const after = `<input
                type="date"
                value={paymentForm.date}
                onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                onClick={(e) => e.currentTarget.showPicker?.()}
                aria-label="Payment date"
              />`;

if (!source.includes(before)) {
  throw new Error('Payment date input signature not found; refusing to patch App.jsx.');
}

const updated = source.replace(before, after);
if (updated === source) throw new Error('No change made.');
fs.writeFileSync(path, updated);
console.log('Payment date input patched for mobile native picker.');
