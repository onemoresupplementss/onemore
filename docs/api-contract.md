# Contract between the website and the Google Apps Script

Everything the website stores or reads goes through `functions/_lib/data/` (the
"data module"). Today that module talks to a Google Apps Script web app bound to
the **Orders – private** spreadsheet. A later Cloudflare D1 or Supabase version
only has to implement the same four calls (see the end of this file).

## Google files

**File 1 – "oneMore Products"** (staff may edit)

| Tab | Purpose |
|---|---|
| Products | One row per size/flavour (variant) |
| Product info | One row per product group: label/legal details |
| Settings | `Setting` / `Value` / `Notes` rows |
| Delivery | Delivery areas |

Products headers (row 1, in this order; the site matches headers by name, so order does not matter to the site):

`ID, Group, Active, Verified, Brand, Name, Category, Size, Flavour, Price, MRP, Stock, Image, Description, NetQty, Unit, BestBefore, Bestseller, Badge, Sort, Keywords, Check`

- `ID` unique, never reused (e.g. `ON-GSW-2KG-01`). `Group` = product page key; script fills it once from Brand + Name (slug) when blank and never overwrites it.
- `Active`, `Verified`, `Bestseller` are checkboxes. `Verified` = importer sticker + distributor bill checked (or Indian brand).
- `Category` dropdown: Whey Protein, Mass Gainer, Creatine, Pre-Workout, BCAA, EAA, Glutamine, Fish Oil, Multivitamin, Minerals.
- `Price`, `MRP` rupees; `Stock` whole number the owner types (shelf count). The script subtracts ordered units at order time and adds them back once when an order is Cancelled.
- `NetQty` number, `Unit` one of g, ml, tablets, capsules, softgels (for unit price).
- `BestBefore` date of the earliest batch on the shelf.
- `Check` is written by the script (problems with the row; blank = OK).

Product info headers: `Group, GenericName, VegNonVeg, Ingredients, Nutrition, Warnings, Manufacturer, Importer, CountryOfOrigin, ConsumerCare, LabelImages, Imported`

Settings rows (Setting | Value | Notes) – keys and defaults are defined in `src/shared/catalog.js` → `SETTINGS`, plus:
`PublishNow` (checkbox: ticking it calls the Cloudflare deploy hook, then the script unticks it) and `SiteStatus` (script writes last sync time / problems).

Delivery headers: `Area, Pincodes, Fee, ETA, Active` (blank Fee = Settings DeliveryFee; blank Pincodes = any valid pincode).

**File 2 – "oneMore Orders – private"** (owner only; script is bound to this file)

Orders headers:

`Order ID, Created, Status, Payment, Method, Total, Name, Phone, Fulfilment, Area, Pincode, Address, Landmark, Items, Subtotal, Delivery fee, Notes, UTR, UTR flag, Source, Stock held, Updated, ItemsJSON, IdemKey`

- Status dropdown: `New, Packed, Ready for pickup, Delivered, Cancelled`.
- Payment dropdown: `Pending, Paid, Refunded`.
- Method: `UPI`, `Pay on delivery`, `Pay at shop`.
- Phone, Pincode, UTR, IdemKey are written as plain text. Every customer-typed value is written as text (never as a formula).
- Extra tabs built with formulas: `Pending payments`, `To pack`, `Today`, `Customers`.

## Web app calls

The Cloudflare Function POSTs JSON to the web app `/exec` URL:

```json
{ "key": "<APPS_SCRIPT_KEY>", "action": "<name>", "data": { } }
```

Responses are JSON. Success: `{ "ok": true, ... }`. Failure: `{ "ok": false, "error": "<code>", "message": "<human text>", "details": ... }`.
A wrong or missing key returns `{ "ok": false, "error": "unauthorized" }`.

### `catalog` – full catalogue (used at build time only)

Response: `{ ok, products: [rowObject], info: [rowObject], settings: { Key: value }, delivery: [rowObject], generatedAt }`
Row objects are keyed by the exact header text. Dates as `YYYY-MM-DD`. Booleans as true/false.

### `createOrder`

```json
{
  "idemKey": "uuid from the browser (also the order's secret token)",
  "items": [{ "id": "ON-GSW-2KG-01", "qty": 1 }],
  "customer": { "name": "", "phone": "10 digits", "fulfilment": "delivery|pickup", "area": "", "pincode": "", "address": "", "landmark": "", "notes": "" },
  "payment": "upi|cod|shop",
  "source": "ig|gbp|shop|bag|direct"
}
```

Inside `LockService.getScriptLock()` (wait up to 20 s; `SpreadsheetApp.flush()` before release):

1. If a row already has this `IdemKey` → return that order exactly as the first time (no new row, no stock change).
2. Settings `AcceptingOrders` must be Open → else `closed`.
3. Each item: the ID exists and is visible (same rule as `variantVisible` in `src/shared/catalog.js`: Active, Verified when RequireVerified, Price > 0, Price ≤ MRP, BestBefore at least MinDaysLeft days away) → else `unavailable` with `details: [ids]`.
   qty is an integer from 1 to MaxQtyPerLine → else `bad_request`.
   Stock ≥ qty → else `sold_out` with `details: [{ id, available }]`.
4. Open orders for this phone (Status New and Payment Pending) < MaxOpenOrdersPerPhone → else `too_many_open`.
5. Pickup needs PickupEnabled; `shop` only with pickup; `cod` only with delivery and total ≤ CODMax → else `bad_request`.
6. Prices come from the sheet, never from the browser. Subtotal = Σ price × qty. Delivery fee: 0 for pickup; 0 if subtotal ≥ FreeDeliveryAbove (when > 0); else the Delivery tab's Fee for the chosen area, else Settings DeliveryFee.
7. Subtract stock, set `Stock held` = TRUE, take the next number from Script Property `ORDER_SEQ` (starts at 1000 → first order ORD-1001), append the row (Status New, Payment Pending).

Response:

```json
{
  "ok": true,
  "order": {
    "id": "ORD-1001",
    "created": "ISO timestamp",
    "status": "New",
    "payment": "Pending",
    "method": "upi|cod|shop",
    "lines": [{ "id": "", "brand": "", "name": "", "size": "", "flavour": "", "qty": 1, "price": 0, "lineTotal": 0 }],
    "subtotal": 0,
    "deliveryFee": 0,
    "total": 0,
    "customer": { "name": "", "phone": "", "fulfilment": "", "area": "", "pincode": "", "address": "", "landmark": "", "notes": "" },
    "callFirst": false
  }
}
```

`callFirst` = method cod and total > CallFirstCODAbove and this phone has no earlier Delivered order.

After releasing the lock the script pushes the live feed (below) so stock on the site updates at once.

### `attachUtr`

`data: { orderId, token, utr }` – `token` must equal the row's IdemKey → else `not_found`. `utr` must be 12 digits → else `bad_request`.
Writes UTR as text; if the same UTR is already on another order, writes `also on ORD-xxxx` to `UTR flag`. Response `{ ok: true }`.

### `notify`

`data: { orderId }` – emails Settings `AlertEmail` (if set) a short summary with the customer's call and WhatsApp links. Response `{ ok: true }`.

## Live feed pushed by the script to the website

The script POSTs to `<SITE_URL>/api/refresh` with header `X-Refresh-Key: <REFRESH_KEY>` and body:

```json
{
  "v": "hash of items+settings+delivery",
  "at": "ISO timestamp",
  "items": { "ON-GSW-2KG-01": [price, mrp, stock, visible01] },
  "settings": { "...public settings only, see publicSettings() in src/shared/catalog.js" },
  "delivery": [{ "area": "", "pincodes": ["614713"], "fee": 40, "eta": "Same day" }]
}
```

It pushes: after every order, after Cancelled (stock returned), from an installable onEdit trigger on the Products file (debounced ~30 s), and from a 5-minute time trigger only when the hash changed since the last successful push (stored in Script Properties). The site writes Cloudflare KV only when `v` changes.

## Script Properties

`API_KEY` (same as Cloudflare `APPS_SCRIPT_KEY`), `REFRESH_KEY`, `SITE_URL`, `PRODUCTS_SHEET_ID`, `DEPLOY_HOOK_URL`, `ORDER_SEQ`, `LAST_FEED_HASH`.

## Swapping to Cloudflare D1 later

Implement `functions/_lib/data/d1.js` exporting `createStore(env)`, like `apps-script.js`, returning
`{ getCatalog(), createOrder(input), attachPaymentRef({ orderId, token, utr }), notifyOrder(orderId) }`
with the same results, and change one line in `functions/_lib/data/index.js`. Move stock into D1 at the same time so the stock check and the order insert stay in one transaction.

## Clarifications from the Apps Script implementation (added with apps-script/*.gs)

These fill gaps in the contract above; nothing above was changed.

- **Feed `v`** is the same FNV-1a `hashString(JSON.stringify({items, settings, delivery}))` as `buildFeed()` in `src/shared/catalog.js`, so the script and the site give the same `v` for the same data. **`at`** is the time the Products file was *read* (not the time of sending), so the site may ignore a push whose `at` is older than the stored one. Item keys follow the site's product sort order.
- **`bad_request` details** from `createOrder`: an object keyed by field (`name`, `phone`, `area`, `pincode`, `address`, `landmark`, `fulfilment`, `payment`, `items`, `idemKey`); `message` is the first field's message, written for customers.
- **Delivery `Pincodes`**: when the chosen area's row lists pincodes, the customer's pincode must be one of them, or the result is `bad_request` with `details.pincode`. An area missing from the Delivery tab is allowed and pays Settings `DeliveryFee`.
- **Replay** (same `idemKey`) always returns `status: "New"`, `payment: "Pending"` and the same `callFirst`, exactly as the first answer, even if the owner has since changed the row. `callFirst` is stored as a final `CALL FIRST – …` line in the `Items` cell; `ItemsJSON` holds only the lines.
- **Customer text**: leading apostrophes and spaces are removed. Text starting with `= + - @` is written with a leading apostrophe so Sheets never treats it as a formula.
- **`notify`** returns `{ ok: true, skipped: true }` when `AlertEmail` is blank, and `{ ok: true, sent: false, message }` when the email could not be sent (daily quota and similar). The order is still saved.
- **`MaxOpenOrdersPerPhone`** is applied literally (`open < limit`), so 0 blocks every order; `selfTest` warns about this.
- **Daily rebuild**: a time trigger around 05:00 IST POSTs to `DEPLOY_HOOK_URL` (when set) and writes the result into `SiteStatus`.
- **Stale reminder**: unpaid `New` orders older than 2 hours are emailed once. They are marked with a cell note `stale – reminded <time>` on the Order ID cell, and nothing is cancelled.
- **Un-cancelling** an order whose stock was already returned does not take the stock again. The script adds a warning to `UTR flag` and a note on the Status cell, and the owner adjusts stock by hand.
- **Transport**: the web app always answers HTTP 200 with a JSON body, through a 302 to googleusercontent.com, so callers must follow redirects and read `ok`/`error`. `GET` returns only `{ ok: true, service: "oneMore" }`.
- **Extra Script Properties** used internally: `ORDERS_SHEET_ID`, `FEED_PUSH_SCHEDULED_AT`, `STATUS_SYNC`, `STATUS_REBUILD`, `STATUS_CHECK`, `PRICE_CACHE_0…n` (the last logged price/MRP per ID for the `Price log` tab).
