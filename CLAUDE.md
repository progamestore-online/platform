# pgs/platform

The ProGameStore platform monorepo. Three published npm packages (`@progamestore/games`, `@progamestore/cli`, `@progamestore/compliance`) plus eventual private platform workers (admin, auth, rooms).

## Working notes

- **Vendored from FGS on 2026-05-20.** Mirrors `~/dev/stores/fgs/platform`'s shape: pnpm workspace, `packages/{games-sdk,pgs-cli,compliance}`, Biome lint, OIDC publish. Per the workspace-level `../CLAUDE.md` rule, divergences from FGS happen here, not as cross-store npm deps.
- **No published versions yet.** All three packages sit at `0.1.0`. Nothing on npm under `@progamestore/*`.
- **The CLI templates don't exist yet.** `pgs init` references `progamestore-online/template-turn-based` etc., but those repos haven't been created. `pgs init` will fail with a clone error until they exist.
- **Storefront, admin, rooms — not in this repo.** Each gets its own repo when built (mirroring `freegamestore-online/{freegamestore,admin,auth,leaderboard}`).

## Dev

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## Layered context

- `~/dev/stores/CLAUDE.md` — workspace-wide rules (no cross-store deps, repo-creation gated through admin/CLI, etc.).
- `~/dev/stores/PLATFORM-LAYOUT.md` — deep-dive on per-store conventions.
- `~/dev/stores/fgs/platform` — the reference shape this repo cloned from.
