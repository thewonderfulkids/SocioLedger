# SocioLedger Advance Consume Next Month Hotfix

## Issue fixed
- April excess payment was being shown as advance in every future month.
- Rajat Malik / Flat 201: April payment ₹1000 should clear April maintenance ₹800 and only ₹200 should adjust in May.
- Ashwini Saroha / Flat 203 had the same repeated-advance behaviour.

## Production-safe change
- Removed Rajat-specific visible advance hardcode.
- Added generic one-month carry-forward logic:
  1. Payment clears dues up to the payment/applied month.
  2. Excess amount is applied only to the immediate next month.
  3. The same excess is not shown as advance in later months after it is consumed.
- Monthly status now uses the ledger entry's already-adjusted paid/due values, so advance is not added again on every month.

## Expected result
- Rajat 201: April ₹1000 = ₹800 April maintenance + ₹200 May adjustment.
- June onward Rajat advance should not continue as ₹200.
- Ashwini Saroha / Flat 203 follows the same rule.
- No Firebase rules change.
- No App.jsx split/refactor.
- Existing payment delete hotfix remains included.

## Verification
- npm ci completed.
- npm run build completed successfully.
