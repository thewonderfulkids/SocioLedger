# SocioLedger Advance Wallet Hotfix

## Problem
Advance amount was either limited to the next month or was subtracted again from total due. This made cases like Rajat Malik / Flat 201 incorrect when extra payment should cover multiple future months sequentially.

## Fix
- Reworked ledger calculation in `src/App.jsx`.
- Payment now clears dues up to the payment month first.
- Extra amount is treated as an advance wallet.
- Advance wallet is consumed across future months in order until exhausted.
- Partial future-month adjustment is now supported.
- Remaining advance is shown only if amount is still left after all visible months are covered.
- Removed double subtraction from `netPayable`.
- Added per-month `advanceAdjusted` tracking internally for safer reporting.

## Example
If due is 4 months × ₹800 = ₹3,200 and payment is ₹5,000, then extra ₹1,800 is applied as:
- next month: ₹800 adjusted
- following month: ₹800 adjusted
- following month: ₹200 partial adjusted
- no repeated false advance after balance is exhausted

## Verification
- `npm run build` passes.
- Payment delete hotfix remains included.
- App.jsx was not split or refactored.
