# SocioLedger Rajat Advance Hardcode Hotfix

## Purpose
Temporary production-safe hardcode for Rajat Malik / Flat 201 legacy advance display.

## Issue
April legacy payment data can make the UI treat the full excess amount as advance. For Rajat / Flat 201, April 2026 payment was ₹1000, out of which ₹800 was April maintenance and only ₹200 should carry forward as advance.

## Change
- Added `getLegacyAdvanceOverride(flat, computedAdvance)` in `src/App.jsx`.
- For Flat 201 / Rajat Malik / phone 8950701015, visible advance is forced to ₹200.
- Net Payable uses the corrected visible advance.
- No Firebase rules changes.
- No App.jsx split/refactor.
- No database mutation.

## Build Verification
- `npm run build` passed.

## Regression Notes
- Super Admin / Manager / Resident role code untouched.
- Payment delete option untouched.
- Society data listeners untouched.
- Only Rajat Flat 201 advance display calculation changed.

## Important
This is a temporary hardcode. In the next accounting sprint, replace this with a proper payment allocation model: payment principal, month charge consumed, opening due consumed, and carry-forward advance should be stored separately.
