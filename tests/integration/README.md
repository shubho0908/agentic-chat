# Checkpoint history integration proof

Run the reducer/branch/context suite with:

```bash
pnpm exec tsx --test tests/integration/checkpoint-history-root-fixes.test.ts
```

For the same flow against an actual Postgres `PostgresSaver`:

```bash
TEST_DATABASE_URL='postgresql://...' pnpm exec tsx --test tests/integration/checkpoint-history-root-fixes.test.ts
```

The Postgres case is deliberately reported as `SKIP` when that variable is absent. An in-memory checkpointer run is useful wiring coverage, but is not mislabeled as proof of the Postgres driver.
