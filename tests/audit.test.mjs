import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildYearlyAuditRows, serializeCSV } from '../src/audit.js';

test('CSV protects imported formulas and preserves quotes, Hindi, multiline text and numeric amounts', () => {
  const csv = serializeCSV([['=1+1','\t@SUM(A1)','-receipt','नाम, "test"\nnext',-200,200]]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'\t@SUM(A1)"'));
  assert.ok(csv.includes('"\'-receipt"'));
  assert.ok(csv.includes('"नाम, ""test""\nnext"'));
  assert.ok(csv.endsWith('"-200","200"'));
});

test('audit uses visible flats and active receipts only; excludes future charges; changes no input', () => {
  const flats = Object.freeze([Object.freeze({id:'403',flatNo:'403',ownerName:'Resident'})]);
  const data = Object.freeze({payments:Object.freeze([
    Object.freeze({id:'active',flatId:'403',date:'2026-10-06',forMonth:'2026-10',amount:1100}),
    Object.freeze({id:'other-flat',flatId:'201',date:'2026-10-14',forMonth:'2026-10',amount:2400}),
  ]),paymentDeletionLogs:Object.freeze([{id:'deleted',flatId:'403',amount:3200}])});
  const before=JSON.stringify({flats,data});
  const rows=buildYearlyAuditRows({year:'2026',asOfMonth:'2026-10',flats,data,
    buildLedger:()=>({entries:[
      {month:'2025-12',charge:1000,paid:1000,due:0},
      {month:'2026-10',charge:800,directPaid:800,advanceAdjusted:0,paid:800,due:0},
      {month:'2026-11',charge:800,paid:0,due:800}],totalDue:0,advance:200,totalPaid:9800,totalAdjusted:9600}),
    getPaymentMonth:p=>p.forMonth,getEffectivePaymentAmount:p=>p.amount,isPaymentForFlat:(p,f)=>p.flatId===f.id});
  assert.ok(rows.some(r=>r[2]==='2026-10'&&r[3]===800));
  assert.ok(!rows.some(r=>r.includes('2026-11')||r.includes('2025-12')||r.includes('deleted')||r.includes('other-flat')));
  assert.ok(rows.some(r=>r[1]==='active'));
  assert.ok(rows.some(r=>r[0]==='403'&&r[6]===200&&r[9]===0));
  assert.equal(JSON.stringify({flats,data}),before);
});
