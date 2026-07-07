# Simi/Saad Advance Date Fix Hotfix

## Issue
Simi/Saad ledger was failing the same advance/payment allocation logic because one legacy carried-forward payment had an invalid saved date (`2026-31-31`). The old month extraction sliced it as `2026-31`, so the wallet engine treated the payment as covering future months incorrectly.

## Fix
- Added safe month normalization for payment dates and month fields.
- Invalid carried-forward dates are anchored to the April 2026 production ledger close month.
- This prevents legacy carried-forward payments from consuming May/June incorrectly.
- Rajat/Ashwini advance wallet logic remains unchanged.
- No Firebase rules or DB mutation done.

## Build Verification
- `npm run build` passed.

## Regression Check
- Login app-style UI preserved.
- Mobile navigation preserved.
- Payment delete option preserved.
- Advance wallet calculation preserved.
- Simi/Saad invalid date no longer creates future-month adjustment.
