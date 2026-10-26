import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyFundReport } from '../src/monthly-report.js';
import { posterFilename, posterPDF } from '../src/report-export.js';

const base = {
  getPaymentMonth: p => p.forMonth || String(p.date || '').slice(0, 7),
  getPaymentAmount: p => Number(p.amount),
};
const build = (data, month) => buildMonthlyFundReport({ ...base, ...data, month });
test('advance and late receipts appear once by receipt date, with continuous opening/closing', () => {
  const data = { payments: [
    { date: '2026-05-29', forMonth: '2026-06', amount: 800 },
    { date: '2026-06-02', forMonth: '2026-04', amount: 1600 },
    { date: '2026-06-30', forMonth: '2026-07', amount: 800 },
    { date: '2026-07-01', forMonth: '2026-06', amount: 1600 },
  ], expenses: [{ date: '2026-06-15', amount: 100, category: 'Repair' }] };
  const before = structuredClone(data);
  const reports = ['2026-04','2026-05','2026-06','2026-07'].map(month => build(data, month));
  assert.deepEqual(reports.map(r => r.collected), [0, 800, 2400, 1600]);
  assert.equal(reports.reduce((s, r) => s + r.collected, 0), 4800);
  for (let i = 1; i < reports.length; i++) assert.equal(reports[i].opening, reports[i - 1].closing);
  assert.equal(reports.at(-1).closing, 4700);
  assert.deepEqual(data, before);
});
test('pending dues never become cash; later-settled cards use settlement month', () => {
  const data = { otherIncome: [
    { type:'lift_card', date:'2026-09-01', amount:400, paymentStatus:'unpaid' },
    { type:'lift_card', date:'2026-09-01', amount:200, paymentStatus:'paid', paidByUid:'manager', paidAt:Date.parse('2026-10-02T10:00:00Z') },
    { type:'lift_card', date:'2026-09-10', amount:200 },
  ] };
  assert.equal(build(data,'2026-09').incomeTotal, 200);
  const october = build(data,'2026-10');
  assert.equal(october.opening, 200); assert.equal(october.incomeTotal, 200); assert.equal(october.closing, 400);
});
test('legacy malformed date is counted once with an explicit fallback note; unknown dates block export', () => {
  const data = { payments:[{ date:'2026-31-31', forMonth:'2026-04', amount:4800 }] };
  assert.equal(build(data,'2026-04').collected,4800);
  assert.equal(build(data,'2026-05').opening,4800);
  assert.equal(build(data,'2026-05').fallbackCount,1);
  assert.equal(build(data,'2026-05').errors.length,0);
  assert.ok(build({ payments:[{ date:'bad', amount:800 }] },'2026-05').errors.length);
  assert.ok(build({ expenses:[{ date:'2026-02-30', amount:800 }] },'2026-05').errors.length);
});
test('category totals and cash balance include paid contributions only; future entries excluded', () => {
  const data = { payments:[{date:'2026-09-28',forMonth:'2026-10',amount:800},{date:'2026-10-01',amount:800},{date:'2026-11-01',amount:800}],
    expenses:[{date:'2026-10-20',amount:2830,category:'Repair'},{date:'2026-10-20',amount:1000,category:'Repair'}],
    otherIncome:[{type:'lift_card',date:'2026-10-10',amount:400},{type:'lift_card',date:'2026-10-10',amount:600,paymentStatus:'unpaid'}] };
  const r=build(data,'2026-10');
  assert.equal(r.opening,800);assert.equal(r.collected,800);assert.equal(r.totalReceipts,1200);
  assert.equal(r.closing,-1830);assert.equal(r.categoryTotals.Repair,3830);
  assert.equal(r.errors.length,0);
});
test('PDF has a correct byte-offset xref and image stream; filenames cannot contain paths', async () => {
  const jpeg = new Uint8Array([255,216,255,217]);
  const blob = await posterPDF({width:1080,height:1600,toBlob:callback=>callback(new Blob([jpeg],{type:'image/jpeg'}))});
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder('latin1').decode(bytes);
  assert.equal(blob.type,'application/pdf'); assert.ok(text.startsWith('%PDF-1.4'));
  const xref = Number(text.match(/startxref\n(\d+)/)[1]); assert.equal(text.slice(xref,xref+4),'xref');
  const offsets = [...text.matchAll(/(\d{10}) 00000 n/g)].map(m=>Number(m[1]));
  offsets.forEach((offset,i)=>assert.ok(text.slice(offset).startsWith(`${i+1} 0 obj`)));
  assert.equal(posterFilename('../Happy Homes','2026-10','png'),'_Happy_Homes_2026-10_Fund_Summary.png');
});
