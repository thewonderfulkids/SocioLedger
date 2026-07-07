# SocioLedger Navigation Click Fix

## Issue
Mobile/desktop sidebar buttons were visually clicking but not opening tabs because the new mobile navigation polish referenced `openTab(...)` without defining it.

## Fix
- Added a production-safe `openTab(tabName)` handler inside `App.jsx`.
- Handler updates `activeTab`, closes mobile slide-in navigation, and scrolls page to top.
- Removed duplicate `Payment Setup` text in sidebar.
- No Firebase, accounting, role, or database logic changed.

## Verification
- `npm run build` passed.
- Checked navigation handler wiring for Dashboard, Flats, Rates, Payments, Payment Status, Expenses, Reports, Ledger, Payment Setup, Societies, Managers.
