# SF-FE-01 preflight

## Architecture

- Next.js 16 App Router with TypeScript and Tailwind v4-style utility classes.
- Prisma/PostgreSQL domain: Photographer → Event → Album → Photo → Order.
- Photographer routes use Server Components, Server Actions, JWT/httpOnly sessions and owner-scoped Prisma queries.
- Customer routes use server-rendered galleries, an httpOnly photo-ID cart, existing face-search POST API, Stripe Checkout and protected download routes.
- Face Search remains provider-abstracted and `DEV_VALIDATION_ONLY`; this task does not change the model or safety boundary.

## Reusable pieces

Existing `CustomerShell`, `PhotographerShell`, `Button`, `Card`, `Badge`, form fields, feedback states, Prisma queries, Server Actions, Stripe provider and secure-download flow are retained and refined rather than replaced.

## Missing or incomplete frontend pieces

- Visual system was inconsistent between the marketing home, customer pages and photographer workspace.
- Customer gallery/search/cart/checkout needed a stronger mobile-first funnel and shared photo selection treatment.
- Photographer navigation and dashboard needed the approved premium SaaS hierarchy.
- No backend contract exists for photographer-configured Zelle details; the UI will expose a clearly marked provider boundary only and will not invent server behavior.

## Backend contracts discovered

- `POST /api/events/[eventSlug]/face-search` accepts multipart `selfie` and returns preview URLs, photo IDs, album titles, prices and match scores.
- Cart uses `addToCart`, `removeFromCart`, `getCartIds` and server-side order pricing.
- Checkout creates a pending order through the existing `checkout` action.
- Stripe is initiated through `payOrder`; webhook verification remains authoritative.
- Paid orders use `prepareDownloads` and `/download/[token]/[photoReference]`.
- Photographer CRUD/upload/publication flows are implemented with existing Server Actions.

## Baseline

- Branch: `milestone/strideframe-core-mvp`
- HEAD: `920a8c3 feat: refine StrideFrame product UI`
- Working tree: clean before implementation.
- `npx prisma generate`: PASS (no migrations run).
- `npm run typecheck`: PASS.
- `npm test`: PASS — 20 passed, 6 skipped, 1 test file skipped.

## Plan

1. Establish shared tokens, shells and accessible primitives matching the reference.
2. Refine the customer gallery → face search → results → cart → checkout → order funnel using existing contracts.
3. Refine photographer dashboard/event/album/photo surfaces and responsive navigation.
4. Add frontend-only provider-neutral payment presentation for Stripe and a documented Zelle boundary without fake API behavior.
5. Run lint, typecheck, tests, production build and local visual checks without database migrations.
