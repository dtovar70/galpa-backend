# Manada Russo Creativa — API

NestJS + TypeORM + PostgreSQL backend for the `frontend-cups` storefront.
Phase 1: admin auth with roles, products/categories CRUD, image uploads.
Phase 2: editable site content (texts and business data) edited from the admin.
Phase 3: guest orders, the BCV exchange rate and Pago Móvil payments verified by hand.

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
Payment screenshots are **private**: on local disk they go to `./private-uploads` (never served
statically, gitignored); on Cloudinary they are uploaded as `type: authenticated`. Only the admin
proof endpoint can read them (see [Orders](#orders)).

## Scripts

| Script                                                                  | What it does                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `db:up` / `db:down`                                                     | Start / stop the Postgres container                          |
| `db:migrate`                                                            | Run pending migrations (`typeorm migration:run`)             |
| `db:revert`                                                             | Revert the last executed migration                           |
| `db:migration:generate -- src/database/migrations/<Name>`               | Generate a migration from entity changes                     |
| `db:migration:create -- src/database/migrations/<Name>`                 | Create an empty migration                                    |
| `db:seed`                                                               | Idempotent seed (`src/database/seeds/seed.ts`, run with tsx) |
| `db:reset`                                                              | Drop the schema, run all migrations and seed                 |
| `build`, `start:dev`, `lint`, `format`, `typecheck`, `test`, `test:e2e` | Usual Nest tasks                                             |

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

**Text lengths.** Every single-line field (text, email, search, tel inputs) accepts at most
100 characters (`TEXT_INPUT_MAX_LENGTH`, `@MaxInputLength` in `src/common/validation/text-limits.ts`),
and its column is `varchar(100)`. Multi-line fields keep their own limit, enforced by the DTO and a
`char_length` CHECK: product description 4000, category description 1000, order notes 300,
personalization 140, rejection reason 500, internal notes 1000. `products.highlights` holds at most 6
items of up to 100 characters (CHECKs through `max_text_array_item_length(text[])`). Site content is
jsonb, so its limits live only in the content DTOs.

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
admin front then shows an "extend session?" prompt with a **`SESSION_PROMPT_SECONDS` (default 30)** countdown; "Sí, continuar" calls `POST /auth/refresh`, and while the admin is working the
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

| Section         | What it holds                                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `general`       | Brand name, tagline, footer description, page-title suffix, meta description, search placeholder                                                                                                                  |
| `announcements` | Ticker messages (1–8, ordered)                                                                                                                                                                                    |
| `home`          | Hero (badge, headline, subtitle, buttons, check features), section headings and copy, steps, CTA banner, newsletter                                                                                               |
| `about`         | Badge, title, paragraphs, button, values (icon/title/description), stats                                                                                                                                          |
| `contact`       | Email, phone and WhatsApp (`0412-5550134`), city, schedule, Instagram/TikTok handles                                                                                                                              |
| `contactPage`   | Contact page header and FAQ                                                                                                                                                                                       |
| `shipping`      | Free-shipping threshold and flat rate (USD), free-shipping and production copy                                                                                                                                    |
| `payment`       | Pago Móvil: bank code + name, phone, cédula/RIF, holder, instructions. Shown on the customer's order page; while any field but the instructions is empty, `POST /orders` answers `503 PAYMENT_METHOD_UNAVAILABLE` |

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

## Catalogs

Business lists the owner can see and rename live in the database (`src/catalogs`); what the
code's behavior depends on stays in code.

- **Order statuses.** `order_status_groups` (the admin tabs: `code` PK, `label`, `description`
  shown when the tab is empty, `sort_order`, `highlight`) and `order_statuses` (`code` PK, admin
  `label`, `customer_label` for the customer's timeline, `customer_title` and
  `customer_description` for the message on the order page, which may use `{produccion}` and
  `{marca}`, `group_code` → `order_status_groups`, badge `tone` (CHECK: `blush`, `sky`, `mint`,
  `butter`, `lilac`, `solid`, `neutral`), `sort_order`, `is_terminal`). The codes and the
  transition map stay in `src/orders/order-status.ts`: `orders.status` and
  `order_status_history.from_status` / `to_status` reference `order_statuses.code`
  (`ON UPDATE CASCADE ON DELETE RESTRICT`), and `orders_status_check` is kept. **At startup** the
  API compares the codes in `order_statuses` with `ORDER_STATUSES`: a mismatch is logged and, outside
  `NODE_ENV=production`, stops the boot (run `npm run db:migrate`, or add a new status to both
  the code and a migration). The catalog is cached in memory and reloaded after every admin edit
  (with several instances, the others pick an edit up on restart). Every `statusLabel`, history
  `label` and transition `label` the API returns comes from it.
- **Banks.** `banks` (`code` varchar(4) PK, `name`, `is_active`, `sort_order`), seeded with the
  26 Pago Móvil banks. Payment proofs and the Pago Móvil content only accept an active bank of
  the table (`order_payments.payer_bank_code` references it; the content's `bankName` is taken
  from it). A bank that a payment or the Pago Móvil details use cannot be deleted
  (`409`); deactivate it instead.

Endpoints:

- `GET /catalogs/order-statuses` (public) → `{ groups: [{ code, label, description, sortOrder,
highlight, statuses }], statuses: [{ code, label, customerLabel, customerTitle,
customerDescription, groupCode, tone, sortOrder, isTerminal }] }`, both sorted.
- `GET /catalogs/banks` (public) → active banks `[{ code, name }]`, in order.
  Both are sent with `Cache-Control: no-cache` and a weak ETag, like `GET /content`.
- ADMIN only, under `/admin/catalogs`: `GET order-statuses` (`no-store`),
  `PATCH order-statuses/:code` `{ label?, customerLabel?, customerTitle?, customerDescription?,
tone?, whatsappTemplate? }` (only the admin catalog carries `whatsappTemplate`), `PATCH order-statuses/groups/:code` `{ label?, description?, sortOrder? }` (both
  return the whole catalog; the code, the group and `isTerminal` are not accepted: `400`),
  `GET banks` (with `isActive`, `sortOrder`, `paymentCount`, `usedByPaymentContent`),
  `POST banks` `{ code, name, isActive? }` (`409` for a taken code), `PATCH banks/:code`
  `{ name?, isActive? }`, `PATCH banks/order` `{ codes }` (every code once) and
  `DELETE banks/:code` (`409` while in use).

## Orders

Guest checkout (no customer accounts). Code in `src/orders`, rates in `src/exchange-rate`.

**Flow.** The storefront sends the checkout form and the cart lines (`productId`, `variantId?`,
`quantity`, `personalization?` trimmed, up to 140 characters, kept in the item snapshot); any other field (e.g. a price) is a `400`. The API locks the
product rows (`SELECT … FOR UPDATE`), checks that each product is active, the variant exists and
the stock is enough (per-line Spanish errors, `400 ORDER_ITEMS_INVALID` with `details` and
`lines[{ index, available, message }]`), recomputes unit price (price + variant `priceDelta`),
subtotal, shipping (content `shipping`: free at the threshold, flat rate below, 0 for store
pickup), the USD total and the Bs total with the current BCV rate (snapshot of rate, source and
fecha valor), decrements the stock and stores the items as snapshots (name, variant label, unit
price, slug, first photo). The code is sequential (`MR-000123`, sequence `order_code_seq`).

**Private links.** The response carries `accessToken` (32 random bytes, base64url) once; only its
SHA-256 is stored. The customer page is `/pedido/MR-000123?t=<token>`; a wrong or missing token is a
plain `404`. An order may have several links (`order_access_links`: `order_id` → `orders`
`ON DELETE CASCADE`, unique `token_hash`, `created_by` → `users` (null for the checkout link),
`created_at`, `revoked_at`): checkout issues the first, and the admin issues new ones (the stored
hashes cannot be turned back into the customer's link). Any non-revoked link opens the order; each
candidate is compared in constant time. Links are built from `PUBLIC_SITE_URL` (default
`http://localhost:5173`). Migration `1790700000000-OrderAccessLinksAndWhatsAppTemplates` moved every
existing `orders.access_token_hash` into this table (same hash, so old links keep working) and
dropped the column; its `down()` puts back each order's oldest link.

**Avisar por WhatsApp.** Free `wa.me` links, no WhatsApp API. Each status has a
`whatsapp_template` (text, 1–1000 characters, CHECK; edited in Catálogos) with placeholders
`{nombre}` (first name), `{pedido}`, `{enlace}` (a fresh private link), `{total}` ("$36,00 (Bs.
30.760,69)"), `{motivo}` (note of the latest move into the current status), `{marca}`, `{envio}`
(shipping note, or the delivery method) and `{comprobante}` (public receipt link; only allowed in
`PAGO_VERIFICADO`, `EN_PRODUCCION`, `LISTO_PARA_ENTREGA`, `ENVIADO`, `ENTREGADO`). Unknown
placeholders or stray braces are a `400`. The API renders the message
(`src/orders/whatsapp`); a link is only issued when the template uses `{enlace}` or
`{comprobante}`. A customer phone that is not a Venezuelan mobile (0412/0414/0416/0422/0424/0426)
gets `phone: null` and no `url`.

**Comprobante de compra.** A PDF (pdfkit, A4, embedded Plus Jakarta Sans and Fredoka TTFs plus
the logo from `src/assets`, copied to `dist/assets` by the `assets` entry of `nest-cli.json`; OFL
licenses next to the fonts). Only for an order with a verified payment that is not `CANCELADO`
(`409` otherwise); long item lists paginate. Emoji in customer text are dropped (the fonts cannot
draw them).

**Payment.** The customer pays by Pago Móvil outside the site and sends the proof (reference,
bank, phone, optional cédula, date, amount in Bs, optional screenshot). A reference already used
on another live order is accepted but flagged `duplicateReference`; an amount different from the
order's Bs total is flagged with the difference (the Bs total is frozen at creation and never
follows later rate changes). Every submission is kept in `order_payments` with its `source`
(`customer`, or `admin` + `recorded_by` for a proof sent by WhatsApp).

**Late payments: a real payment is never refused.** A proof is accepted in `PENDIENTE_PAGO`,
`PAGO_RECHAZADO` and `EXPIRADO`, with no deadline check. When the customer's payment date
(`paid_on`, a Caracas calendar day) is after the day `payment_due_at` falls on, it is flagged
`late` on the payment and `late_payment` on the order; paying on time and uploading the proof
later is not late. An expired
order takes its stock back with the same row locks as checkout: if every product has enough, it
moves to `PENDIENTE_VERIFICACION` normally; otherwise it still moves there, each product gives
what it has (never below 0) and the order keeps a `stock_conflict` (per product: `requested`,
`available`, `reserved`). Confirming that payment then requires `acknowledgeStockConflict: true`
(`400 STOCK_CONFLICT_UNACKNOWLEDGED` otherwise); the confirmation takes whatever of the missing
stock is there by then and writes what is still missing in the history. A later cancellation
only gives back what the order really took. `CANCELADO` never accepts customer proofs (`409`,
"Si hiciste un pago, escríbenos por WhatsApp").

**Reactivation.** `EXPIRADO` → `PENDIENTE_PAGO` (ADMIN or EDITOR) and `CANCELADO` →
`PENDIENTE_PAGO` (ADMIN only, refused while any payment of the order was ever verified) take the
stock back and set a fresh deadline. Without enough stock the answer is `409 STOCK_INSUFFICIENT`
with `lines`; `forceStock: true` reactivates anyway and records a stock conflict.

**Refunds.** Cancelling an order with a pending or verified payment requires `refundStatus`
(`NO_APLICA` / `PENDIENTE` / `REEMBOLSADO`, plus an optional `refundReference`). A pending refund
is closed with `POST /admin/orders/:code/refund` (adds an internal note) and is listed with
`GET /admin/orders?refundStatus=PENDIENTE`.

**Statuses.** Codes and transitions live in code; labels, customer copy, badge colors and the
admin tabs in the database (see [Catalogs](#catalogs)). One method, `OrderStatusService.transition(code, to, actor, note?)`, applies every
change (admin API, proof upload, expiry job, future Telegram bot) using the map in
`order-status.ts`; anything else is `409`. Each change is written to `order_status_history`
(from, to, actor `admin`/`customer`/`system`/`telegram`, admin user, note).

| From                                                                                                 | To (actor)                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PENDIENTE_PAGO`                                                                                     | `PENDIENTE_VERIFICACION` (payment recorded: customer, or admin), `EXPIRADO` (system), `CANCELADO`                                 |
| `PENDIENTE_VERIFICACION`                                                                             | `PAGO_VERIFICADO` (acknowledgement required with a stock conflict), `PAGO_RECHAZADO` (reason required), `CANCELADO`               |
| `PAGO_RECHAZADO`                                                                                     | `PENDIENTE_VERIFICACION` (payment recorded: customer re-submits, or admin), `CANCELADO`                                           |
| `PAGO_VERIFICADO` → `EN_PRODUCCION` → `LISTO_PARA_ENTREGA` → `ENVIADO` (optional note) → `ENTREGADO` | each step also allows `CANCELADO`; `LISTO_PARA_ENTREGA` → `ENTREGADO` directly for pickup                                         |
| `EXPIRADO`                                                                                           | `PENDIENTE_VERIFICACION` (late payment recorded: customer or admin; takes the stock back), `PENDIENTE_PAGO` (reactivation, admin) |
| `CANCELADO`                                                                                          | `PENDIENTE_PAGO` (reactivation, ADMIN only, never after a verified payment)                                                       |

Moves to `PENDIENTE_VERIFICACION` only happen by recording a payment (the plain transitions API
answers `409`).

Staff steps accept `admin` (ADMIN or EDITOR) and `telegram` actors. `CANCELADO` needs a reason
and the ADMIN role, and restores the stock unless the order was already `ENVIADO`. Unpaid orders
expire after `ORDER_PAYMENT_WINDOW_HOURS` (checked every `ORDER_EXPIRY_INTERVAL_MINUTES`), become
`EXPIRADO` and restore their stock; the Bs amount is valid for the whole window.

**Events** (`@nestjs/event-emitter`, emitted after commit): `order.created`,
`order.payment_submitted` (with `late`, `source` and `stockConflict`), `order.status_changed`,
`order.refund_updated` (payloads in `orders.events.ts`). The Phase 4
Telegram bot subscribes with `@OnEvent(...)` and approves through `OrderStatusService`
(exported by `OrdersModule`).

### BCV exchange rate

`exchange_rates` keeps every rate (`rate numeric(12,4)`, `source` `bcv`/`dolarapi`/`manual`,
`effective_date` = BCV fecha valor, `fetched_at`, `is_manual`, `created_by`). Providers, tried in
order: **bcv.org.ve** (HTML: the `#dolar` block and "Fecha Valor"; the site does not send its
intermediate certificate, so that one request trusts Node's roots plus the bundled Sectigo DV R36
intermediate in `providers/bcv-ca.ts`; TLS verification is never disabled) and
**ve.dolarapi.com/v1/dolares/oficial** (JSON `promedio` + `fechaActualizacion`). The rate is
fetched at startup and every `EXCHANGE_RATE_SYNC_INTERVAL_MINUTES`; a row is added only when the
rate or its fecha valor differs from the last automatic one, so a manual rate stays in force until
the BCV publishes a different rate. Checkout uses the newest row; with none, or with one whose
fecha valor is older than `EXCHANGE_RATE_MAX_AGE_HOURS`, `POST /orders` answers
`503 EXCHANGE_RATE_UNAVAILABLE` ("No pudimos obtener la tasa del BCV…"). Parser fixtures live in
`src/exchange-rate/providers/__fixtures__`.

### Endpoints

Public (write routes throttled to 10 per 10 minutes per IP):

- `GET /exchange-rate/current` → `{ available: true, rate, source, effectiveDate, … }` or
  `{ available: false, reason: 'missing' | 'stale', message }`
- `POST /orders` → `{ code, accessToken, order }`
- `GET /orders/:code?t=` → the customer's order (Pago Móvil details, totals, payments, history,
  `receiptAvailable`)
- `GET /orders/:code/receipt.pdf?t=` → the purchase receipt (`attachment;
filename="comprobante-MR-000012.pdf"`, 20 per 10 minutes per IP; `404` with a bad token, `409`
  before the payment is verified or once cancelled)
- `POST /orders/:code/payment?t=` (multipart: `reference`, `payerBankCode` (an active bank of
  `banks`), `payerPhone`,
  `payerIdNumber?`, `paidOn`, `amountBs`, file `proof?` JPG/PNG/WEBP up to 5 MB, content-sniffed)
  — in `PENDIENTE_PAGO`, `PAGO_RECHAZADO` or `EXPIRADO` (late ones are flagged), otherwise `409`

Admin (ADMIN, EDITOR):

- `GET /admin/orders?status&refundStatus&search&from&to&page&pageSize` (search: code, name,
  email, phone, payment reference; `from`/`to` are Caracas days) → paginated list + `counts` per
  status + `pendingRefunds`; each row carries `latePayment`, `stockConflict` and `refundStatus`.
  `status` takes one status or several, comma-separated (`status=PENDIENTE_PAGO,PAGO_RECHAZADO`)
  or repeated (`status=A&status=B`), and lists orders in any of them; an unknown value is a `400`.
  `counts`, `countAll` and `pendingRefunds` follow the search and dates but ignore `status`, so
  the admin can show a number on every status group
- `GET /admin/orders/summary` → pending counts (`pendingRefunds` included), `paymentConfigured`,
  rate availability
- `GET /admin/orders/:code` → full order (`latePayment`, `stockConflict`, `refund`) +
  `allowedTransitions` for the current user
- `POST /admin/orders/:code/transitions` `{ to, note?, acknowledgeStockConflict?, forceStock?,
refundStatus?, refundReference? }`; `POST /admin/orders/:code/notes` `{ body }`
- `POST /admin/orders/:code/payments` (same multipart as the customer's proof): "Registrar pago
  manualmente" in `PENDIENTE_PAGO`, `PAGO_RECHAZADO` or `EXPIRADO`
- `POST /admin/orders/:code/refund` `{ reference? }`: the pending refund was made
- `POST /admin/orders/:code/access-links` → `{ token, url, createdAt }`: a new customer link
- `POST /admin/orders/:code/whatsapp-message` → `{ status, statusLabel, customerPhone, phone, text,
url, link, receiptUrl }` (the current status's template rendered; `url` is the wa.me link)
- `POST /admin/orders/:code/whatsapp-message/opened` → adds the internal note "Aviso por WhatsApp
  preparado (estado …)." (status unchanged) and returns the order
- `GET /admin/orders/:code/receipt.pdf` → the same receipt as the customer's
- `GET /admin/orders/:code/payments/:paymentId/proof` → streams the screenshot (local) or
  redirects to a 5-minute signed URL (Cloudinary); `Cache-Control: private, no-store`
- `GET /admin/exchange-rate` (current, last 30, last sync), `POST /admin/exchange-rate/refresh`,
  `POST /admin/exchange-rate/manual` `{ rate, effectiveDate? }` (ADMIN only)

Behind a reverse proxy, enable Express `trust proxy` so the throttler sees the client IP.

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
