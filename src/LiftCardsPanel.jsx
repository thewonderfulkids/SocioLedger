import { useRef, useState } from 'react';
import { push, ref, runTransaction } from 'firebase/database';
import { createLiftCardIncome, incomeTotal, LIFT_CARD_RATE, saveIncomeOnce } from './lift-cards.js';
const today = () => new Date().toLocaleDateString('en-CA');
export default function LiftCardsPanel({ db, societyId, flats, incomes, user, uid, loadError }) {
  const [form,setForm] = useState({flatId:'',quantity:'1',reason:'additional',date:today(),mode:'Cash',note:''});
  const [saving,setSaving] = useState(false);
  const [pending,setPending] = useState(false);
  const [message,setMessage] = useState('');
  const lock = useRef(false);
  const attempt = useRef(null);
  const records = incomes.filter(item=>item.type==='lift_card');
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
      setMessage('Receipt saved. Maintenance due and advance are unchanged.');
    } catch(e) { setMessage(`${e.message || 'Save failed.'}${attempt.current ? ' Retry to confirm the same receipt; fields stay locked to prevent duplicates.' : ''}`); }
    finally {lock.current=false;setSaving(false)}
  }
  return <>
    <div className="pageHeader"><div><h1>Lift Cards / Other Income</h1><p>₹200 per additional or replacement card · non-refundable</p></div></div>
    <div className="paymentSetupNotice">Record only money actually received. Card purchases go in Expenses → Lift Card Purchase. These receipts do not settle maintenance dues.</div>
    {loadError && <p role="alert" className="paymentSetupNotice">{loadError} Receipts cannot be added until access is restored.</p>}
    <div className="cards"><div className="card success"><span>Lift Card Income</span><b>₹{incomeTotal(records).toLocaleString('en-IN')}</b></div><div className="card"><span>Cards issued</span><b>{records.reduce((sum,r)=>sum+Number(r.quantity||0),0)}</b></div></div>
    <section className="settingsCard"><h2>Record card issue & receipt</h2>
      <fieldset disabled={saving||pending||!!loadError} className="receiverFields">
        <label>Flat<select value={form.flatId} onChange={e=>change('flatId',e.target.value)}><option value="">Select flat</option>{flats.map(flat=><option key={flat.id} value={flat.id}>Flat {flat.flatNo} · {flat.ownerName}</option>)}</select></label>
        <label>Card count<input type="number" min="1" max="100" step="1" value={form.quantity} onChange={e=>change('quantity',e.target.value)}/></label>
        <label>Reason<select value={form.reason} onChange={e=>change('reason',e.target.value)}><option value="additional">Additional card</option><option value="replacement">Lost / replacement card</option></select></label>
        <label>Receipt / issue date<input type="date" value={form.date} onChange={e=>change('date',e.target.value)}/></label>
        <label>Payment mode<select value={form.mode} onChange={e=>change('mode',e.target.value)}><option>Cash</option><option>UPI</option><option>Bank Transfer</option></select></label>
        <label>Card reference / note<input maxLength={500} value={form.note} onChange={e=>change('note',e.target.value)}/></label>
      </fieldset>
      <p><strong>Amount received: ₹{Number.isInteger(Number(form.quantity))&&Number(form.quantity)>0?Number(form.quantity)*LIFT_CARD_RATE:0}</strong> · Non-refundable</p>
      <button disabled={saving||!!loadError} onClick={save}>{saving?'Saving…':pending?'Retry same receipt':'Save card issue & receipt'}</button>
      {message&&<p role="status">{message}</p>}
    </section>
    <div className="tableWrap"><table><thead><tr><th>Date</th><th>Flat</th><th>Cards</th><th>Reason</th><th>Income</th><th>Mode</th><th>Reference / note</th><th>Recorded by</th></tr></thead><tbody>
      {records.map(r=><tr key={r.id}><td>{r.date}</td><td>Flat {r.flatNo}</td><td>{r.quantity}</td><td>{r.reason==='replacement'?'Lost / replacement':'Additional'}</td><td>₹{r.amount}</td><td>{r.mode}</td><td>{r.note||'—'}</td><td>{r.createdBy}</td></tr>)}
      {!records.length&&<tr><td colSpan={8}>No lift card receipts recorded.</td></tr>}
    </tbody></table></div>
  </>;
}
