# SocioLedger Advance Carry-Forward Hotfix

## Issue fixed
- April me extra/advance payment May me separately visible nahi ho raha tha.
- App advance ko `Total Due` se silently minus karke net value ko `Total Due` label me dikha raha tha.
- Example: Rajat ka April ka extra amount May me `Advance` column/card me dikhna chahiye tha, lekin total due 200 kam dikh raha tha.

## Changes made
1. Payment allocation ko month-aware banaya:
   - Payment jis month me collect/forMonth hai, wahi tak dues clear karega.
   - Us month ke baad ka extra amount advance carry-forward me visible rahega.
   - Future month dues ko silently auto-adjust nahi karega.

2. Ledger output me `netPayable` add kiya:
   - `Gross Total Due` = actual dues before advance adjustment.
   - `Advance` = carry-forward extra amount.
   - `Net Payable` = Gross Total Due - Advance.

3. Payment Status page updated:
   - `Total Due` label ko `Gross Total Due` kiya.
   - `Advance Carry Forward` summary card add kiya.
   - `Net Payable` summary card + table column add kiya.
   - Pay button now checks `netPayable > 0`.

4. Ledger and Pay Now display updated:
   - Ledger cards now show Gross Total Due, Advance, Net Payable, Total Paid.
   - Pay Now modal now uses Net Payable amount instead of gross due.

5. CSV export updated:
   - Added Gross Total Due, Advance, Net Payable columns.

## Files changed
- `src/App.jsx`

## Build verification
- `npm install`
- `npm run build` ✅

## Regression check
- Existing auth/role flow untouched.
- Firebase RTDB rules untouched.
- App.jsx not split/refactored.
- Super Admin / Manager payment delete flow retained.
- Resident visibility rules retained.
- Payment status, ledger, Pay Now and CSV checked for compile safety.

## Note
- Uploaded DB export confirms Rajat Malik exists as Flat 201 and his payment entry is stored under `societies/default_society/payments` with amount/date fields. This patch keeps that existing data shape backward compatible.
