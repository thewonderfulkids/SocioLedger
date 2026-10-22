const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/App.jsx','utf8');
const handler=source.slice(source.indexOf('  async function addPayment()'),source.indexOf('  async function deletePayment('));
function harness({fail=false,balanced=true}={}) {
 let release;const calls=[];const alerts=[];let ids=0;
 const context={
  paymentSaveLock:{current:false},paymentAttempt:{current:null},canManage:()=>true,
  paymentForm:{flatId:'test',amount:'1100',date:'2026-10-22',forMonth:'2026-10',mode:'Cash',note:''},
  selectedSocietyId:'test_society',data:{flats:[{id:'test',flatNo:'999'}],payments:[]},user:{name:'Test'},
  isValidPaymentDate:()=>true,createFirebaseId:()=>`receipt-${++ids}`,societyPath:(id,path)=>`${id}/${path}`,
  getPaymentPreview:()=>({balanced}),db:{},ref:(_,path)=>path,normalizePhone:x=>x,
  set:(path,payload)=>{calls.push({path,payload});return fail?Promise.reject({code:'permission-denied'}):new Promise(resolve=>{release=resolve})},
  setPaymentSaving:()=>{},setData:fn=>{context.data=fn(context.data)},setPaymentForm:()=>{},
  getCurrentMonth:()=> '2026-10',console:{error:()=>{}},alert:s=>alerts.push(s),
 };
 vm.createContext(context);vm.runInContext(handler,context);
 return {context,calls,alerts,release:()=>release(),ids:()=>ids,setFailure:value=>{fail=value}};
}
test('double-click writes only one receipt; realtime duplicate is replaced',async()=>{
 const h=harness();const first=h.context.addPayment();await h.context.addPayment();
 assert.equal(h.calls.length,1);assert.equal(h.context.paymentSaveLock.current,true);
 h.context.data.payments=[h.calls[0].payload];h.release();await first;
 assert.equal(h.context.data.payments.length,1);assert.equal(h.calls[0].payload.allocationVersion,2);
 assert.equal(h.context.paymentSaveLock.current,false);
});
test('failed save retries the same ID, without silently clearing the form',async()=>{
 const h=harness({fail:true});await h.context.addPayment();assert.equal(h.calls.length,1);assert.equal(h.context.data.payments.length,0);assert.equal(h.alerts.length,1);
 h.setFailure(false);const second=h.context.addPayment();assert.equal(h.calls.length,2);assert.equal(h.calls[0].path,h.calls[1].path);assert.equal(h.ids(),1);h.release();await second;
});
test('unbalanced preview or invalid currency performs no database write',async()=>{
 const bad=harness({balanced:false});await bad.context.addPayment();assert.equal(bad.calls.length,0);
 for(const amount of ['0','-1','NaN','1.001','100000000000000000']) {const h=harness();h.context.paymentForm.amount=amount;await h.context.addPayment();assert.equal(h.calls.length,0,amount)}
});
