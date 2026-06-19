-- BYOK (bring-your-own-key/model): record which provider served each ask so cost
-- dashboards can split user-billed traffic from server-billed (NULL = server default).
-- Additive + idempotent. NEVER stores the user's API key — only the provider id.
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS provider TEXT;
