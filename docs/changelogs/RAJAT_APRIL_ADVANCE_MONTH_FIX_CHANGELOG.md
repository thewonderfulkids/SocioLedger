# Rajat April Advance Month Fix

## Issue
Rajat Malik / Flat 201 ka April 2026 combined legacy payment entry `-OrwmuwfCdwtA2pULu1c` amount `₹5800` app me full wallet surplus ki tarah interpret ho raha tha. Isse ₹1000 surplus ban raha tha aur app ₹800 May me + ₹200 June me adjust kar raha tha.

## Confirmed Business Meaning
- Rajat ne April 2026 me ₹1000 diye.
- ₹800 April maintenance me consume hona chahiye.
- Sirf ₹200 May 2026 ke liye advance jaana chahiye.
- June 2026 me Rajat ka ye ₹200 advance continue/consume nahi hona chahiye.

## Fix
- Added `getEffectivePaymentAmount(payment, flat, data)`.
- Rajat / Flat 201 ke specific legacy combined April entry ke liye effective ledger amount `₹5800 - April charge ₹800 = ₹5000` kiya.
- Generic advance wallet rule unchanged rakha gaya for all normal payments.
- No Firebase DB mutation.
- No rules/security/refactor changes.

## Verification
- `npm run build` passed.
- Payment delete hotfix and advance wallet logic retained.
