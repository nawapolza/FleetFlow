# Render deploy fix

This project uses Tailwind CSS 3 syntax:

- `src/index.css` uses `@tailwind base`, `@tailwind components`, and `@tailwind utilities`.
- `postcss.config.js` must therefore load `tailwindcss` and `autoprefixer`.
- Do not use `@tailwindcss/postcss` unless the whole project is migrated to Tailwind CSS 4.

## Manual Static Site settings (repository root left blank)

Build Command:

```bash
cd frontend && npm ci --include=dev --no-audit --no-fund && npm run build
```

Publish Directory:

```text
frontend/dist
```

Environment variable:

```text
NODE_VERSION=20
```

## Alternative settings when Root Directory is `frontend`

Build Command:

```bash
npm ci --include=dev --no-audit --no-fund && npm run build
```

Publish Directory:

```text
dist
```

After pushing the corrected files to GitHub, use **Clear build cache & deploy** in Render.
