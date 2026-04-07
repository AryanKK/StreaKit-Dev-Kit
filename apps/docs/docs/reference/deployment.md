# Deployment

## Recommended split

- Deploy `apps/docs` as your public developer portal.
- Deploy `apps/demo` as a standalone playground and link it from docs.

## Docs build output

```bash
pnpm --filter @streakit/docs build
```

Output directory:

- `apps/docs/docs/.vitepress/dist`

## Demo build output

```bash
pnpm --filter @streakit/demo build
```

Output directory:

- `apps/demo/dist`

## Hosting options

- Vercel (docs + demo as separate projects)
- Cloudflare Pages (static output)
- Netlify (static output)
- GitHub Pages (docs only)

Keep docs versioned with SDK changes so integration instructions stay accurate.
