# Manada Russo Creativa — API

NestJS + TypeORM + PostgreSQL backend for the `frontend-cups` storefront.
Phase 1: admin auth with roles, products/categories CRUD, image uploads.
Phase 2: editable site content (texts and business data) edited from the admin.

## Prerequisites

- Node.js 24+ and npm 11+
- Docker (on WSL: enable Docker Desktop → Settings → Resources → WSL integration for this distro)

## First-time setup

```bash
npm install
cp .env.example .env        # then set JWT_SECRET and SEED_ADMIN_PASSWORD
npm run db:up               # starts postgres:17 (docker compose)
npm run db:migrate          # runs pending TypeORM migrations (src/database/migrations)
npm run db:seed             # admin user + categories + products from the frontend mocks
npm run start:dev           # http://localhost:3000/api
```

The container publishes Postgres on host port **5440** so it does not clash with locally
installed PostgreSQL servers (5432/5433 on WSL or Windows). `DATABASE_URL` must use the same port
(`postgresql://manada:manada@localhost:5440/manada_russo`). Set `POSTGRES_PORT` to use another one.

Images are stored on **Cloudinary** when all `CLOUDINARY_*` variables are set, otherwise on
**local disk** (`./uploads`, served at `/uploads`). The active driver is logged at startup.

## Scripts

| Script | What it does |
| --- | --- |
| `db:up` / `db:down` | Start / stop the Postgres container |
| `db:migrate` | Run pending migrations (`typeorm migration:run`) |
| `db:revert` | Revert the last executed migration |
| `db:migration:generate -- src/database/migrations/<Name>` | Generate a migration from entity changes |
| `db:migration:create -- src/database/migrations/<Name>` | Create an empty migration |
| `db:seed` | Idempotent seed (`src/database/seeds/seed.ts`, run with tsx) |
| `db:reset` | Drop the schema, run all migrations and seed |
| `build`, `start:dev`, `lint`, `format`, `typecheck`, `test`, `test:e2e` | Usual Nest tasks |

There is no bundled database GUI; use [DBeaver](https://dbeaver.io/) or
[pgAdmin](https://www.pgadmin.org/) with the `DATABASE_URL` credentials.

## Migrations

The schema is owned by migrations in `src/database/migrations`. The CLI uses
`src/database/data-source.ts` (reads `DATABASE_URL` from `.env`) and runs through `tsx`.

1. Change an entity (`src/**/entities/*.entity.ts`). Always give columns an explicit `type`.
2. Generate a migration: `npm run db:migration:generate -- src/database/migrations/AddProductSku`
3. Review the generated SQL (and its `down()`) before committing it.
4. Apply it: `npm run db:migrate` (production: run the same command before starting the app).

**Never enable `synchronize`.** It is hard-coded to `false` (and `migrationsRun` to `false`)
in `src/database/database.options.ts`; `synchronize` can silently drop columns and data.

Date/time columns use `timestamptz`. Plain `timestamp` has no zone, and node-postgres reads it as
the Node process's local time, which shifts values on any host that is not on UTC.

## Endpoints (prefix `/api`)

Public:

- `GET /health`
- `GET /products?category&search&sort&minPrice&maxPrice&tags&page&pageSize` → `Paginated<Product>`
  (`sort`: `relevance | price-asc | price-desc | newest | rating`; `tags` comma-separated or repeated;
  `pageSize` default 12, max 48; search is accent-insensitive)
- `GET /products/featured?limit` (`limit` 1–24, default 8)
- `GET /products/:slug`
- `GET /products/:slug/related?limit` (`limit` 1–12, default 4; same category first, then the rest)
- `GET /categories` (in `sortOrder` order, with `productCount` of active products)
- `GET /content` → every site-content section (see [Site content](#site-content))

Auth (session = httpOnly cookie `mr_session`):

- `POST /auth/login` `{ email, password }` (rate-limited to 5/min) → user + `session`
- `POST /auth/refresh` (requires a session, rate-limited to 30/min) → re-issues the cookie; same
  body as login
- `POST /auth/logout`
- `GET /auth/me` → user + `session`

`session` is `{ expiresAt, expiresInSeconds, ttlSeconds, idleMinutes, promptSeconds }`.

### Session timeout

The admin session closes after **`SESSION_IDLE_MINUTES` (default 30) without activity**. The
admin front then shows an "extend session?" prompt with a **`SESSION_PROMPT_SECONDS` (default
30)** countdown; "Sí, continuar" calls `POST /auth/refresh`, and while the admin is working the
front refreshes the session in the background. The token and cookie last idle minutes + prompt
seconds + 60 s (`src/auth/session.config.ts`), so the server session never ends before the
prompt does. Tokens issued with a longer lifetime (e.g. the old 7-day ones) are rejected.

Admin (roles `ADMIN` or `EDITOR`; deleting products or categories requires `ADMIN`):

- `GET /admin/products?search&category&isActive&page&pageSize`, `GET /admin/products/:id`
- `POST /admin/products`, `PATCH /admin/products/:id` (partial; `variants` replaces the list)
- `PATCH /admin/products/:id/active` (`{ isActive }`, or empty body to toggle)
- `DELETE /admin/products/:id` (ADMIN only)
- `POST /admin/products/:id/images` (multipart, field `files`, up to 8 JPG/PNG/WEBP, 5 MB each)
- `PATCH /admin/products/:id/images/order` `{ imageIds: string[] }`
- `DELETE /admin/products/:id/images/:imageId`
- `GET /admin/categories` (in `sortOrder` order, with `sortOrder` and `totalProductCount`: every
  product, hidden ones included)
- `POST /admin/categories` `{ name, slug?, tagline?, description?, colorHex, sortOrder? }` (`slug`
  is generated from the name when omitted and must be lowercase kebab-case; a taken slug is `409`;
  `sortOrder` defaults to after the last category; the slug `order` is reserved)
- `PATCH /admin/categories/order` `{ slugs: string[] }` → the admin list in the new order. `slugs`
  must hold every existing category slug exactly once (otherwise `400`); positions are rewritten
  as `0..n-1` in one transaction. The first three categories are the storefront's top menu.
- `PATCH /admin/categories/:slug` (`name`, `tagline`, `description`, `colorHex`, `sortOrder`; the
  slug cannot change)
- `DELETE /admin/categories/:slug` (ADMIN only; `409` while the category has any product, active
  or hidden, `204` otherwise). The `products.category_slug` foreign key is `ON DELETE RESTRICT`, so
  deleting a category can never delete its products.

## Site content

The storefront's texts and business data live in `site_content`, one row per section (`key` text
PK, `value` jsonb, `updated_at` timestamptz, `updated_by` → `users.id`, `ON DELETE SET NULL`). The
admin edits them at `/admin/contenido`.

| Section | What it holds |
| --- | --- |
| `general` | Brand name, tagline, footer description, page-title suffix, meta description, search placeholder |
| `announcements` | Ticker messages (1–8, ordered) |
| `home` | Hero (badge, headline, subtitle, buttons, check features), section headings and copy, steps, CTA banner, newsletter |
| `about` | Badge, title, paragraphs, button, values (icon/title/description), stats |
| `contact` | Email, phone and WhatsApp (`0412-5550134`), city, schedule, Instagram/TikTok handles |
| `contactPage` | Contact page header and FAQ |
| `shipping` | Free-shipping threshold and flat rate (USD), free-shipping and production copy |
| `payment` | Pago Móvil: bank code + name, phone, cédula/RIF, holder, instructions (not shown on the storefront yet) |

- **Defaults live in code** (`src/content/content.defaults.ts`): exactly the texts the storefront
  shipped with. No rows are seeded; `GET` merges the stored value of each section over its
  defaults field by field, so a section nobody edited, or a field added later, renders the
  default. Unknown or mistyped stored fields are ignored. The storefront keeps an identical copy
  (`frontend-cups/src/configs/content.defaults.ts`) as its offline fallback: keep both in sync.
- **Text conventions.** Words between asterisks are highlighted in headings (`Tus *favoritos*`).
  Placeholders are replaced when rendered, and each field only accepts its own:
  `{envioGratis}` (threshold, `$35`), `{tarifaEnvio}` (flat rate), `{produccion}` (production copy),
  `{categorias}` (category count in words, home only), `{marca}` and `{ciudad}` (About paragraphs).
- **Validation.** Each section has its own DTO (`src/content/dto`): lengths, list sizes, formats
  (`0412-5550134`, `V-12345678` / `J-123456789`, bank code `0102`, handles without `@`), money
  `>= 0` with 2 decimals, known placeholders and paired asterisks. Errors use the usual Spanish
  `{ message, details: [{ field, errors }] }` body; list items of plain-text lists are reported on
  the list with their position (`El anuncio 2 es obligatorio.`), nested ones by path
  (`steps.1.title`).

Endpoints:

- `GET /content` (public) → `{ general, announcements, … }`. Sent with `Cache-Control: no-cache`
  and a weak ETag: browsers revalidate on every load (`304` when unchanged), so edits show up at
  once.
- `GET /admin/content` (ADMIN, EDITOR) → per section `{ section, value, isDefault, updatedAt,
  updatedBy }` (`no-store`).
- `PUT /admin/content/:section` (ADMIN, EDITOR) → replaces the whole section (every field must be
  sent) and returns it as saved. Unknown section → `404`.
- `POST /admin/content/:section/reset` (ADMIN only) → deletes the stored row, so the section
  shows the defaults again; returns the section.

## Admin users and roles

There is **no public registration**. Every route requires a valid session unless it is marked
`@Public()`; admin routes add `@Roles(...)`.

- The seed creates (or updates) an `ADMIN` user from `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`
  and `SEED_ADMIN_NAME`. Re-running the seed resets that user's password and name.
- To add another admin, change the `SEED_ADMIN_*` values and run `npm run db:seed` again (the
  previous admin is kept). Editing `users` by hand in DBeaver/pgAdmin also works, but
  `password_hash` must be an argon2 hash, so the seed is the easier path.
- `EDITOR` users can manage products, images and categories but cannot delete products or
  categories. Change a user's role by updating `users.role` (`ADMIN` / `EDITOR`) in DBeaver or
  pgAdmin.
