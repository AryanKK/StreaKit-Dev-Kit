# StreaKit Dev Kit

Public docs + a working sample application for developers integrating the `@streakit` SDK.

**Disclaimer:** StreaKit is a **personal project in active development**. It is not a production-ready or commercial product; APIs, docs, demos, and the animation library preview may change without notice.

## What this repo contains

- `apps/docs`: public-facing documentation site (VitePress)
- `apps/demo`: browser app showing a live `@streakit/core` integration
- `packages/core`: local SDK package consumed by the demo app
- `examples/animation-showcase-standalone.html`: single-file **Animation Library** preview (inlined bundle; includes a visible **personal project** disclaimer banner; open locally or host as static HTML)

## Quick start

```bash
pnpm install
pnpm dev:docs
pnpm dev:demo
```

- Docs runs at `http://localhost:4173`
- Demo app runs at `http://localhost:5173`

## Build for production

```bash
pnpm build
```

## Suggested deployment

- Deploy `apps/docs` as your public developer portal.
- Deploy `apps/demo` as a companion playground linked from docs.

This keeps stable docs and hands-on SDK usage in one repository.
