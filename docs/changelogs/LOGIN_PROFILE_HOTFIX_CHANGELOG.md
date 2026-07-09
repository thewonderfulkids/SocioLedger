# SocioLedger Login + Resident Profile Hotfix

## Build
- Verified with `npm run build`.
- No Firebase RTDB rules changed.
- No accounting / advance wallet logic changed.

## Changes
1. Login screen redesigned with SocioLedger logo-matching navy + teal + blue premium theme.
2. Login remains mobile number + password based.
3. Added password reset request option on login screen.
   - Stores request under `passwordResetRequests` in Realtime Database.
   - Also attempts Firebase reset email against the internal phone email mapping for compatibility.
4. Added `My Profile` navigation for resident / flat owner role.
5. Resident profile page shows:
   - Owner name
   - Flat number
   - Login mobile
   - Society name
   - Gross due
   - Advance
   - Net payable
   - Total paid
   - Current month status
6. Mobile login responsive polish added.
7. No App.jsx file split/refactor done.

## Regression Check
- Production build passed.
- Existing navigation retained.
- Existing dashboard, ledger, payment status, payment setup and accounting calculation untouched.
- Mobile nav remains hideable.
