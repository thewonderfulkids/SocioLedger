export const PAYMENT_MODES = ['disabled', 'personal_upi', 'society_account'];
export const MODE_LABELS = { disabled: 'Not enabled', personal_upi: 'Personal UPI / QR', society_account: 'Society account' };
export function normalizeSetupUser(profile = {}) {
  let role = String(profile.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['admin','superadmin'].includes(role)) role = 'super_admin';
  if (['building_manager','buildingmanager'].includes(role)) role = 'manager';
  if (['flat_owner','flatowner'].includes(role)) role = 'resident';
  const ids = new Set();
  for (const value of [profile.societyIds,profile.societyId,profile.assignedSocietyId,profile.assignedSocieties,profile.societies,profile.buildingId]) {
    if (Array.isArray(value)) value.filter(Boolean).forEach(id=>ids.add(String(id)));
    else if (value && typeof value === 'object') Object.keys(value).filter(id=>[true,'true',1].includes(value[id])).forEach(id=>ids.add(id));
    else if (value) ids.add(String(value));
  }
  if (profile.flatIds && !Array.isArray(profile.flatIds)) Object.keys(profile.flatIds).forEach(id=>ids.add(id));
  return { ...profile, role, societyIds: [...ids] };
}
export function canConfigurePaymentSetup(user, societyId) {
  if (user?.active === false) return false;
  if (user?.role === 'super_admin') return true;
  if (user?.role !== 'manager') return false;
  const ids = user.societyIds;
  return user.societyId === societyId || (Array.isArray(ids) ? ids.includes(societyId) : ids?.[societyId] === true);
}
export function validateReceiver(mode, input = {}) {
  if (!PAYMENT_MODES.includes(mode) || mode === 'disabled') throw new Error('Super Admin must enable a receiving mode first.');
  const upiId = String(input.upiId || '').trim();
  const holderName = String(input.holderName || '').trim();
  if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(upiId)) throw new Error('Enter a valid receiving UPI ID.');
  if (holderName.length < 2 || holderName.length > 120) throw new Error('Enter the account holder name.');
  const qrImage = String(input.qrImage || '');
  if (qrImage && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(qrImage) || qrImage.length > 1250000)) throw new Error('Use a PNG, JPEG or WebP QR image under 900 KB.');
  const receiver = { mode, upiId, holderName, qrImage };
  if (mode === 'society_account') {
    const bankName = String(input.bankName || '').trim();
    const accountNumber = String(input.accountNumber || '').replace(/\s/g, '');
    const ifsc = String(input.ifsc || '').trim().toUpperCase();
    if (bankName.length < 2 || bankName.length > 100) throw new Error('Enter the bank name.');
    if (!/^\d{6,20}$/.test(accountNumber)) throw new Error('Enter a valid bank account number.');
    if (accountNumber !== String(input.confirmAccountNumber || '').replace(/\s/g, '')) throw new Error('Account numbers do not match.');
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new Error('Enter a valid IFSC.');
    Object.assign(receiver, { bankName, accountNumber, ifsc });
  }
  if (input.confirmed !== true) throw new Error('Confirm that these receiving details belong to the selected receiver.');
  return receiver;
}
export function publicPaymentSetup(setup = {}) {
  const mode = setup.policy?.mode || 'disabled';
  const receiver = setup.receivers?.[mode];
  if (mode === 'disabled' || !receiver || receiver.activationId !== setup.policy?.activationId) return { version: 1, mode, active: false };
  return { version: 1, mode, active: true, receiverId: receiver.id,
    holderName: receiver.holderName, upiId: receiver.upiId, qrImage: receiver.qrImage || '',
    bankName: receiver.bankName || '', accountLast4: receiver.accountNumber?.slice(-4) || '',
    verification: 'manual', updatedAt: receiver.updatedAt };
}
export function paymentSetupTransition(current, { action, mode, receiver, expectedRevision }, user, societyId, { now, eventId }) {
  if (!canConfigurePaymentSetup(user, societyId)) throw Object.assign(new Error('Access denied.'), { status: 403 });
  const setup = current || {};
  if (Number(expectedRevision) !== Number(setup.revision || 0)) throw Object.assign(new Error('Settings changed. Reload before saving.'), { status: 409 });
  let next = { ...setup, revision: Number(setup.revision || 0) + 1 };
  if (action === 'set_mode') {
    if (user.role !== 'super_admin') throw Object.assign(new Error('Only Super Admin can enable or change payment modes.'), { status: 403 });
    if (!PAYMENT_MODES.includes(mode)) throw new Error('Select a valid payment mode.');
    next.policy = { mode, activationId: eventId, updatedAt: now, updatedBy: user.uid };
  } else if (action === 'save_receiver') {
    const activeMode = setup.policy?.mode || 'disabled';
    if (mode !== activeMode || activeMode === 'disabled') throw Object.assign(new Error('This mode is not enabled for this society.'), { status: 403 });
    let details;
    try { details = validateReceiver(mode, receiver); } catch (error) { error.status = 400; throw error; }
    next.receivers = { ...setup.receivers, [mode]: { ...details, id: eventId, activationId: setup.policy.activationId, updatedAt: now, updatedBy: user.uid } };
  } else throw new Error('Unknown action.');
  next.history = { ...setup.history, [eventId]: { action, mode, at: now, by: user.uid,
    previousMode: setup.policy?.mode || 'disabled', previousReceiver: setup.receivers?.[mode] || null } };
  next.public = publicPaymentSetup(next);
  return next;
}
