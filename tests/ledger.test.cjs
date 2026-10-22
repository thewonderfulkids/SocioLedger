const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const source = fs.readFileSync('src/App.jsx', 'utf8');
function loadLedger(text) {
  const segment = (a, b) => text.slice(text.indexOf(`function ${a}(`), text.indexOf(`function ${b}(`));
  const context = { Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-22T12:00:00Z'])); } } };
  vm.createContext(context);
  vm.runInContext(segment('normalizePhone', 'getLoginEmailCandidates') + segment('getCurrentMonth', 'formatMonth') + segment('monthRange', 'normalizeList') + segment('toMoney', 'getMonthPaymentInfo'), context);
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
// Role/society/flat access helpers remain compatible for Manager and Resident.
const accessSource = source.slice(source.indexOf('function normalizeRole('), source.indexOf('function toMoney('));
const access = { roles:{SUPER_ADMIN:'super_admin',MANAGER:'manager',RESIDENT:'resident'} };
vm.createContext(access);
vm.runInContext(source.slice(source.indexOf('function normalizePhone('),source.indexOf('function getLoginEmailCandidates('))+accessSource,access);
assert.equal(access.canAccessSociety({role:'manager',societyIds:{default_society:true}},'default_society'),true);
assert.equal(access.canAccessSociety({role:'manager',societyIds:{other:true}},'default_society'),false);
assert.equal(access.isFlatLinkedToUser({id:'403',residentUid:'resident403'},{role:'resident'},{uid:'resident403'},'default_society'),true);
assert.equal(access.isFlatLinkedToUser({id:'201',residentUid:'resident201'},{role:'resident'},{uid:'resident403'},'default_society'),false);
console.log('PASS: Manager assigned-society and Resident linked-flat access');
assert.equal(current.isValidPaymentDate('2026-10-06'),true);
assert.equal(current.isValidPaymentDate('2026-31-31'),false);
assert.equal(current.isValidPaymentDate('2026-02-30'),false);
assert.equal(current.isValidPaymentDate('2028-02-29'),true);
console.log('PASS: editable mobile date accepts real ISO dates and rejects malformed new entries');
// Prospective payment policy: new receipts never reapply historical packages.
let scenarios = 0;
for (const no of Object.keys(fixtures)) {
  const f = {id:no,flatNo:no,openingDue:0};
  const d = {rateHistory,payments:paymentsFor(no)};
  const before = current.buildLedger(f,d);
  for (const amount of [0.01,200,799.99,800,1100,1600,3200,12345.67]) {
    for (const [date,forMonth] of [['2026-01-01','2026-01'],['2026-10-22','2026-10'],['2027-06-15','2027-06']]) {
      const receipt={id:`new-${scenarios++}`,flatId:no,amount,date,forMonth,allocationVersion:2};
      const preview=current.getPaymentPreview(f,d,receipt);
      assert.equal(preview.balanced,true,`${no} ${amount} ${date}`);
      const after=preview.after;
      assert.equal(Math.round((before.totalDue-before.advance-amount)*100),Math.round((after.totalDue-after.advance)*100));
      assert.ok(Math.abs((before.totalPaid-before.totalAdjusted-before.advance)-(after.totalPaid-after.totalAdjusted-after.advance)) < 0.005,'historical unallocated difference must not grow');
      assert.ok(after.totalDue<0.005 || after.advance<0.005,'do not leave payable due beside available advance');
      // Removing the proposed receipt must restore the exact pre-payment ledger.
      assert.equal(JSON.stringify(current.buildLedger(f,d)),JSON.stringify(before));
    }
  }
}
const futureFlat={id:'new',flatNo:'new'};
const futureData={rateHistory:[{fromMonth:'2026-04',amount:800}],payments:[{id:'advance',flatId:'new',date:'2026-04-01',forMonth:'2026-04',amount:10000,allocationVersion:2}]};
assert.equal(current.buildLedger(futureFlat,futureData,'2026-10').advance,4400);
assert.equal(current.buildLedger(futureFlat,futureData,'2026-11').advance,3600);
assert.equal(current.buildLedger(futureFlat,futureData,'2027-05').totalDue,1200);
console.log(`PASS: ${scenarios} future receipt scenarios; paise, backdating, future months, packages, advance consumption and removal`);
const acknowledged = futureData.payments[0];
assert.equal(current.getPaymentPreview(futureFlat,futureData,acknowledged).balanced,true);
assert.equal(current.getPaymentPreview(futureFlat,futureData,acknowledged).after.totalPaid,10000);
console.log('PASS: realtime acknowledgement plus retry does not double-count a receipt');
const centsData={rateHistory:[{fromMonth:'2026-10',amount:800}],payments:[799.99,0.01].map((amount,i)=>({id:`cents-${i}`,flatId:'new',amount,date:`2026-10-0${i+1}`,forMonth:'2026-10',allocationVersion:2}))};
const centsLedger=current.buildLedger(futureFlat,centsData);
assert.equal(centsLedger.totalDue,0);assert.equal(centsLedger.advance,0);assert.equal(centsLedger.entries[0].due,0);
console.log('PASS: paise rounding leaves no phantom dues after 799.99 + 0.01');
