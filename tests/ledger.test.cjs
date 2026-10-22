const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const source = fs.readFileSync('src/App.jsx', 'utf8');
function loadLedger(text) {
  const segment = (a, b) => text.slice(text.indexOf(`function ${a}(`), text.indexOf(`function ${b}(`));
  const context = { Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-22T12:00:00Z'])); } } };
  vm.createContext(context);
  vm.runInContext(segment('normalizePhone', 'phoneToEmail') + segment('getCurrentMonth', 'formatMonth') + segment('monthRange', 'normalizeList') + segment('toMoney', 'getMonthPaymentInfo'), context);
  return context;
}
const current = loadLedger(source);
const baseline = loadLedger(execFileSync('git', ['show', 'b7d0df08c907f7386a5b7b6873ca180e9aa1d4d6:src/App.jsx'], {encoding:'utf8'}));
const rateHistory = [{fromMonth:'2025-12',amount:1000},{fromMonth:'2026-04',amount:800}];
const fixtures = {
  '403': [[1100,'2026-10-06','2026-10'],[1500,'2026-08-20','2026-08'],[1600,'2026-06-29','2026-06'],[800,'2026-05-10','2026-05'],[4800,'2026-31-31','']],
  '201': [[2400,'2026-10-14','2026-10'],[1400,'2026-08-02','2026-08'],[5800,'2026-04-27','2026-04']],
  '203': [[800,'2026-09-18','2026-09'],[800,'2026-10-08','2026-10'],[800,'2026-08-13','2026-08'],[800,'2026-07-08','2026-07'],[800,'2026-06-06','2026-06'],[800,'2026-05-09','2026-05'],[4800,'2026-03-31','2026-03']],
  '402': [[1600,'2026-09-17','2026-09'],[800,'2026-07-16','2026-07'],[800,'2026-06-11','2026-06'],[800,'2026-05-13','2026-05'],[4800,'2026-04-30','2026-04']]
};
function paymentsFor(no) {
 return fixtures[no].map(([amount,date,forMonth],i)=>({id: no==='403' && amount===4800 ? '-OrwoOd3xJIds_HrJ7qu' : no==='201' && amount===5800 ? '-OrwmuwfCdwtA2pULu1c' : `${no}-${i}`,flatId:no,flatNo:no,amount,date,forMonth,note:amount===4800?'Carried Forward from Previous months':''}));
}
const flat = {id:'403',flatNo:'403',openingDue:0};
const payments = paymentsFor('403');
const data = {rateHistory,payments};
const oldAfter = baseline.buildLedger(flat,data);
assert.equal(oldAfter.totalDue,800);
assert.equal(oldAfter.totalPaid-oldAfter.totalAdjusted-oldAfter.advance,1000);
const before = current.buildLedger(flat,{...data,payments:payments.slice(1)});
assert.equal(before.totalDue,900);
assert.equal(before.advance,0);
const after = current.buildLedger(flat,data);
assert.equal(after.totalDue,0);
assert.equal(after.advance,200);
assert.equal(after.totalPaid,9800);
assert.equal(after.totalAdjusted,9600);
assert.equal(after.totalPaid,after.totalAdjusted+after.advance);
assert.ok(after.entries.every(e=>e.due===0));
for (const shuffled of [[...payments].reverse(),[payments[4],...payments.slice(0,4)]]) {
 assert.equal(JSON.stringify(current.buildLedger(flat,{...data,payments:shuffled})), JSON.stringify(after));
}
for(const no of ['201','203','402']) {
 const f={id:no,flatNo:no,openingDue:0};
 const d={rateHistory,payments:paymentsFor(no)};
 for(const month of ['2026-04','2026-07','2026-10','2026-12']) {
  assert.equal(JSON.stringify(current.buildLedger(f,d,month)),JSON.stringify(baseline.buildLedger(f,d,month)),`${no} regression ${month}`);
 }
}
// This compatibility rule must never match another flat, receipt, or valid date.
for(const [p,f] of [[{...payments[4],id:'different'},flat],[payments[4],{...flat,flatNo:'402'}],[{...payments[4],date:'2026-04-30'},flat]]) assert.equal(current.isFlat403LegacyClose(p,f),false);
assert.equal(current.getEffectivePaymentAmount(paymentsFor('201')[2],{flatNo:'201'},{rateHistory}),5000);
console.log('PASS: reproduced production loss; 403 due 900 -> 0, advance 200; ordering, cash conservation and 201/203/402 regressions');
console.table(after.entries.map(({month,charge,paid,due})=>({month,charge,paid,due})));
