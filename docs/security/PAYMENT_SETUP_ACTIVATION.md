# Secure per-society receiving setup

## Delivered behavior

Super Admin chooses disabled, Personal UPI / QR, or Society Account for one society. Only an assigned Manager or Super Admin can register receiver details for that enabled mode. Residents cannot configure anything. Receivers are versioned; changing/re-enabling a mode requires linking again. Stale settings revisions are rejected atomically. Previous receiver snapshots remain in private history. Revoked personal receiver owners are hidden from public responses; society-owned receiving accounts remain independent of manager identity.

Society Account registration collects holder name, bank name, account/confirmation, IFSC and a receiving UPI ID; optional QR must be a raster image. The bank number is stored privately and only the last four digits are returned. This registers details; it does not establish verified bank ownership, perform KYC, link bank APIs, enable gateway settlements or automatically confirm payments. Managers continue to verify actual receipts manually. Existing maintenance entries and financial balances are untouched.

## Activation gate — intentionally closed by default

The API returns 503 until BOTH `FIREBASE_ADMIN_CREDENTIALS_JSON` and `PAYMENT_SETUP_RULES_VERIFIED=true` are configured on the deployment. The UI displays a locked setup notice. Resident Pay controls do not fall back to legacy unrestricted UPI settings. Manual payment entry and the rest of the ledger continue to work normally.

No backend variables existed when this feature was prepared. Do not reuse the previously disclosed service-account private key. Create/use fresh least-privilege credentials through the cloud provider, and enter them directly in protected deployment secrets; never paste credentials into chat, git, screenshots or browser-visible forms other than the provider's intended secret configuration.

The Admin SDK is pinned to Firebase project socioledger-8e2f6 and verifies Firebase ID tokens with revocation checking. Authorization reads the canonical `users/<verified-auth-uid>` profile. Legacy users without a canonical UID profile need a separately reviewed identity mapping; never grant a role from a client-supplied profile.

## Database rules contract

First obtain the CURRENT deployed rules; review and merge safely. Do not replace production rules with a guessed full ruleset. Firebase child denies cannot override a broad parent `.read` or `.write` allow.

Required properties before setting the verification flag:

- No client write at the database root or any ancestor that would permit writing `societies/<id>/paymentSetup`.
- `societies/<id>/paymentSetup` is server-only: client `.read: false`, `.write: false`. This includes policy, receiving profiles, public cache and history; authenticated API supplies sanitized public information.
- Clients must not be able to edit their own role, society memberships, or canonical UID mappings. Only trusted administration may modify authorization profiles.
- Review legacy `paymentSettings` access. This feature does not use it for routing; no new configuration is written there.
- Preserve legitimate Manager/Resident access to existing flats/payments/reports; no global financial rules migration is part of this feature.
- Test with Firebase rules emulator: unauthenticated, resident, assigned manager, cross-society manager and Super Admin client writes to the new subtree must all fail. Then verify API-only writes with fresh backend credentials in an isolated test society.

Once verified, configure the two server variables for the intended environment and redeploy. Test server auth, Super Admin mode enable, assigned Manager save, public masking, mode disable/re-enable and manager revocation without inventing financial receipts. The server transaction targets only `paymentSetup`; it never writes payments, balances, rates, expenses or user profiles.

## Limits

Current production Firebase rules were not available through the connected tools, so database-level enforcement and real account registration are NOT declared verified. API authorization, mode transitions, validation, masking, stale revision handling and fail-closed behavior are tested locally/CI with isolated mocks. No receiving destination or financial record was added to the production database during preparation.

Dependency compatibility: the backend uses modular firebase-admin 14.5.0 APIs on the existing Node 24 deployment. The administrative createAuthUsers script was converted to the same modular imports without executing it. Compatible client dependencies were refreshed; four high advisories remain in the client Firestore dependency tree, which this RTDB app does not import. A separate major client-SDK upgrade is not forced as part of activation.

Vercel runtime compatibility: jwks-rsa 4.1.0 uses CommonJS require for jose, while jose 6 is ESM-only and Vercel's Node runtime rejects that path. The transitive jose version is pinned to 5.10.0, which exposes CommonJS and the same importJWK/exportSPKI APIs used here. Tests boot the API with --no-experimental-require-module and verify RSA key conversion, valid signatures and forged-payload rejection. No token verification or runtime security protection is disabled.
