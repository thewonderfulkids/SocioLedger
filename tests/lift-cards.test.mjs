import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiftCardIncome, incomeTotal, saveIncomeOnce } from '../src/lift-cards.js';
const flats=[{id:'flat403',flatNo:'403'}];
const form={flatId:'flat403',quantity:'2',reason:'replacement',date:'2026-10-23',mode:'Cash',note:'Card reference'};
const context={id:'receipt1',uid:'manager1',name:'Manager',now:1000};
test('additional and replacement cards are non-refundable other income at 200 each',()=>{
 for(const reason of ['additional','replacement']) {
  const r=createLiftCardIncome({...form,reason},flats,context);
  assert.equal(r.amount,400);assert.equal(r.quantity,2);assert.equal(r.unitRate,200);assert.equal(r.nonRefundable,true);assert.equal(r.type,'lift_card');
  assert.equal(incomeTotal([r]),400);assert.equal(r.flatNo,'403');assert.equal('forMonth' in r,false);
 }
});
test('reject invalid flat, fraction, negative count, invalid date and payment mode',()=>{
 for(const change of [{flatId:'unknown'},{quantity:0},{quantity:-1},{quantity:1.5},{quantity:101},{date:'2026-02-30'},{date:'2026-31-31'},{mode:'unknown'},{reason:'free'}]) assert.throws(()=>createLiftCardIncome({...form,...change},flats,context));
});
test('retry confirms existing same receipt and never overwrites a different receipt',async()=>{
 const record=createLiftCardIncome(form,flats,context);let stored=null,writes=0;
 const transaction=async (ref,update,options)=>{assert.equal(ref,'otherIncome/receipt1');assert.equal(options.applyLocally,false);const next=update(stored);if(next){stored=next;writes++}return {committed:!!next,snapshot:{val:()=>stored}}};
 await saveIncomeOnce('otherIncome/receipt1',record,transaction);await saveIncomeOnce('otherIncome/receipt1',record,transaction);assert.equal(writes,1);
 await assert.rejects(saveIncomeOnce('otherIncome/receipt1',{...record,amount:200},transaction));assert.equal(stored.amount,400);
});
test('card receipt cannot change any maintenance ledger including Flat 201 and 403',async()=>{
 const fs=await import('node:fs');const vm=await import('node:vm');const source=fs.readFileSync('src/App.jsx','utf8');
 const segment=(a,b)=>source.slice(source.indexOf(`function ${a}(`),source.indexOf(`function ${b}(`));
 const ctx={};vm.createContext(ctx);vm.runInContext(segment('normalizePhone','getLoginEmailCandidates')+segment('getCurrentMonth','formatMonth')+segment('monthRange','normalizeList')+segment('toMoney','getMonthPaymentInfo'),ctx);
 const data={rateHistory:[{fromMonth:'2026-04',amount:800}],payments:[]};
 for(const flatNo of ['201','403','101']) {
  const flat={id:flatNo,flatNo,openingDue:900};const before=JSON.stringify(ctx.buildLedger(flat,data,'2026-10'));
  assert.equal(JSON.stringify(ctx.buildLedger(flat,{...data,otherIncome:[createLiftCardIncome(form,flats,context)]},'2026-10')),before);
 }
});
