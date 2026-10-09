# StrideFrame — Agent Instructions

## Operating principles
- Inspect before editing.
- Preserve existing architecture unless a change is clearly justified.
- Prefer incremental changes over broad rewrites.
- Keep changes scoped to the requested iteration.
- Do not implement unrelated features.
- Never claim success unless validation checks actually pass.
- If an architectural issue is discovered, document it before changing it.
- Prefer reversible changes and avoid unnecessary dependencies.

## Git safety
- Inspect git status before modifying files.
- Do not force push or rewrite history.
- Do not delete or overwrite unrelated user changes.
- Do not commit secrets or real `.env` files.

## Engineering quality
Before completing meaningful work, run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` when applicable. Always report changed/created files, migrations, routes, tests, validation results, risks, and remaining work.

## Architecture discipline
- Domain logic must not depend directly on infrastructure providers.
- External providers must be abstracted behind interfaces/adapters.
- Avoid hardcoding payment, storage, language, or deployment vendors.
- Keep public customer and private photographer experiences separate.

## Security
- Never expose secrets or original photographs publicly.
- Public galleries use previews only; originals require authorization.
- Photographer resources must be ownership-isolated.
- Validate untrusted inputs and prefer signed/temporary URLs for protected downloads.

## Scope discipline
- Do not implement facial recognition, AI, uploads, image processing, storage integration, checkout, payment webhooks, cart, download grants, or production deployment in this iteration.

## Compatibility note
If Next.js re-adds generated agent guidance, preserve this project policy and follow current docs in `node_modules/next/dist/docs/`.
