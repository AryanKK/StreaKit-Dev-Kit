# Contributing

Thanks for helping improve StreaKit. This repository is [MIT licensed](LICENSE); by opening a pull request, you agree your contributions are licensed the same way.

StreaKit is a **personal project in active development** (see the [README](README.md) disclaimer). APIs and docs may change; large refactors are easier when changes stay focused and well explained.

## Getting set up

- **Node.js** 20 or newer  
- **pnpm** 9 (see `packageManager` in the root `package.json`)

```bash
pnpm install
pnpm build
```

## What to run before opening a PR

CI runs `pnpm build` on every push and pull request. For changes under `packages/core`, also run:

```bash
pnpm --filter @streakit/core test
pnpm --filter @streakit/core typecheck
```

For docs-only edits under `apps/docs`, `pnpm build` is enough to catch broken builds.

## How to contribute

1. **Issues** — Good for bugs, unclear docs, or design discussion before you write a lot of code.  
2. **Pull requests** — Keep them scoped to one concern when possible (easier to review and merge).  
3. **Describe the change** — What problem it solves and how you tested it (commands you ran).

Please stay respectful and constructive in issues and reviews.

## Repository layout

| Path | Purpose |
|------|--------|
| `packages/core` | `@streakit/core` SDK (TypeScript) |
| `apps/docs` | VitePress developer docs |
| `apps/demo` | React demo using the SDK |
| `examples/` | Standalone previews (large bundled HTML where noted) |

If you are unsure where a change belongs, open an issue and ask.
