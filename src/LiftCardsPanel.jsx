import { useRef, useState } from 'react';
import { push, ref, runTransaction, update } from 'firebase/database';
import { createLiftCardIncome, incomeTotal, liftCardDueForFlat, LIFT_CARD_RATE, saveIncomeOnce } from './lift-cards.js';
const today = () => new Date().toLocaleDateString('en-CA');
export default function LiftCardsPanel({ db, societyId, flats, incomes, user, uid, loadError }) {
  const [form,setForm] = useState({flatId:'',quantity:'1',reason:'additional',date:today(),paymentStatus:'paid',mode:'Cash',note:''});
  const [saving,setSaving] = useState(false);
  const [pending,setPending] = useState(false);
  const [message,setMessage] = useState('');
  const lock = useRef(false);
  const attempt = useRef(null);
  const records = incomes.filter(item=>item.type==='lift_card');
  const unpaidTotal = records.reduce((sum,r)=>sum+(r.paymentStatus==='unpaid'?Number(r.amount||0):0),0);
  const change = (key,value) => { if(!attempt.current) setForm(p=>({...p,[key]:value})); };
  async function save() {
    if(lock.current || loadError)return;
    lock.current=true;setSaving(true);setMessage('');
    try {
      if(!attempt.current) {
        const id=push(ref(db,`societies/${societyId}/otherIncome`)).key;
        attempt.current=createLiftCardIncome(form,flats,{id,uid,name:user?.name,now:Date.now()});
        setPending(true);
      }
      const record=attempt.current;
      await saveIncomeOnce(ref(db,`societies/${societyId}/otherIncome/${record.id}`),record,runTransaction);
      attempt.current=null;setPending(false);setForm(p=>({...p,quantity:'1',note:''}));
      setMessage(record.paymentStatus==='unpaid'?'Card issued. ₹'+record.amount+' is pending and included in this flat’s card due.':'Receipt saved. Maintenance due and advance are unchanged.');
    } catch(e) { setMessage(`${e.message || 'Save failed.'}${attempt.current ? ' Retry to confirm the same record; fields stay locked to prevent duplicates.' : ''}`); }
    finally {lock.current=false;setSaving(false)}
  }
  async function markPaid(record) {
    if(loadError || record.paymentStatus!=='unpaid') return;
    const answer=window.prompt('Payment mode: Cash, UPI, or Bank Transfer','Cash');
    if(answer===null)return;
    const mode=String(answer).trim();
    if(!['Cash','UPI','Bank Transfer'].includes(mode))return setMessage('Use Cash, UPI, or Bank Transfer as payment mode.');
    try {
      // Event handler: settlement time is captured only after the user marks a card paid.
      // eslint-disable-next-line react-hooks/purity
      await update(ref(db,`societies/${societyId}/otherIncome/${record.id}`),{paymentStatus:'paid',mode,paidAt:Date.now(),paidBy:user?.name||uid,paidByUid:uid});
      setMessage(`₹${record.amount} card due for Flat ${record.flatNo} marked paid.`);
    } catch(e) { setMessage(e.message||'Could not mark card due paid.'); }
  }
  return <>
    <div className="pageHeader"><div><h1>Lift Cards / Other Income</h1><p>₹200 per additional or replacement card · non-refundable</p></div></div>
    <div className="paymentSetupNotice">A card can be issued as Paid or Unpaid. Unpaid card charges stay outstanding until marked paid. Card purchases go in Expenses → Lift Card Purchase.</div>
    {loadError && <p role="alert" className="paymentSetupNotice">{loadError} Card records cannot be added until access is restored.</p>}
    <div className="cards"><div className="card success"><span>Lift Card Income Received</span><b>₹{incomeTotal(records).toLocaleString('en-IN')}</b></div><div className="card danger"><span>Lift Card Due</span><b>₹{unpaidTotal.toLocaleString('en-IN')}</b></div><div className="card"><span>Cards issued</span><b>{records.reduce((sum,r)=>sum+Number(r.quantity||0),0)}</b></div></div>
    <section className="settingsCard"><h2>Record card issue</h2>
      <fieldset disabled={saving||pending||!!loadError} className="receiverFields">
        <label>Flat<select value={form.flatId} onChange={e=>change('flatId',e.target.value)}><option value="">Select flat</option>{flats.map(flat=><option key={flat.id} value={flat.id}>Flat {flat.flatNo} · {flat.ownerName}{liftCardDueForFlat(records,flat)>0?` · Card due ₹${liftCardDueForFlat(records,flat)}`:''}</option>)}</select></label>
        <label>Card count<input type="number" min="1" max="100" step="1" value={form.quantity} onChange={e=>change('quantity',e.target.value)}/></label>
        <label>Reason<select value={form.reason} onChange={e=>change('reason',e.target.value)}><option value="additional">Additional card</option><option value="replacement">Lost / replacement card</option></select></label>
        <label>Issue date<input type="date" value={form.date} onChange={e=>change('date',e.target.value)}/></label>
        <label>Payment status<select value={form.paymentStatus} onChange={e=>change('paymentStatus',e.target.value)}><option value="paid">Paid</option><option value="unpaid">Unpaid / add to due</option></select></label>
        {form.paymentStatus==='paid'&&<label>Payment mode<select value={form.mode} onChange={e=>change('mode',e.target.value)}><option>Cash</option><option>UPI</option><option>Bank Transfer</option></select></label>}
        <label>Card reference / note<input maxLength={500} value={form.note} onChange={e=>change('note',e.target.value)}/></label>
      </fieldset>
      <p><strong>{form.paymentStatus==='unpaid'?'Amount due':'Amount received'}: ₹{Number.isInteger(Number(form.quantity))&&Number(form.quantity)>0?Number(form.quantity)*LIFT_CARD_RATE:0}</strong> · Non-refundable</p>
      <button disabled={saving||!!loadError} onClick={save}>{saving?'Saving…':pending?'Retry same record':'Save card issue'}</button>
      {message&&<p role="status">{message}</p>}
    </section>
    <div className="tableWrap"><table><thead><tr><th>Date</th><th>Flat</th><th>Cards</th><th>Reason</th><th>Amount</th><th>Status</th><th>Mode</th><th>Reference / note</th><th>Recorded by</th><th>Action</th></tr></thead><tbody>
      {records.map(r=><tr key={r.id}><td>{r.date}</td><td>Flat {r.flatNo}</td><td>{r.quantity}</td><td>{r.reason==='replacement'?'Lost / replacement':'Additional'}</td><td>₹{r.amount}</td><td>{r.paymentStatus==='unpaid'?'Unpaid':'Paid'}</td><td>{r.mode||'—'}</td><td>{r.note||'—'}</td><td>{r.createdBy}</td><td>{r.paymentStatus==='unpaid'?<button onClick={()=>markPaid(r)}>Mark paid</button>:'—'}</td></tr>)}
      {!records.length&&<tr><td colSpan={10}>No lift card records.</td></tr>}
    </tbody></table></div>
  </>;
}
