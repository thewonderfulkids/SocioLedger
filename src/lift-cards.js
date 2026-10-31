export const LIFT_CARD_RATE = 200;

export function isLiftCardPaid(item = {}) {
  // Legacy lift-card records were created only after money was received.
  // Treat missing paymentStatus as paid for backward compatibility.
  return item.type === 'lift_card' && item.paymentStatus !== 'unpaid';
}

export function liftCardDueForFlat(incomes = [], flat = {}) {
  const flatId = String(flat?.id || '');
  const flatNo = String(flat?.flatNo || '');
  return incomes.reduce((sum, item) => {
    if (item?.type !== 'lift_card' || item?.paymentStatus !== 'unpaid') return sum;
    const matches = (flatId && String(item.flatId || '') === flatId) || (flatNo && String(item.flatNo || '') === flatNo);
    return matches ? sum + (Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0) : sum;
  }, 0);
}

// Display-only aggregation. Maintenance advance never pays card charges implicitly.
export function withFacilityDues(maintenance, incomes, flat) {
  const facilityDue = liftCardDueForFlat(incomes, flat);
  const maintenanceNetPayable = Number(maintenance.netPayable || 0);
  return { ...maintenance, maintenanceNetPayable, facilityDue, netPayable: maintenanceNetPayable + facilityDue };
}

export function createLiftCardIncome(form, flats, { id, uid, name, now }) {
  const flat = flats.find(item => item.id === form.flatId);
  if (!flat) throw new Error('Select a valid flat.');
  const quantity = Number(form.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Card count must be between 1 and 100.');
  if (!['additional', 'replacement'].includes(form.reason)) throw new Error('Select the issue reason.');
  const date = String(form.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw new Error('Enter a valid issue date.');
  const paymentStatus = form.paymentStatus === 'unpaid' ? 'unpaid' : 'paid';
  const mode = paymentStatus === 'paid' ? String(form.mode || '') : '';
  if (paymentStatus === 'paid' && !['Cash','UPI','Bank Transfer'].includes(mode)) throw new Error('Select a payment mode.');
  if (!uid || !id) throw new Error('Sign in again before saving.');
  return { id, type:'lift_card', category:'Lift Card Charges', flatId:flat.id, flatNo:String(flat.flatNo), quantity, unitRate:LIFT_CARD_RATE, amount:quantity*LIFT_CARD_RATE, reason:form.reason, date, mode, paymentStatus, paidAt:paymentStatus==='paid'?now:null, note:String(form.note||'').trim().slice(0,500), nonRefundable:true, createdBy:name||uid, createdByUid:uid, createdAt:now };
}

export function incomeTotal(incomes = []) {
  return incomes.reduce((sum,item)=>sum + (item?.type === 'lift_card' && item?.paymentStatus === 'unpaid' ? 0 : (Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0)),0);
}

// Retry after an uncertain network response must never overwrite or duplicate a receipt.
export async function saveIncomeOnce(reference, record, transaction) {
  const result = await transaction(reference, current => current === null ? record : undefined, { applyLocally:false });
  if (!result.committed) {
    const existing = result.snapshot.val();
    if (!existing || Object.keys(existing).length !== Object.keys(record).length || Object.keys(record).some(key=>existing[key] !== record[key])) throw new Error('Receipt conflict. Reload before retrying.');
  }
}
