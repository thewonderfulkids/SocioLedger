# SocioLedger Login App-Style Hotfix

## Summary
Converted the login screen from a split desktop-style layout into a single app-like landing/login screen inspired by the StreetPaw Rescue visual style, using SocioLedger's navy, teal and blue brand direction.

## Changes
- Replaced split hero + login layout with a single mobile-first app screen.
- Added app-style top status/header area.
- Added centered SocioLedger brand lockup.
- Added large premium hero text: “Manage Society Payments Better.”
- Added society/building illustration using CSS only, no new heavy image dependency.
- Moved login form into a rounded bottom action card.
- Converted password reset section into a compact expandable panel.
- Added app-style feature chips and Powered by WinFly footer.
- Improved mobile fit: no awkward two-column split on small screens.
- Preserved mobile number + password login flow.
- Preserved password reset request logic.
- No Firebase rules, accounting logic, dashboard logic or navigation logic changed.

## Build Verification
- npm run build: PASS

## Regression Check
- Login handler unchanged.
- Phone sanitization unchanged.
- Password field unchanged.
- Reset request handler unchanged.
- Auth-ready loading screen unchanged.
- Existing dashboard/navigation/accounting code untouched.
