import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentSetupTransition as transition, publicPaymentSetup, normalizeSetupUser, canConfigurePaymentSetup } from '../lib/payment-setup.js';
import { createPaymentSetupHandler } from '../api/payment-setup.js';
const admin={uid:'admin',role:'super_admin'};
const manager={uid:'manager',role:'manager',societyIds:['test']};
const step=(current,body,user=admin,id='event')=>transition(current,body,user,'test',{now:123,eventId:id});
const personal={holderName:'Test Receiver',upiId:'test@bank',confirmed:true};
const bank={...personal,bankName:'Test Bank',accountNumber:'1234567890',confirmAccountNumber:'1234567890',ifsc:'TEST0001234'};
test('only Super Admin can select a society mode',()=>{
 for(const user of [manager,{uid:'resident',role:'resident',societyIds:['test']}]) assert.throws(()=>step(null,{action:'set_mode',mode:'personal_upi',expectedRevision:0},user),{status:403});
 const enabled=step(null,{action:'set_mode',mode:'personal_upi',expectedRevision:0});
 assert.equal(enabled.policy.mode,'personal_upi');assert.equal(enabled.public.active,false);
});
test('manager can link only the enabled mode in their own society',()=>{
 const enabled=step(null,{action:'set_mode',mode:'personal_upi',expectedRevision:0});
 const linked=step(enabled,{action:'save_receiver',mode:'personal_upi',receiver:personal,expectedRevision:1},manager,'receiver');
 assert.equal(linked.public.active,true);assert.equal(linked.public.holderName,'Test Receiver');
 assert.throws(()=>step(enabled,{action:'save_receiver',mode:'society_account',receiver:bank,expectedRevision:1},manager),{status:403});
 assert.throws(()=>step(enabled,{action:'save_receiver',mode:'personal_upi',receiver:personal,expectedRevision:1},{...manager,societyIds:['other']}),{status:403});
 assert.equal(enabled.receivers,undefined,'input setup is not mutated');
});
test('disabled/re-enabled modes cannot resurrect an old manager receiver',()=>{
 let state=step(null,{action:'set_mode',mode:'personal_upi',expectedRevision:0},admin,'enable');
 state=step(state,{action:'save_receiver',mode:'personal_upi',receiver:personal,expectedRevision:1},manager,'receiver');
 state=step(state,{action:'set_mode',mode:'disabled',expectedRevision:2},admin,'disable');
 assert.equal(state.public.active,false);
 state=step(state,{action:'set_mode',mode:'personal_upi',expectedRevision:3},admin,'reenable');
 assert.equal(state.public.active,false);assert.ok(state.history.receiver);assert.ok(state.receivers.personal_upi);
});
test('society account validation; public output never includes full account or private audit',()=>{
 const enabled=step(null,{action:'set_mode',mode:'society_account',expectedRevision:0});
 assert.throws(()=>step(enabled,{action:'save_receiver',mode:'society_account',expectedRevision:1,receiver:{...bank,confirmAccountNumber:'999999'}},manager),{status:400});
 const linked=step(enabled,{action:'save_receiver',mode:'society_account',expectedRevision:1,receiver:bank},manager,'bank');
 const output=publicPaymentSetup(linked);assert.equal(output.accountLast4,'7890');assert.equal(output.verification,'manual');
 assert.ok(!JSON.stringify(output).includes('1234567890'));assert.equal(output.history,undefined);
 assert.equal(linked.receivers.society_account.confirmAccountNumber,undefined);
});
test('stale revisions and disabled accounts are rejected',()=>{
 const enabled=step(null,{action:'set_mode',mode:'personal_upi',expectedRevision:0});
 assert.throws(()=>step(enabled,{action:'save_receiver',mode:'personal_upi',receiver:personal,expectedRevision:0},manager),{status:409});
 assert.equal(canConfigurePaymentSetup({...admin,active:false},'test'),false);
 assert.equal(canConfigurePaymentSetup(normalizeSetupUser({role:'building manager',assignedSocieties:{test:'true'}}),'test'),true);
});
function response(){return {code:0,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(value){this.body=value;return this}}}
test('API fails closed when secure activation is unavailable',async()=>{
 const handler=createPaymentSetupHandler(()=>{throw Object.assign(new Error('Secure payment setup is not activated yet.'),{status:503})});
 const res=response();await handler({method:'POST',headers:{},query:{}},res);assert.equal(res.code,503);assert.equal(res.headers['Cache-Control'],'no-store');
});
test('API independently denies missing tokens, resident writes and cross-society managers',async()=>{
 for(const [profile,token,expected] of [[manager,null,401],[manager,'token',403],[{role:'resident',societyIds:['test']},'token',403],[{role:'manager',societyIds:['other']},'token',403]]){
  let writes=0;const handler=createPaymentSetupHandler(()=>({auth:{verifyIdToken:async()=>({uid:'user'})},db:{ref:()=>({get:async()=>({val:()=>profile}),transaction:async callback=>{const next=callback(null);if(next){writes++;return {committed:true,snapshot:{val:()=>next}}}return {committed:false}}})}}));
  const res=response();await handler({method:'POST',headers:{authorization:token?'Bearer token':''},query:{societyId:'test'},body:{action:'set_mode',mode:'society_account',expectedRevision:0}},res);
  assert.equal(res.code,expected);assert.equal(writes,0);
 }
});
test('revoked personal receiver is not exposed to residents',async()=>{
 let setup=step(null,{action:'set_mode',mode:'personal_upi',expectedRevision:0},admin,'enable');setup=step(setup,{action:'save_receiver',mode:'personal_upi',receiver:personal,expectedRevision:1},manager,'link');
 const db={ref:path=>({get:async()=>({val:()=>path.endsWith('/paymentSetup')?setup:path==='users/resident'?{role:'resident',societyIds:['test']}:{role:'manager',societyIds:['other']}})})};
 const handler=createPaymentSetupHandler(()=>({auth:{verifyIdToken:async()=>({uid:'resident'})},db}));const res=response();
 await handler({method:'GET',headers:{authorization:'Bearer token'},query:{societyId:'test',view:'public'}},res);assert.equal(res.code,200);assert.equal(res.body.public.active,false);assert.equal(res.body.public.upiId,undefined);
});
test('API writes only receiving configuration, retaining revision and public masking',async()=>{
 let state=null;const paths=[];let profile=admin;
 const db={ref:path=>({get:async()=>({val:()=>path.startsWith('users/')?profile:state}),transaction:async callback=>{
  paths.push(path);const next=callback(state);if(next===undefined)return {committed:false};state=next;return {committed:true,snapshot:{val:()=>state}};
 }})};
 const handler=createPaymentSetupHandler(()=>({auth:{verifyIdToken:async()=>({uid:profile.uid})},db}));
 const request=async body=>{const res=response();await handler({method:'POST',headers:{authorization:'Bearer token'},query:{societyId:'test'},body},res);return res};
 assert.equal((await request({action:'set_mode',mode:'society_account',expectedRevision:0})).code,200);
 profile=manager;const saved=await request({action:'save_receiver',mode:'society_account',expectedRevision:1,receiver:bank});
 assert.equal(saved.code,200);assert.equal(saved.body.public.accountLast4,'7890');
 assert.deepEqual(paths,['societies/test/paymentSetup','societies/test/paymentSetup']);
 assert.equal(state.revision,2);assert.equal(state.payments,undefined);assert.equal(state.expenses,undefined);
 assert.ok(!JSON.stringify(saved.body).includes('1234567890'));
});
test('API boots under Vercel module restrictions and stays closed without activation',async()=>{
 const {execFileSync}=await import('node:child_process');
 const output=execFileSync(process.execPath,['--no-experimental-require-module','--input-type=module','-e',`import handler from './api/payment-setup.js';const res={setHeader(){},status(n){this.n=n;return this},json(){console.log(this.n)}};await handler({method:'GET',headers:{},query:{}},res);`],{encoding:'utf8',env:{...process.env,PAYMENT_SETUP_RULES_VERIFIED:'false'}});
 assert.equal(output.trim(),'503');
});
test('JWKS compatibility pin preserves RSA public-key conversion and signature rejection',async()=>{
 const {generateKeyPairSync,sign,verify}=await import('node:crypto');
 const {default:jwksRsa}=await import('jwks-rsa');
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),kid:'unit-test-key',alg:'RS256',use:'sig'};
 const client=new jwksRsa.JwksClient({jwksUri:'https://invalid.example/jwks',getKeysInterceptor:async()=>[jwk]});
 const key=await client.getSigningKey('unit-test-key');
 const payload=Buffer.from('test payload');const signature=sign('RSA-SHA256',payload,privateKey);
 assert.equal(verify('RSA-SHA256',payload,key.getPublicKey(),signature),true);
 assert.equal(verify('RSA-SHA256',Buffer.from('changed payload'),key.getPublicKey(),signature),false);
});
