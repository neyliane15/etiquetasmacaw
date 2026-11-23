# Etiquetas Macaw

Sistema de etiquetagem e segurança de alimentos — Macaw Camboinhas e Macaw Búzios.

## Rodar

```bash
cp .env.example .env      # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:5173
```

Banco: veja `supabase/README.md` (migrations 0001→0003 e seed). O primeiro usuário cadastrado vira admin.

## Scripts

- `npm run typecheck` — TypeScript strict
- `npm test` — vitest
- `npm run build` — build de produção em `dist/`

Plano técnico completo: `docs/PLANO.md`.
