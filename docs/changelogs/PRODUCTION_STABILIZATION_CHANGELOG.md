# SocioLedger Production Stabilization Sprint

## Scope
Production-safe stabilization only. App.jsx is kept as a single file as requested. Firebase RTDB rules were not changed.

## Changes Applied

1. Role compatibility
- Added role normalization for both old and new role values:
  - `Super Admin` / `super_admin`
  - `Building Manager` / `manager`
  - `Resident` / `resident`
- Super Admin, Manager, Resident permission checks now use normalized roles.
- Manager list filtering remains compatible with normalized manager role.

2. Manager dashboard data access
- Fixed society access check to support both `societyIds` array format and boolean-map format.
- Manager assigned society selection now works with mixed legacy/current DB formats.
- Manager reads complete assigned-society flats, payments, expenses, rates, payment settings and subscription data.

3. Resident dashboard summary
- Resident Firebase listeners now keep full society-level flats and payments in memory.
- Resident dashboard summary now calculates society-level total flats, active flats, collection, dues, expenses and net balance.
- Resident expenses remain visible at society level.
- Payment Status page now uses all active society flats and all society payments.

4. Resident privacy / own-flat actions
- Ledger and Pay Now remain restricted to the resident's own linked flat only.
- Own-flat matching is backward compatible using:
  - `flatIds/{societyId}/{flatId}` map
  - legacy `flatId`
  - `residentUid`
  - matching resident phone and flat phone

5. Flat/resident linking forward compatibility
- Saving a flat now writes `residentUid` to the flat record.
- Resident user profile now keeps both legacy `flatId` and new `flatIds/{societyId}/{flatId}` mapping.
- New payments store residentUid fallback from flat phone if existing flat does not already have residentUid.

## Build Verification
- Command run: `npm run build`
- Result: Passed
- Output folder: `dist/`

## Regression Check Report
Checked from code flow and production build:
- Super Admin role compatibility retained.
- Super Admin society dropdown/list flow retained.
- Manager role compatibility retained for `Building Manager` and `manager`.
- Manager assigned society access fixed for array and map `societyIds`.
- Resident role compatibility retained for `Resident` and `resident`.
- Resident dashboard uses society-level flats/payments instead of only own payments.
- Resident Payment Status uses society-level rows.
- Resident Ledger uses own linked flat only.
- Resident Pay button uses own linked flat only.
- Expenses remain visible to residents, add/delete remains restricted by role.
- Firebase RTDB rules unchanged.
- App.jsx not split/refactored.

## Notes
- `npm install --include=optional` was run once in the sandbox because the uploaded ZIP's node_modules was missing the Vite/Rolldown native optional binding required for Linux build verification.
- `npm run lint` was also checked, but existing ESLint configuration reports pre-existing project-wide issues such as script `process` globals and React hook style warnings. These were not changed because the sprint scope was production stabilization and the production build passed.

## Advance / Legacy Payment Pull Hotfix
- Added backward-compatible payment amount detection for old RTDB records: `amount`, `paidAmount`, `paymentAmount`, `receivedAmount`, `amountReceived`, `collectedAmount`, `advanceAmount`, `totalAmount`.
- Added robust flat matching for old records by `flatId`, `flatID`, `flatKey`, `unitId`, `residentFlatId`, `flatNo`, `flatNumber`, `unitNo`, phone/mobile, and resident UID fields.
- Ledger now includes existing flat-level advance fields: `advance`, `openingAdvance`, `advanceBalance`.
- Month report now includes payments saved by either payment month fields or payment date fields.
- Build verification: `npm run build` passed after this hotfix.

---

## Payment Delete Hotfix - 2026-07-07

### Reason
- Production database export review showed payments are stored under society-scoped `societies/<societyId>/payments` and legacy/default society records are also mirrored from older root data.
- If a wrong payment is entered, the UI had no safe delete action from the Payment Entry table.

### Changes
- Added Delete action in Payment Entry table for Super Admin / Manager users.
- Delete uses the existing selected society path: `societies/<selectedSocietyId>/payments/<paymentId>`.
- Added confirmation dialog with flat, amount, month and date before deletion.
- Added payment deletion audit log under `paymentDeletionLogs` before removing the payment record.
- Payment table now displays Date, Month, Flat, Amount, Mode, Note and Action.
- Flat display in Payment Entry now uses the same backward-compatible matching logic used by ledger/status, so old records with `flatId`, `flatNo`, phone or resident UID remain visible correctly.
- New payment entries now also store `flatNo` along with `flatId` for easier future recovery and backward compatibility.

### Build Verification
- `npm run build` completed successfully.

### Regression Check
- Existing auth, role, society selection and dashboard logic left unchanged.
- Existing payment aggregation helpers left unchanged.
- Existing resident restrictions left unchanged; residents still cannot access Payment Entry.
- Expense delete and flat delete flows left unchanged.
- Firebase rules not changed.
- App.jsx not split/refactored.
