export const LIFT_CARD_RATE = 200;
export function createLiftCardIncome(form, flats, { id, uid, name, now }) {
  const flat = flats.find(item => item.id === form.flatId);
  if (!flat) throw new Error('Select a valid flat.');
  const quantity = Number(form.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Card count must be between 1 and 100.');
  if (!['additional', 'replacement'].includes(form.reason)) throw new Error('Select the issue reason.');
  const date = String(form.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw new Error('Enter a valid receipt date.');
  if (!['Cash','UPI','Bank Transfer'].includes(form.mode)) throw new Error('Select a payment mode.');
  if (!uid || !id) throw new Error('Sign in again before saving.');
  return { id, type:'lift_card', category:'Lift Card Charges', flatId:flat.id, flatNo:String(flat.flatNo), quantity, unitRate:LIFT_CARD_RATE, amount:quantity*LIFT_CARD_RATE, reason:form.reason, date, mode:form.mode, note:String(form.note||'').trim().slice(0,500), nonRefundable:true, createdBy:name||uid, createdByUid:uid, createdAt:now };
}
export function incomeTotal(incomes = []) { return incomes.reduce((sum,item)=>sum + (Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0),0); }
// Retry after an uncertain network response must never overwrite or duplicate a receipt.
export async function saveIncomeOnce(reference, record, transaction) {
  const result = await transaction(reference, current => current === null ? record : undefined, { applyLocally:false });
  if (!result.committed) {
    const existing = result.snapshot.val();
    if (!existing || Object.keys(existing).length !== Object.keys(record).length || Object.keys(record).some(key=>existing[key] !== record[key])) throw new Error('Receipt conflict. Reload before retrying.');
  }
}
