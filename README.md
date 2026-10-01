# Corporación Galpa 2022 C.A. — API

NestJS 12 + TypeORM + PostgreSQL backend of the Galpa storefront (`frontend-galpa`): air
conditioners (residential and commercial), spare parts and installation accessories, sold from
stock or "bajo pedido", with guest checkout, multi-method payments (Pago Móvil, transfer, Zelle,
Binance) verified by hand, quotes ("cotizaciones") and an admin panel for `ADMIN` / `EDITOR` users.

## Prerequisites

- Node.js 24+ and npm 11+
- Docker (on WSL: Docker Desktop → Settings → Resources → WSL integration for this distro)

## First-time setup

```bash
npm install
cp .env.example .env        # then set JWT_SECRET and SEED_ADMIN_PASSWORD
npm run db:up               # starts galpa-postgres and galpa-mailpit (docker compose)
npm run db:migrate          # creates the schema (one InitialSchema migration)
npm run db:seed             # admin user + 4 categories + demo catalog
npm run start:dev           # http://localhost:3000/api
```

The `galpa-postgres` container (database, user and password `galpa`, volume
`galpa-postgres-data`) publishes Postgres on host port **5441** so it does not clash with local
servers or other projects. `DATABASE_URL` must use the same port:
`postgresql://galpa:galpa@localhost:5441/galpa`. Set `POSTGRES_PORT` to use another one.

Images go to **Cloudinary** (folder `galpa/`) when every `CLOUDINARY_*` variable is set, otherwise
to **local disk** (`./uploads`, served at `/uploads`). Payment screenshots are **private**:
`./private-uploads` on disk (never served statically) or `authenticated` assets on Cloudinary.

## Environment

| Variable                                                | Notes                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                          | `postgresql://galpa:galpa@localhost:5441/galpa`                                           |
| `JWT_SECRET`                                            | At least 32 characters (also keys the Telegram link codes and reset codes)                |
| `PUBLIC_API_URL`, `PUBLIC_SITE_URL`, `CORS_ORIGIN`      | Public addresses; customer links are `<PUBLIC_SITE_URL>/pedido/GP-000123?t=…`             |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | First admin, only for `npm run db:seed`                                              |
| `CLOUDINARY_*`                                          | Optional (local disk without them; required in production)                                |
| `ORDER_PAYMENT_WINDOW_HOURS`, `ORDER_EXPIRY_INTERVAL_MINUTES` | Unpaid orders expire after the window (stock of STOCK lines is restored)            |
| `EXCHANGE_RATE_MAX_AGE_HOURS`, `EXCHANGE_RATE_SYNC_INTERVAL_MINUTES` | BCV rate freshness and sync interval                                         |
| `SCHEDULED_JOBS_ENABLED`                                | Rate sync, order expiry and quote expiry; empty = on (off under `NODE_ENV=test`)          |
| `MAIL_DRIVER`, `MAIL_FROM`, `MAIL_REPLY_TO`, `SMTP_*`, `RESEND_API_KEY` | `log` (default), `smtp` (Mailpit in development) or `resend`              |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ENABLED`, `TELEGRAM_MODE`, `TELEGRAM_WEBHOOK_SECRET` | Optional bot for the owner                                   |
| `SESSION_IDLE_MINUTES`, `SESSION_PROMPT_SECONDS`, `TRUST_PROXY` | Admin session timeout; proxy hops in front of the API                             |

`src/config/env.schema.ts` validates everything at startup and lists every problem at once.

## Scripts

| Script                                                    | What it does                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `db:up` / `db:down`                                       | Start / stop Postgres and Mailpit                                |
| `db:migrate` / `db:revert`                                | Run pending migrations / revert the last one                     |
| `db:migration:generate -- src/database/migrations/<Name>` | Generate a migration from entity changes (review it!)            |
| `db:seed`                                                 | Idempotent seed: admin, categories, demo products                |
| `db:reset`                                                | Drop the schema, migrate and seed                                |
| `typecheck`, `lint`, `test`, `test:e2e`, `build`          | Usual checks (`test:e2e` runs on in-memory fakes, no database)   |

The schema is owned by migrations (`synchronize` is always `false`). The whole schema is a single
`1793000000000-InitialSchema` migration: every table, index, foreign key and CHECK of the
entities, the `order_code_seq` / `quote_code_seq` sequences, the `max_text_array_item_length`
function, `users_email_lower_key`, and the reference data (order status groups and statuses with
their labels, customer copy, badge tones and WhatsApp templates; the Venezuelan banks; the mobile
operator codes). After changing an entity, generate a new migration and review its SQL.

## Production

With `NODE_ENV=production` the API refuses to start unless the public URLs are `https://` (no
localhost), `CORS_ORIGIN` has no localhost origin, Cloudinary is configured, mail goes through
`resend` (or a non-local SMTP host) and, in webhook mode, `TELEGRAM_WEBHOOK_SECRET` is set.

```bash
npm ci && npm run build
npm run migration:run:prod                                   # migrations from dist/
node dist/cli/create-admin.js --email dueno@galpa.com.ve --name "Dueño"   # first ADMIN, empty DB
npm run start:prod
```

Never run `db:seed` in production (it loads the demo catalog). `GET /api/health` checks the
database (`200 { status: 'ok', database: 'up' }` or `503`).

## Catalog

**Categories** (`slug`, `name`, `tagline`, `description`, `colorHex`, `icon` (Lucide name, e.g.
`air-vent`), `sortOrder`). Seeded: `aires-residenciales`, `aires-comerciales`, `repuestos`,
`accesorios`.

**Products**: `brand` (required), `model`, `sku` (unique while set), `stockMode` (`STOCK` | `ON_ORDER`),
`leadTimeDays`, `btu`, `voltage`, `isInverter`, `refrigerant`, `specs` (ficha técnica, up to 30
`{ label, value }` rows), `highlights` (up to 6), `tags` (`nuevo`, `bestseller`, `oferta`),
variants (`{ id, label, priceDelta, stock, sortOrder }`) and images. The public JSON adds the
computed `availability`: `IN_STOCK` (STOCK with units), `OUT_OF_STOCK` (STOCK without units) or
`ON_ORDER`. Only STOCK products hold, take and give back stock; ON_ORDER products are always
available. Search covers name, brand, model, SKU, description and tags (accent-insensitive).

## Orders and payments

Guest checkout. `POST /orders` prices everything on the server (unit price + variant delta,
shipping from the `shipping` content: free at the threshold, flat rate below, free for pickup),
freezes the BCV rate and the Bs total, takes the stock of the STOCK lines (row locks), stores the
lines as snapshots (name, slug, brand, model, stock mode, variant, first photo) and answers the
private `accessToken` once (only its SHA-256 is stored). Codes are sequential: `GP-000123`.
Orders carry `paymentMethod`, `hasOnOrderItems`, `wantsInstallation` and `customerIdNumber`.

**Payment methods.** `PAGO_MOVIL` and `TRANSFERENCIA` are paid in bolívares (`totalBs`), `ZELLE`
and `BINANCE` in dollars (`totalUsd`). The `payment` content section holds the store's details
per method; a method is offered when it is enabled and its required fields are filled
(`isMethodConfigured`). Checkout refuses a method that is not offered (`400`) and answers
`503 PAYMENT_METHOD_UNAVAILABLE` when none is. The customer may switch method while the order
waits for a payment (`PATCH /orders/:code/payment-method?t=`).

**Payment proofs** (`POST /orders/:code/payment?t=`, multipart, optional `proof` JPG/PNG/WEBP up
to 5 MB): `method`, `reference` (Pago Móvil 4–12 digits, transfer 4–20 digits, Zelle 4–40 letters
or digits, Binance 4–64), `paidOn`, plus per method: Pago Móvil `payerBankCode`, `payerPhone`,
`payerIdNumber?`, `amountBs`; transfer `payerBankCode`, `payerIdNumber?`, `amountBs`; Zelle
`payerName`, `payerAccount` (email or phone), `amountUsd`; Binance `payerAccount` (Pay ID or
email), `amountUsd`. A real payment is never refused for being late (it is flagged); a reference
repeated with the same method on another live order is flagged `duplicateReference`; a different
amount is flagged with the difference in the method's currency. The admin records proofs sent by
WhatsApp with the same form (`POST /admin/orders/:code/payments`).

**Statuses** (codes and transitions in `src/orders/order-status.ts`; labels and copy in the
`order_statuses` catalog):

| From                     | To                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `PENDIENTE_PAGO`         | `PENDIENTE_VERIFICACION` (payment recorded), `EXPIRADO` (system), `CANCELADO`        |
| `PENDIENTE_VERIFICACION` | `PAGO_VERIFICADO`, `PAGO_RECHAZADO` (reason required) — admin or Telegram            |
| `PAGO_RECHAZADO`         | `PENDIENTE_VERIFICACION` (customer re-submits), `CANCELADO`                          |
| `PAGO_VERIFICADO`        | `ESPERANDO_MERCANCIA` (bajo pedido), `EN_PREPARACION`, `CANCELADO`                   |
| `ESPERANDO_MERCANCIA`    | `EN_PREPARACION`, `CANCELADO`                                                        |
| `EN_PREPARACION`         | `LISTO_PARA_RETIRO` (pickup), `DESPACHADO` (delivery, note = shipping details), `CANCELADO` |
| `LISTO_PARA_RETIRO`, `DESPACHADO` | `ENTREGADO` (terminal)                                                      |
| `EXPIRADO`               | `PENDIENTE_VERIFICACION` (late payment, takes the stock back), `PENDIENTE_PAGO` (reactivation) |

`CANCELADO` is terminal, requires a reason and the `ADMIN` role, restores the stock of STOCK
lines and, with a pending or verified payment, asks whether money must be refunded. Stock
conflicts (an expired order paid late without enough stock) must be acknowledged before
confirming the payment.

**Receipt.** `GET /orders/:code/receipt.pdf?t=` (and the admin copy): a branded A4 PDF (Plus
Jakarta Sans and Space Grotesk, Galpa palette) with the payment method and its details, available
once a payment is verified (not for cancelled orders), with a QR to the customer's order page.

## Quotes

Admin quotes (`ADMIN` and `EDITOR`), code `COT-000045`. Lines are catalog products (brand, model
and slug filled in from the catalog) or free text (installation, materials…), with their own
prices; `discount` comes off the subtotal; `totalBs` is a reference at the latest BCV rate.
Workflow: `BORRADOR` → `ENVIADA` → `ACEPTADA` → `CONVERTIDA`, plus `RECHAZADA` and `VENCIDA`
(hourly job for sent quotes whose `validUntil` passed). Editable while `BORRADOR` or `ENVIADA`;
deletable only as `BORRADOR`.

- `GET /admin/quotes?status&search&page` → `{ items, total, page, pageSize }`
- `GET /admin/quotes/:code`, `POST /admin/quotes`, `PUT /admin/quotes/:code`
- `POST /admin/quotes/:code/status` `{ status, reason? }`
- `GET /admin/quotes/:code/pdf` → branded PDF
- `POST /admin/quotes/:code/send` → emails the PDF (attached, plus a public link) and marks it `ENVIADA`
- `POST /admin/quotes/:code/whatsapp-message` → `{ message, url, pdfUrl }` (`url` is the wa.me link)
- `POST /admin/quotes/:code/convert` `{ deliveryMethod, paymentMethod, address?, city? }` →
  `{ orderCode, customerUrl }`: a `PENDIENTE_PAGO` order at the quote's prices and discount
  (STOCK lines take stock; free lines never do), the quote becomes `CONVERTIDA`
- `DELETE /admin/quotes/:code`
- Public: `GET /quotes/:code/pdf?t=` (token issued when sending or sharing; only hashes stored)

## API overview (prefix `/api`)

Public:

- `GET /health`, `GET /content`, `GET /categories`, `GET /exchange-rate/current`
- `GET /catalogs/order-statuses`, `GET /catalogs/banks`, `GET /catalogs/mobile-prefixes`
- `GET /products?category&search&sort&minPrice&maxPrice&tags&brand&availability&btuMin&btuMax&voltage&inverter&page&pageSize`
  (`brand` comma-separated or repeated; `availability` `IN_STOCK` | `ON_ORDER`; `inverter` `true` | `false`)
- `GET /products/facets?category` → `{ brands, btus, voltages, priceRange: { min, max } }`
- `GET /products/featured`, `GET /products/:slug`, `GET /products/:slug/related`
- `POST /products/availability` `{ items: [{ productId, variantId? }] }` (ON_ORDER lines report 99 units)
- `POST /orders` (optional `Idempotency-Key` header), `GET /orders/:code?t=`,
  `PATCH /orders/:code/payment-method?t=`, `POST /orders/:code/payment?t=`,
  `GET /orders/:code/receipt.pdf?t=`, `POST /orders/lookup` `{ code, email }`
- `POST /contact` `{ name, email, phone?, topic, spaceType?, areaM2?, productSlug?, message }`
  (`topic`: `ASESORIA` | `COTIZACION` | `SOPORTE` | `OTRO`; `spaceType`: `RESIDENCIAL` | `COMERCIAL`;
  `fullName` is accepted instead of `name`): forwarded to the linked Telegram chats and emailed to
  the store inbox (contact email of the content, customer as reply-to); `503` when neither can
  receive it
- `GET /quotes/:code/pdf?t=`
- Auth: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET|PATCH /auth/me`,
  `POST /auth/me/password`, `POST /auth/password-reset/request|confirm` (session = httpOnly
  cookie `galpa_session`)

Admin (`ADMIN` / `EDITOR`; some actions `ADMIN` only): `/admin/products`, `/admin/categories`,
`/admin/content`, `/admin/orders` (list with counts, summary, detail, transitions, payments,
refund, notes, access links, WhatsApp message, receipt, proof), `/admin/quotes`,
`/admin/exchange-rate`, `/admin/catalogs` (statuses, banks, mobile prefixes), `/admin/telegram`,
`/admin/users`.

## Notifications

**Email** (`src/mail`; `log`, `smtp` or `resend`, attachments supported). `MailService.send` never
throws: failures are logged and never affect an order. Customer emails use the Galpa layout:

- **Pedido recibido** with the items, totals in the method's currency and the store's account for
  the chosen method, plus a fresh private link.
- **Status changes**: `PAGO_VERIFICADO`, `PAGO_RECHAZADO` (with the reason), `ESPERANDO_MERCANCIA`,
  `LISTO_PARA_RETIRO`, `DESPACHADO` (with the shipping details), `ENTREGADO`, `CANCELADO`
  (with the reason) and `EXPIRADO`, each with the order link.
- **Consultar mi pedido**, quotes (PDF attached), password reset codes and contact messages to the
  store inbox.

With `MAIL_DRIVER=smtp` in development, Mailpit (`galpa-mailpit`) catches every email at
<http://localhost:8025> (`SMTP_HOST=localhost`, `SMTP_PORT=1025`; host ports via
`MAILPIT_SMTP_PORT` / `MAILPIT_UI_PORT`).

**Telegram bot** (`src/telegram`, optional): linked chats receive each payment (method, payer
details, amount in its currency, warnings, proof photo) with ✅ / ❌ buttons that go through the
same transitions as the admin, new-order notices (method, installation request), contact and
advisory messages, BCV sync alerts and password reset codes. Link a chat from the admin
(**Telegram → Vincular un chat**) and send `/start <code>` to the bot. Commands: `/pendientes`,
`/pedido GP-000012`, `/micuenta`, `/ayuda`, `/salir`.

**WhatsApp**: `wa.me` links built from the per-status templates of the catalog (placeholders
`{nombre}`, `{pedido}`, `{enlace}`, `{total}`, `{metodo}`, `{motivo}`, `{marca}`, `{envio}`,
`{comprobante}`), and the quote message with its public PDF link.

## Tests

`npm test` runs the unit specs (`src/**/*.spec.ts`); `npm run test:e2e` boots the app against
in-memory fakes of the database, Telegram and mail (`test/fixtures`), so neither needs Postgres.
