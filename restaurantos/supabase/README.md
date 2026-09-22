# supabase/

## Setting up a brand-new database
1. `schema.sql` — the base schema (state as of migration 019, minus 017/018).
2. Then, in order: `migrations/017_*.sql`, `migrations/018_*.sql`, `migrations/020_*.sql`.

## Updating an existing live database
Run only the migration(s) newer than the last one you ran, in order. Every
migration is safe to run twice. **020** stops before changing anything and
explains what to fix if your data would break one of its safety rules.

## What NOT to touch
`dev-only/` holds scripts that are dangerous or outdated on a real cafe
(`reset.DANGEROUS.sql` deletes everything). They refuse to run on a database
that has orders, and `reset` also needs an explicit confirmation line.

## tests/
Attack tests for the security rules (roles, hierarchy, cancelling, locked
records, login activity, sign-in linking). See `tests/README.md`.
