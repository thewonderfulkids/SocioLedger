import { paymentSetupRequest } from './payment-setup-client.js';
import { useEffect, useRef, useState } from 'react';
import { MODE_LABELS } from '../lib/payment-setup.js';
const empty = { holderName:'', upiId:'', qrImage:'', bankName:'', accountNumber:'', confirmAccountNumber:'', ifsc:'', confirmed:false };
export default function PaymentSetupPanel({ auth, societyId, isSuperAdmin, onPublicChange }) {
  const [settings,setSettings] = useState(null);
  const [form,setForm] = useState(empty);
  const [mode,setMode] = useState('disabled');
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(()=>{ alive.current=true; return()=>{alive.current=false}; },[]);
  useEffect(()=>{
    let cancelled=false;
    paymentSetupRequest(auth,societyId).then(result=>{
      if(cancelled)return;
      setSettings(result);setMode(result.mode);setForm({...empty,...result.receiver});setError('');
    }).catch(e=>{if(!cancelled)setError(e.message)});
    return()=>{cancelled=true};
  },[auth,societyId]);
  async function save(action) {
    setBusy(true);setError('');setMessage('');
    try {
      const result=await paymentSetupRequest(auth,societyId,{ action, mode:action==='set_mode'?mode:settings.mode, receiver:form, expectedRevision:settings.revision });
      if (!alive.current) return;
      onPublicChange(result.public);
      const updated=await paymentSetupRequest(auth,societyId);
      if (!alive.current) return;
      setSettings(updated);setMode(updated.mode);setForm({...empty,...updated.receiver});
      setMessage(action==='set_mode'?'Society payment mode updated. Link the receiver before residents can pay.':'Receiving details saved. Payments require manual verification.');
    }catch(e){if(alive.current)setError(e.message)}finally{if(alive.current)setBusy(false)}
  }
  function field(name,value){setForm(p=>({...p,[name]:value,confirmed:false}))}
  function upload(event){
    const file=event.target.files?.[0];if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>900*1024){setError('Use a PNG, JPEG or WebP QR image under 900 KB.');return}
    const reader=new FileReader();reader.onload=()=>field('qrImage',reader.result);reader.readAsDataURL(file);
  }
  return <>
    <div className="pageHeader"><div><h1>Payment Setup</h1><p>Society-specific receiving options. Maintenance balances remain unchanged.</p></div></div>
    {error&&<div className="paymentSetupNotice" role="alert">{error}{!settings&&<p>Receiving settings stay locked until secure setup is activated by the administrator.</p>}</div>}
    {message&&<div className="paymentSetupNotice" role="status">{message}</div>}
    <div className="settingsGrid">
      <section className="settingsCard"><h2>Receiving mode</h2>
        <p>Only Super Admin can enable, disable or switch this society’s payment mode.</p>
        {isSuperAdmin?<fieldset disabled={busy||!settings} className="paymentModeChoices"><legend>Enable for this society</legend>
          {Object.entries(MODE_LABELS).map(([value,label])=><label key={value}><input type="radio" name="paymentMode" value={value} checked={mode===value} onChange={()=>setMode(value)}/>{label}</label>)}
          <button onClick={()=>save('set_mode')}>Apply society payment mode</button>
        </fieldset>:<p><strong>{MODE_LABELS[settings?.mode||'disabled']}</strong></p>}
        <p className="hintText">Changing mode requires the receiver to be linked again. Historical settings are retained privately for audit.</p>
      </section>
      <section className="settingsCard"><h2>Link receiving details</h2>
        {!settings||settings.mode==='disabled'?<p>Ask Super Admin to enable Personal UPI / QR or Society Account for this society.</p>:<fieldset disabled={busy} className="receiverFields">
          <label>Account holder / receiver name<input aria-label="Receiver name" value={form.holderName} onChange={e=>field('holderName',e.target.value)} maxLength={120}/></label>
          <label>Receiving UPI ID<input aria-label="Receiving UPI ID" placeholder="name@bank" value={form.upiId} onChange={e=>field('upiId',e.target.value)}/></label>
          {settings.mode==='society_account'&&<>
            <label>Bank name<input value={form.bankName} onChange={e=>field('bankName',e.target.value)} maxLength={100}/></label>
            {form.accountLast4&&<p>Saved account ending {form.accountLast4}. Re-enter the full number to save changes.</p>}
            <label>Account number<input type="password" inputMode="numeric" autoComplete="off" value={form.accountNumber} onChange={e=>field('accountNumber',e.target.value)}/></label>
            <label>Confirm account number<input type="password" inputMode="numeric" autoComplete="off" value={form.confirmAccountNumber} onChange={e=>field('confirmAccountNumber',e.target.value)}/></label>
            <label>IFSC<input value={form.ifsc} maxLength={11} onChange={e=>field('ifsc',e.target.value.toUpperCase())}/></label>
          </>}
          <label>Receiving QR (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/></label>
          {form.qrImage&&<><img src={form.qrImage} alt="Receiving QR preview" className="qrPreview"/><button type="button" onClick={()=>field('qrImage','')}>Remove QR</button></>}
          <label className="receiverConfirmation"><input type="checkbox" checked={form.confirmed} onChange={e=>setForm(p=>({...p,confirmed:e.target.checked}))}/>I confirm these details belong to the selected receiver. The name, UPI and QR will be shown to residents for payment.</label>
          <button disabled={!form.confirmed||busy} onClick={()=>save('save_receiver')}>{busy?'Saving…':'Save receiving details'}</button>
          <p className="hintText">This registers receiving details. It does not verify bank ownership or enable automatic payment confirmation. Never upload a QR for a different account.</p>
        </fieldset>}
      </section>
    </div>
  </>;
}
