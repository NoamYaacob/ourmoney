# Open Banking — Future Architecture Reference

This document describes the planned abstraction for Israeli Open Banking integration.
**Nothing in this document is implemented during MVP or POST-MVP.**

When the OPEN BANKING phase begins, this document is the starting point for the server-side API layer design.

---

## Current Status (August 2026)

Israel's Open Banking Law (תיקון 24 לחוק הבנקאות שירות ללקוח) mandated banks to open read APIs
by mid-2026. The Bank of Israel (BoI) has published a draft technical standard based on the UK's
Open Banking API specification. The major banks (Hapoalim, Leumi, Discount, Mizrahi-Tefahot)
are in varying stages of compliance.

Until the official API is stable and widely available, the bridge strategy is Salt Edge (which
provides Israeli bank access via a combination of direct API and screen-scraping bridges).

---

## Why a Server Layer is Required

Bank OAuth tokens and refresh tokens must never reach the mobile client. If the client holds a
token and the device is compromised, the attacker has full access to the user's bank account.

The required flow is:
```
Mobile App  →  Our API Server  →  Bank / Aggregator
                    │
              Holds tokens in encrypted storage
              Supabase Vault or separate KMS
```

The server layer will be introduced in the OPEN BANKING phase. Until then, the Supabase anon key is sufficient
for all MVP functionality.

---

## Planned Adapter Interface

```ts
// server-side: openbanking/adapter.ts — OPEN BANKING phase

export interface OpenBankingAdapter {
  /**
   * Returns the bank's OAuth authorization URL.
   * The user is redirected here to grant consent.
   */
  initiateConnection(params: {
    userId: string
    householdId: string
    bankId: string
    redirectUri: string
  }): Promise<{ authUrl: string; stateToken: string }>

  /**
   * Exchanges the OAuth code for access + refresh tokens.
   * Tokens are stored server-side. Never returned to the client.
   */
  exchangeCode(params: {
    code: string
    stateToken: string
    connectionId: string
  }): Promise<{ connectionId: string; expiresAt: Date }>

  /**
   * Fetches the list of accounts associated with this connection.
   */
  fetchAccounts(connectionId: string): Promise<RawAccount[]>

  /**
   * Fetches transactions since a given date.
   */
  fetchTransactions(params: {
    connectionId: string
    since: Date
    accountIds?: string[]
  }): Promise<RawTransaction[]>

  /**
   * Refreshes the access token using the refresh token.
   */
  refreshToken(connectionId: string): Promise<{ expiresAt: Date }>

  /**
   * Revokes consent and deletes tokens.
   */
  revokeConnection(connectionId: string): Promise<void>
}

export interface RawAccount {
  externalId: string
  name: string
  type: 'checking' | 'savings' | 'credit_card'
  currency: string
  balanceAgorot: number
}

export interface RawTransaction {
  externalId: string       // dedup key
  date: Date
  amountAgorot: number
  description: string
  merchantName?: string
  currency: string
}
```

---

## Planned Provider Implementations

| Adapter | Covers | Status |
|---|---|---|
| `SaltEdgeAdapter` | All major Israeli banks via bridge | Available today, screen-scraping |
| `BoIApiAdapter` | Official BoI Open Banking spec | Available when BoI standard finalizes |
| `PoweredFinanceAdapter` | Israeli aggregator (backup) | Evaluate before the phase begins |

Provider selection is [Q4](DECISIONS.md#open-questions) and must be resolved before the phase starts.

The `ob_providers` table will have an `adapter` column
routing each bank to the correct implementation.

---

## Planned Database Tables

These tables do NOT exist in MVP. They are added in an OPEN BANKING phase migration, each with RLS
policies and isolation tests in the same PR — see
[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#rules-for-adding-any-of-these-later).

```sql
-- Provider registry
CREATE TABLE ob_providers (
  id        TEXT PRIMARY KEY,        -- 'bank_hapoalim', 'bank_leumi', etc.
  name_he   TEXT NOT NULL,
  name_en   TEXT NOT NULL,
  logo_url  TEXT,
  adapter   TEXT NOT NULL,           -- 'saltedge' | 'boi_api' | 'powered_finance'
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- One row per user-bank authorization
CREATE TABLE ob_connections (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id),
  provider_id       TEXT        NOT NULL REFERENCES ob_providers(id),
  external_id       TEXT,              -- provider's connection/consent ID
  -- Tokens are stored encrypted (Supabase Vault). They are NOT readable by the client.
  access_token_ref  TEXT,              -- reference to Vault secret, not the token itself
  refresh_token_ref TEXT,
  token_expires_at   TIMESTAMPTZ,      -- short-lived; drives silent refresh
  consent_expires_at TIMESTAMPTZ,      -- 90 days; drives user-facing re-authorization
  last_synced_at    TIMESTAMPTZ,
  status            TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','needs_reauth','error','revoked')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log: every sync call
CREATE TABLE ob_sync_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id  UUID        NOT NULL REFERENCES ob_connections(id),
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accounts_found INTEGER,
  transactions_imported INTEGER,
  error          TEXT
);
```

---

## Consent and Compliance

Israeli Open Banking requires:
- Explicit per-bank consent with a displayed scope list
- 90-day consent expiry (re-authorization required)
- User can revoke at any time
- Data is only used for the stated purpose (household budgeting)
- Audit trail of every data access

`consent_expires_at` drives a scheduled job that:
1. **Emits `bank.connection_expiring`** 7 days before expiry — it does not call push directly.
   The notification layer decides who is told and through which channels
   ([ADR-014](DECISIONS.md#adr-014)).
2. Marks the connection `needs_reauth` on the day of expiry
3. Shows a banner in the app prompting re-authorization

> Consent lifetime and token lifetime are **different clocks**. An access token may expire in an
> hour and be refreshed silently; consent expires at 90 days and requires the user to re-authorize.
> `token_expires_at` drives the silent refresh job; `consent_expires_at` drives the user-facing
> event above. Conflating them produces either spurious re-auth prompts or a silent access failure.

On revocation:
- `ob_connections.status` → `revoked`
- All transactions from that connection are flagged. This requires extending the
  `transactions.source` CHECK constraint, which is `('manual','csv_import','recurring')` in MVP —
  an `ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT` in the OPEN BANKING migration to add
  `'openbanking'`
- Access and refresh tokens are deleted from Vault
- The bank's own revocation endpoint is called

---

## Migration Path from Salt Edge to Official BoI API

When the official BoI API becomes stable for a given bank:
1. Add a new row to `ob_providers` for the bank with `adapter = 'boi_api'`
2. Mark the Salt Edge provider row `is_active = FALSE` for that bank
3. Existing connections remain active until they expire
4. On next re-authorization, the user goes through the official flow
5. No code changes are needed in the mobile client or the business logic layer
