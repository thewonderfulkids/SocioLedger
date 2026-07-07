# SocioLedger Universal Advance + Mobile Login Fit Hotfix

## Build
- Verified with `npm run build`.

## Advance accounting
- Made the advance wallet calculation universal for every flat/resident.
- Month-wise Payment Status now builds the ledger through the selected status month, not only the current month.
- Advance is consumed sequentially against future month dues until the selected month.
- Remaining Advance now means only the amount left after all visible/selected-month dues are adjusted.
- No Firebase DB mutation and no RTDB rules changes.

## Login UI
- Mobile login screen compressed into a single app-style viewport.
- Hidden the decorative building art and quick feature cards on mobile to avoid login button falling below the fold.
- Reduced mobile hero, input, reset, and footer spacing.
- Kept SocioLedger logo/theme and mobile-number/password login flow.

## Regression
- Build compile passed.
- Navigation/accounting/Firebase auth code paths were not refactored.
