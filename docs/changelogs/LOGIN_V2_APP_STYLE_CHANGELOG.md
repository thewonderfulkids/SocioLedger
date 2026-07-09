# SocioLedger Login V2 App Style Hotfix

## Scope
- Rebuilt only the logged-out login screen UI.
- No Firebase, accounting, resident, manager, advance, payment, ledger, or database logic changed.

## Changes
- Replaced previous desktop-like split login layout with true mobile-first app screen.
- Added dark navy/teal SocioLedger branded background.
- Added centered logo + SocioLedger title + Smart Society Management subtitle.
- Added glass/neo login card inspired by the approved app-style reference.
- Added icon-style mobile number and password inputs.
- Kept mobile number + password login flow intact.
- Kept password reset request flow intact.
- Added single-screen fit rules for small mobile heights.
- Added responsive desktop behavior with phone-sized app container.

## Verification
- `npm ci` completed.
- `npm run build` completed successfully.

## Notes
- Vite bundle size warning existed as a non-blocking production warning because App.jsx is still a single large file. Refactor intentionally not done in this sprint.
