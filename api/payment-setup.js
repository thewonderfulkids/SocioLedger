import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { randomUUID } from 'node:crypto';
import { canConfigurePaymentSetup, normalizeSetupUser, paymentSetupTransition, publicPaymentSetup } from '../lib/payment-setup.js';

function services() {
  // Set this only after reviewing and testing the routes-only database rules.
  if (process.env.PAYMENT_SETUP_RULES_VERIFIED !== 'true' || !process.env.FIREBASE_ADMIN_CREDENTIALS_JSON) {
    throw Object.assign(new Error('Secure payment setup is not activated yet.'), { status: 503 });
  }
  const credentials = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS_JSON);
  if (credentials.project_id !== 'socioledger-8e2f6') throw new Error('Wrong Firebase project.');
  const app = getApps().find(a => a.name === 'payment-setup') || initializeApp({
    credential: cert(credentials), databaseURL: 'https://socioledger-8e2f6-default-rtdb.asia-southeast1.firebasedatabase.app',
  }, 'payment-setup');
  return { auth: getAuth(app), db: getDatabase(app) };
}
export function createPaymentSetupHandler(getServices = services) { return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const { auth, db } = getServices();
    const token = String(req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
    if (!token) return res.status(401).json({ error: 'Sign in again.' });
    let identity;
    try { identity = await auth.verifyIdToken(token, true); } catch { return res.status(401).json({ error: 'Sign in again.' }); }
    const body = req.method === 'POST' ? req.body : {};
    const societyId = String(req.query.societyId || body?.societyId || '');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(societyId)) return res.status(400).json({ error: 'Invalid society.' });
    const profile = (await db.ref(`users/${identity.uid}`).get()).val();
    const user = normalizeSetupUser({ ...profile, uid: identity.uid });
    const allowed = canConfigurePaymentSetup(user, societyId);
    // Public receiver information still requires a linked society membership.
    const member = user.active !== false && user.role === 'resident' && user.societyIds.includes(societyId);
    if (!allowed && !(req.method === 'GET' && req.query.view === 'public' && member)) return res.status(403).json({ error: 'Access denied.' });
    const reference = db.ref(`societies/${societyId}/paymentSetup`);
    if (req.method === 'GET') {
      const setup = (await reference.get()).val() || {};
      if (req.query.view === 'public') {
        let published = publicPaymentSetup(setup);
        if (published.active && published.mode === 'personal_upi') {
          const owner = setup.receivers.personal_upi.updatedBy;
          const ownerProfile = normalizeSetupUser((await db.ref(`users/${owner}`).get()).val() || {});
          if (!canConfigurePaymentSetup(ownerProfile, societyId)) published = { version: 1, mode: published.mode, active: false };
        }
        return res.status(200).json({ public: published });
      }
      const mode = setup.policy?.mode || 'disabled';
      const receiver = setup.receivers?.[mode];
      // Never return full bank account numbers or historical receiver snapshots.
      return res.status(200).json({ mode, revision: setup.revision || 0, public: publicPaymentSetup(setup),
        receiver: receiver ? { holderName: receiver.holderName, upiId: receiver.upiId, qrImage: receiver.qrImage || '', bankName: receiver.bankName || '', ifsc: receiver.ifsc || '', accountLast4: receiver.accountNumber?.slice(-4) || '' } : null });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Invalid request.' });
    const now = Date.now(); const eventId = randomUUID();
    let transitionError;
    const result = await reference.transaction(current => {
      try { transitionError = null; return paymentSetupTransition(current, body, user, societyId, { now, eventId }); }
      catch (error) { transitionError = error; return undefined; }
    }, undefined, false);
    if (!result.committed) throw transitionError || Object.assign(new Error('Reload and try again.'), { status: 409 });
    return res.status(200).json({ public: result.snapshot.val().public });
  } catch (error) {
    // No tokens, bank details, QR data or credential values in logs/responses.
    const status = error.status || 500;
    return res.status(status).json({ error: status === 500 ? 'Payment setup could not be saved.' : error.message });
  }
}; }
export default createPaymentSetupHandler();
