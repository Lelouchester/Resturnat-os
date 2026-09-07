-- ============================================================================
-- Migration 004 — track which order items have already been sent to the
-- kitchen, so reprinting a KOT after new items get added can tell the
-- kitchen what's actually new instead of showing the whole order again.
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

alter table order_items add column if not exists kot_printed_at timestamptz;
