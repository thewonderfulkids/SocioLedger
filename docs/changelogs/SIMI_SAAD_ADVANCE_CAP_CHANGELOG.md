# SocioLedger - Simi/Saad Advance Coverage Hotfix

## Issue fixed
- Simi/Saad paid a whole-month advance package for April, May, June and July.
- The remaining advance was incorrectly rolling forward and getting consumed in August.

## Accounting fix
- Universal advance wallet logic now caps whole-month advance packages to their natural coverage window.
- Example: ₹3200 paid in Apr at ₹800/month covers Apr, May, Jun and Jul only.
- The same package will not continue into Aug if any earlier month was already covered by legacy carried-forward data.
- Partial overpayments still work as before, e.g. ₹1000 against ₹800 creates ₹200 for the next month.

## Scope
- Firebase data was not mutated.
- Login UI and navigation were not changed.
- Payment delete hotfix remains included.

## Build verification
- npm ci
- npm run build
- Result: Passed
