-- ============================================================================
-- Migration 009 — a short human-readable note on an order recording where
-- it came from, when it was transferred or merged with another table's
-- bill (e.g. "Transferred from Table 1", "Merged with Table 3's order").
-- Purely informational — shown in reports so a due or a total that looks
-- odd at a glance can be traced back to what actually happened, rather
-- than left looking like a mistake.
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

alter table orders add column if not exists activity_note text;
