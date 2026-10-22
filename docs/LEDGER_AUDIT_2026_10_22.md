# Flat 403 accounting repair and read-only audit export

## Production evidence

Main and production initially served b7d0df08c907f7386a5b7b6873ca180e9aa1d4d6.
Production UI showed five active Flat 403 receipts, totalling 9800:

| Receipt date | Assigned month | Amount | Meaning |
| --- | --- | ---: | --- |
| 2026-31-31 | April 2026 after existing normalization | 4800 | Migration close for December 2025 through April 2026 |
| 2026-05-10 | May 2026 | 800 | Maintenance |
| 2026-06-29 | June 2026 | 1600 | June and July |
| 2026-08-20 | August 2026 | 1500 | August 800 and September 700 |
| 2026-10-06 | October 2026 | 1100 | September balance 100, October 800, advance 200 |

Rate history: December 2025 through March 2026 at 1000; April 2026 onward at 800. Opening due is zero. Total charges through October: 9600. The deleted July receipt is absent from the active receipts and is not used in the calculation. Deletion-log contents were not independently retrieved.

## Reproduced failure

The malformed date yields NaN in the payment sort comparator. The UI's newest-created-first input order consequently allows the October receipt to allocate before the migration receipt. Existing normalization anchors that migration receipt to April; generic coverage then incorrectly treats 4800 as a six-month April-September package. After the new payment changes earlier allocations, 1000 is discarded by the expired package cap. Baseline totalPaid is 9800 but totalAdjusted is 8800 and advance is zero, leaving October due 800.

The repair matches only the exact known Flat 403 record, amount, invalid date, blank forMonth and migration note. Its sorting date is April 30 and its coverage closes at April. No database fields change. This receipt clears the four 1000 charges plus April's 800 before subsequent receipts allocate. No 200 advance is hardcoded. Rajat's existing effective-amount correction remains byte-for-byte unchanged.

The repaired production UI was verified at 0 due, 200 advance, 9800 total paid on deployment dpl_CNw323txQ7T318GhoyQc3SGTjtr2, commit 982d289b54c9e24e217fe90f1878b9f68b369bcf.

## Hardening

- Yearly Audit CSV is a current allocation snapshot grouped by selected year, not a historically frozen statement. It reuses buildLedger without financial writes, excludes future charge rows and deletion logs, and includes raw receipt dates and effective ledger amounts.
- Export is available only to managers and super admins within their accessible society. No new resident permissions are granted.
- Summary includes a historical unallocated difference for review; exporting never repairs or reinterprets it.
- CSV formula injection protection applies to all CSV exports; UTF-8 BOM supports Hindi.
- Build-time source rewriting is removed. Existing deployed payment refresh and editable mobile date field are preserved directly in source. Repeated builds do not change tracked files.
- Unused seed accounts/rates and helpers removed. Reporting moved into a pure module. Targeted lint exceptions document existing Firebase synchronization and click-handler behavior; hooks and access logic are retained.
- CI runs ledger/access/export tests, lint, build and clean-tree checks without Firebase or deployment credentials.

## Security/data-safety limits

- No Firebase records, rules, users, roles or credentials were modified during this work.
- Unauthenticated rate-history read returned 401. This is evidence of denial on that path, not a full Firebase rules audit.
- The public repository contained a credential-related Password file. Removed from current tree and ignored going forward. Historical copies remain exposed; affected credentials require separate rotation. The previously disclosed service-account key likewise requires rotation. No history rewrite or credential reuse was attempted.
- Firebase rules are not tracked in this repository and no authenticated rules-administration connector is available. Production role enforcement at the database layer requires a separate privileged rules review; client checks alone do not establish security.
- Manager/Resident helper regressions are tested. Live browser verification used the authorized Super Admin session; no other account was impersonated.
- Preview browser UI testing was blocked at the Vercel authentication redirect. Authenticated Vercel connector fetch verified the served preview bundle and executed its actual ledger functions against the observed Flat 403 inputs.
- Existing generic package-cap behavior for other flats was deliberately preserved. The export surfaces discrepancies for review instead of altering historical balances.

Dependency audit: non-breaking lockfile updates removed the critical advisory and reduced high findings from 6 to 4. Twelve advisories remain (8 moderate, 4 high) in the firebase-admin/Google Cloud tooling dependency tree. The suggested full remediation upgrades firebase-admin to a new major version and is deferred rather than forcing an untested migration of administrative scripts. These packages are not imported into the browser app. New payment input validation rejects impossible dates, invalid months and nonpositive/nonfinite amounts before writes; historical records are left unchanged.
