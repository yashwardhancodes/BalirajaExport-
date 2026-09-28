# Export Cost & Margin Control Dashboard

A Next.js + Prisma + PostgreSQL app built around the 3-level structure from the spec:

1. **Rate Book** — Product Master + Supplier Rate Master (never overwritten, dated history)
2. **Quotation** — Shipments → line items → cost stages → client selling price → *quoted* margin
3. **Shipment (actuals)** — the same cost stages and price, logged again as *actual*, so quoted and actual never collide

Every cost/margin number in the app — dashboard, shipment page — is computed by one function in
`lib/calc.ts`. Nothing is calculated twice in two places, which is what caused the reconciliation
bug in the old spreadsheet (FOB/CFR/USD figures not matching).

## Architecture

- **Database:** any PostgreSQL (local, VPS, or a hosted one such as Supabase/Neon), accessed through
  **Prisma 7** with the `pg` driver adapter. Schema: `prisma/schema.prisma`; migrations: `prisma/migrations/`.
- **Tables:** `products`, `suppliers`, `supplier_rates`, `clients`, `shipments`, `shipment_items`,
  `cost_entries`, `quote_prices`. Money and weights are exact `DECIMAL`s.
- **Data access:** all reads/writes are server actions in `lib/actions.ts`. The browser never sees
  `DATABASE_URL`; `lib/db.ts` holds the Prisma client and converts Decimals to numbers for the UI.
- `cost_entries` and `quote_prices` are split by `cost_type` (`quoted` / `actual`), matching the
  "Quoted ≠ Actual" requirement from the spec — moving a shipment to Shipped/Completed doesn't
  overwrite the quote.

## Setup

1. **Point it at a database.** Copy `.env.example` to `.env.local` and set `DATABASE_URL`, e.g.

   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/baliraja_export
   ```

2. **Install, create the tables, run:**

   ```
   npm install          # also runs `prisma generate`
   npm run db:migrate   # prisma migrate deploy — creates all tables
   npm run dev
   ```

   Open http://localhost:3000. `npm run db:studio` opens Prisma Studio to browse the data.

3. **Changing the schema:** edit `prisma/schema.prisma`, then `npm run db:migrate:dev -- --name what_changed`
   to generate and apply a new migration.

4. **Lock it down before it's live.** There is no login yet. Anyone who can reach the app can read
   and change every figure. Before exposing it to the internet, add authentication (e.g. Auth.js with
   a single allowed user) and check it at the top of every action in `lib/actions.ts`.

5. **Deploy.** Given your VPS preference: `npm run build && npm run db:migrate && npm run start`
   behind nginx/PM2 like your other Node apps, with PostgreSQL on the same VPS.

## Costing flow (bulk → packed export goods)

Every cost is paid per kg. Goods arrive in bulk from the supplier, are sorted at the cold storage hub
(some weight is rejected), packed into export pouches (e.g. 2.5 kg) and cartons, then trucked to Nhava Sheva.

- **Paid per kg of bulk** (grossed up by sorting loss): bulk raw material, transport supplier → hub, sorting.
  With 5% loss, 1 packed kg needs 1 / 0.95 = 1.0526 bulk kg, so ₹100/kg bulk costs ₹105.26 per packed kg.
- **Paid per kg packed**: packaging labour, pouch, export carton, transport hub → Nhava Sheva.
- **Paid per shipment** (`shipment_charges`): FOB/port charges, ocean freight, other. Entered as totals and spread over
  the shipment's total packed kg, so each line carries its share by weight (₹1,20,000 on 24 MT = ₹5/kg).
  Each charge has its own currency: INR as-is; the shipment's currency at the shipment's exchange rate (so editing
  the rate re-prices it); any other currency at a rate stored on the charge.
- **Exchange rates per shipment**: a quoted rate (used for quoted figures) and an optional realised rate (used for
  actual figures once payment arrives; blank falls back to the quoted rate). ₹ per 1 unit of the deal currency.
- **Quote lock**: once a shipment moves past Quoted, its quoted figures (line costs, prices, quoted loss, quoted port &
  freight, currency and quoted rate, and which lines exist) can't change — enforced in `lib/actions.ts`. Moving the
  status back to Quoted unlocks them.
- **Dashboard totals are in ₹**: each line's margin is converted at its own shipment's rate before summing, and
  margin drift is split into the part caused by the exchange rate (`fxEffectINR`) and the rest.
- **Pricing comes last**: each line shows its full cost to us first; a target margin % then suggests the selling price
  as cost ÷ (1 − margin%), which you can accept or override.
- Sorting loss is kept separately for quoted and actual; a blank actual loss falls back to the quoted one.
- Pouch size, pouches per carton and typical loss are product defaults, overridable per shipment line.


## How the data model maps to the spec

| Spec concept | Table(s) |
|---|---|
| Product Master | `products` |
| Supplier Rate Master | `suppliers` + `supplier_rates` (dated, append-only) |
| Shipment Cost Sheet | `shipment_items` + `cost_entries` (per stage, per quoted/actual) |
| Client Quote | `quote_prices` (per quoted/actual) |
| Actual Shipment / status lifecycle | `shipments.status`: quoted → confirmed → produced → shipped → completed |

## Pages

- `/` — Dashboard: every shipment line with quoted margin vs. actual margin side by side, plus
  a margin-drift KPI (actual − quoted, once actuals exist).
- `/products` — Product Master.
- `/suppliers` — Suppliers, rate logging, and a live "current rate range per product" summary
  (the ₹41.50–₹44/kg view from the spec).
- `/clients` — Buyers.
- `/shipments` — Create/list shipments with status.
- `/shipments/[id]` — The core screen: add products to a shipment, toggle Quoted/Actual, enter
  cost per stage (raw material → ocean freight), enter the client's selling price, and see cost,
  margin/MT, margin %, total margin, and a "where the cost goes" stage breakdown — answering the
  spec's question 7 ("where is my margin disappearing").

## Not built yet (natural next steps)

- Login (see Setup step 4 — needed before this goes anywhere public)
- PDF/CSV export of a shipment's cost sheet or client quote
- Monthly/client/product-wise margin rollups (a Prisma `groupBy` over shipment lines, run
  through `lib/calc.ts` so the figures match the dashboard)
- Multi-currency supplier rates (currently rates are assumed ₹/kg)
