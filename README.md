# @progamestore/platform

Platform monorepo for [ProGameStore](https://progamestore.online) — the **paid** multiplayer games marketplace in the FreeGameStore family. Free, single-player games live on [FreeGameStore](https://freegamestore.online); anything with server-authoritative state (rooms, persistent worlds, AI-driven NPCs) lives here.

## Packages

| Package | npm | Purpose |
|---|---|---|
| `packages/games-sdk` | [`@progamestore/games`](https://www.npmjs.com/package/@progamestore/games) | React UI primitives (GameShell, GameTopbar, useAuth, **useRooms**) |
| `packages/pgs-cli` | [`@progamestore/cli`](https://www.npmjs.com/package/@progamestore/cli) | CLI for scaffolding and publishing multiplayer games |
| `packages/compliance` | [`@progamestore/compliance`](https://www.npmjs.com/package/@progamestore/compliance) | Compliance checks (Pro variant — rooms allowed, server-side AI allowed) |

## Status

This is a **green-field** platform repo. It's a vendored fork of `@freegamestore/platform` (2026-05-20) with:

- All `@freegamestore/*` package names rewritten to `@progamestore/*`.
- Domain refs swapped from `freegamestore.online` → `progamestore.online`.
- Boilerplate-header detection extended to flag `## Platform: ProGameStore`.
- Template list pointing at unbuilt `progamestore-online/template-*` repos.
- npm packages reset to `0.1.0` (nothing published yet).

What it does **not** have yet (TODOs for the rooms feature):

- A `useRooms()` hook in the SDK (the multiplayer client).
- A shared `rooms` Worker that owns the `GameRoomDO` class.
- A compliance check that requires PGS games to declare their room type.
- An admin Worker for the publish flow.
- Templates referenced by the CLI.

See the FGS platform at `~/dev/stores/fgs/platform` for the reference shape — PGS will diverge as Pro-specific features land.

## Development

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## Publishing

OIDC trusted publishing via GitHub Actions. Bump version and push:

```bash
cd packages/games-sdk
npm version patch
git push --follow-tags
```

## License

MIT
