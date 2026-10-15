# oneMore – supplement shop website

Online shop for **oneMore**, a gym supplement shop in Tamil Nadu with one-day home delivery across the state.

The site has two modes, set by `orderMode` in `shop.config.json`:

| Mode | What customers see | Needs |
|---|---|---|
| **`whatsapp` – Phase 1 (current)** | Products with photos and details, **no prices**. The cart is sent to your WhatsApp as a list; you reply with the price. No customer details are collected on the site. | Only GitHub (free) |
| `checkout` – Phase 2 | Prices, live stock, full checkout with order numbers saved in Google Sheets, UPI steps. | Cloudflare + Google Sheets (Parts 1–3 below) |

- **[Phase 1 – Publish on GitHub Pages](#phase-1--publish-on-github-pages)**
- **[Part 1 – Daily use](#part-1--daily-use-owner-guide)** (phase 2): stock, prices, orders, photos (from your phone)
- **[Part 2 – One-time setup](#part-2--one-time-setup)**: Google, Cloudflare, domain
- **[Part 3 – Before launch](#part-3--launch-checklist)**: checklist
- **[Part 4 – For developers](#part-4--for-developers)**

---

## Phase 1 – Publish on GitHub Pages

Free, no other accounts needed. The site updates by itself about 2 minutes after every change on GitHub.

### One-time setup
1. Create a free account at github.com (turn on 2-step verification).
2. **New repository** → name it `onemore` → **Public** (free GitHub Pages needs a public repository; nothing secret is in
   this project) → don't add a README → **Create repository**.
3. Upload this project to it (the person helping you can `git push`; `node_modules` and `dist` are not uploaded).
4. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. Open the **Actions** tab. The **Publish website** run builds and publishes the site; when it is green, the address is shown
   there: `https://<your-username>.github.io/onemore/`. (If the first run failed because step 4 wasn't done yet,
   press **Re-run all jobs**.)
6. Optional – your own domain later: Settings → Pages → **Custom domain**, then point the domain's DNS at GitHub as the
   page explains. Links keep working; nothing in the code changes.

### Changing products
Products live in `data/seed/products.json` (one block per size/flavour) and label details in `data/seed/info.json`.
On GitHub open the file → pencil icon → edit → **Commit changes**. Copy an existing block to add a product; keep the
`ID` unique. `Active: false` hides a product. `Stock: 0` keeps it listed but shows **Out of stock** (customers can
ask on WhatsApp when it's back); any number above 0 makes it orderable again. Prices and stock numbers are **not**
shown in phase 1.
Photos: see `public/products/README.txt`.

> `npm run seed` regenerates these files from `scripts/make-seed.mjs` and **overwrites** hand edits – only use it to start over.

### What customers get
- Browse, search and filter by brand and size; product pages with photos, sizes, flavours and label details.
- **Add to cart → Send order on WhatsApp**: WhatsApp opens with a message like
  `1. Optimum Nutrition – Gold Standard 100% Whey – 2 kg – Double Rich Chocolate × 2 (ON-GS100-2KG)`, ready to send to
  `whatsappNumber`. Or **Order on WhatsApp** on a product page for a single item.
- You reply with the price, delivery charge and payment (UPI / cash on delivery / at the shop).

To move to phase 2 later, set `"orderMode": "checkout"` and follow Parts 1–3 (Cloudflare + Google Sheets).

---

## Part 1 – Daily use (owner guide)

*Parts 1–3 are for phase 2 (`orderMode: "checkout"`).* Running cost: **₹0 a month** (Cloudflare free plan, Google free account).

You have two Google Sheets:

| File | Who opens it | What it is for |
|---|---|---|
| **oneMore Products** | You and staff | Prices, stock, photos, delivery areas, settings |
| **oneMore Orders – private** | Only you | Every order, payment and status |

### Change a price or stock
1. Open **oneMore Products** → tab **Products** in the Google Sheets app.
2. Change **Price** or **Stock**.
3. That's it. The website shows the new value within about a minute. No rebuild needed.

`Stock` is the number of tubs on your shelf. The website takes stock off when an order is placed
and puts it back if you set that order to **Cancelled**. When you sell at the counter, lower the
number yourself (once a night is fine).

The **Check** column is filled in by the system. If it is not blank, that row has a problem
(for example "price is above MRP" or "photo missing"). Rows with a serious problem are hidden from the website.

### When a new order comes in
You get the customer's WhatsApp message, and an email if `AlertEmail` is set.

1. Open **oneMore Orders – private** → tab **Orders** (or **To pack** / **Pending payments**).
2. **UPI orders**: open *your own* UPI app and check the money has arrived (amount and time,
   and the UTR if the customer sent one). Only then set **Payment** to **Paid**.
   Screenshots and UTR numbers are easy to fake. Trust only your own app.
3. Pack it and set **Status** to **Packed**, then **Ready for pickup** or **Delivered**.
4. **Pay on delivery / at the shop**: set **Payment → Paid** when you collect the money.
5. Orders marked "call first" are pay-on-delivery orders above ₹3,000 from new customers. Call them before packing.

Orders never cancel themselves. If an order stays *New + Pending* for 2 hours you get a reminder.
To cancel: set **Status → Cancelled**. The stock goes back to the Products sheet automatically, once.
If you change a cancelled order back, fix the stock yourself (the sheet will remind you).

The tabs **Pending payments**, **To pack**, **Today** and **Customers** update themselves. Don't type in them.

### Add a new product
1. In **Products**, add a row: `ID` (unique, never reuse one, for example `MB-BIOZ-1KG-02`), Brand, Name,
   Category (pick from the list), Size, Flavour, Price, MRP, Stock, NetQty + Unit, BestBefore.
2. Tick **Active**. Tick **Verified** only after you've checked the Indian importer sticker and the distributor bill
   (Indian brands: just tick it).
3. Different sizes/flavours of the same product: one row each. The `Group` column joins them on one product page
   (it fills itself in, so leave it alone).
4. Fill one row in the **Product info** tab for the same `Group`: ingredients, nutrition, veg/non-veg,
   importer, country of origin, consumer care. The law requires these details on the website.
5. New products appear on the website after a rebuild: tick **PublishNow** in the **Settings** tab
   (it unticks itself and the site updates in about 2 minutes), or wait for the automatic rebuild at 5 am.

To hide a product, untick **Active**. Don't delete rows, because old orders refer to their IDs.

### Add product photos
See `public/products/README.txt`. In short: upload a square photo to the `public/products` folder on GitHub,
type its file name in the **Image** column, then tick **PublishNow**.

### Settings tab
| Setting | What it does |
|---|---|
| AcceptingOrders | `Open` / `Closed`. Closed turns off checkout and shows ClosedMessage (festival, holiday). |
| Announcement | Text in the lime bar at the top of every page. Blank hides it. |
| PreviewBanner | `Yes` shows "Preview – do not order" on every page. **Set `No` at launch.** |
| DeliveryFee, FreeDeliveryAbove | Delivery charge and free-delivery threshold. |
| CODMax, CallFirstCODAbove | Pay-on-delivery limit, and the "call first" amount for new customers. |
| PickupEnabled, SameDayCutoff, ShopHours | Shown at checkout and on the site. |
| ShowLowStockAt | Shows "Only N left" at or below this number. |
| MaxQtyPerLine, MaxOpenOrdersPerPhone | Limits against mistakes and fake orders. |
| MinDaysLeft | Hides stock that is close to its best-before date (default 45 days). |
| RequireVerified | `Yes` = only Verified rows are sold online. |
| AllowPuducherry | `Yes` accepts Puducherry/Karaikal pincodes. **Needs GST registration.** Set `No` if you're not registered. |
| AlertEmail | Where new-order and reminder emails go. |
| ReviewLink | Your Google review link, shown after an order. |

**Delivery** tab: one row per area with Fee (blank = DeliveryFee) and ETA. Untick Active to stop delivering there.

### Change the WhatsApp number, UPI ID or shop details
These are in **`shop.config.json`** on GitHub (rarely changed, and kept away from the sheet so nobody can tamper with them):
1. Open the repository on github.com → `shop.config.json` → pencil icon (Edit).
2. Change the value between the quotes, for example `"upiId": "oneMore@okicici"`.
   The WhatsApp number is digits only with 91 in front: `"whatsappNumber": "916385824752"`.
3. **Commit changes**. Cloudflare rebuilds the site in about 2 minutes.

> Keep `"upiPayLinkTested": false` unless a ₹1 payment through the "Open UPI app" button has worked in
> GPay, PhonePe, Paytm *and* BHIM. UPI apps block website pay links to most shop UPI IDs, so by default
> the site shows Copy UPI ID / Copy amount instead. That works in every app.

### If something goes wrong
- **Website shows old stock**: Settings → **SiteStatus** shows the last sync and any error. In the Orders file, use menu **oneMore → Push stock to website now**.
- **Customer says the order didn't go through**: if Google was down, the customer could still send the order on WhatsApp marked **NOT SAVED**. Add it to the sheet by hand and lower the stock.
- **Order system closed by mistake**: Settings → AcceptingOrders → `Open`.

---

## Part 2 – One-time setup

Turn on **2-step verification** on your Google, GitHub and Cloudflare accounts before you start.

### Step 1 – GitHub (stores the website code)
1. Create a free account at github.com and a **private** repository called `onemore`.
2. Upload this project folder to it (or `git push` it). `node_modules` and `dist` are not needed.

### Step 2 – Google Sheets and the Apps Script
Do this on a computer, signed in to the Google account that will own the shop's data.

1. Create a new Google Sheet and name it **oneMore Orders – private**. Don't share it with anyone.
2. In that sheet: **Extensions → Apps Script**. Name the project `oneMore`.
3. Copy in the files from the `apps-script/` folder of this project:
   - For each `.gs` file (`Code.gs`, `Rules.gs`, `Feed.gs`, `Orders.gs`, `Setup.gs`, `SeedData.gs`): click **+ → Script**,
     give it the same name (without `.gs`), and paste the contents. Replace the starter `Code.gs` contents completely.
   - **Project Settings ⚙ → tick "Show appsscript.json manifest file"**, then open `appsscript.json` in the editor and
     paste the contents of `apps-script/appsscript.json`.
4. In the function list at the top choose **`setupAll`** and press **Run**. Google asks for permission:
   **Review permissions → your account → Advanced → Go to oneMore (unsafe) → Allow**.
   (It says "unsafe" only because the script is your own and not published by Google.)
   This:
   - creates **API_KEY** and **REFRESH_KEY** (shown in **Execution log**; you need them for Cloudflare in Step 3);
   - creates the **oneMore Products** spreadsheet filled with the starter catalogue (find it in your Google Drive);
   - formats the **Orders** tab with dropdowns and colours, and adds the **Pending payments**, **To pack**, **Today** and
     **Customers** tabs;
   - sets up the timers (stock sync every 5 min, unpaid-order reminder every 30 min, website rebuild at 5 am).
5. **Deploy → New deployment → ⚙ Select type → Web app**. Description `website`, Execute as **Me**,
   Who has access **Anyone**. Press **Deploy**, and copy the **Web app URL** (ends in `/exec`).
   (Later code changes: **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**, so the URL stays the same.)
6. After Step 3 below gives you the website address and deploy hook: in the Orders sheet use menu
   **oneMore → Set website address…** (or Project Settings → Script Properties: `SITE_URL`, `DEPLOY_HOOK_URL`).
7. Fill **AlertEmail** in the Settings tab of oneMore Products, then run **`selfTest`**. Every line should say OK.
8. Share **oneMore Products** with staff who update stock (Share → Editor). Never share the Orders file.

The sheet tabs can also be built by hand from `sheets/*.csv` (File → Import), but `setupAll` does it for you.

### Step 3 – Cloudflare Worker (hosts the website for free)
The site runs as a Cloudflare **Worker** with static assets: the pages are plain files, and only `/api/*` runs code
(`worker/index.js`). The Worker's name, the KV binding and the asset settings are in `wrangler.jsonc`.

1. Create a free account at dash.cloudflare.com.
2. **KV storage for live stock**: `npx wrangler kv namespace create onemore-live`, and put the id it prints in
   `wrangler.jsonc` → `kv_namespaces` (binding `LIVE`).
3. **Compute → Workers & Pages → Create → Import a repository** → connect GitHub → pick `onemore`.
   Build command `npm run build`, deploy command `npx wrangler deploy`, root directory `/`.
4. **Runtime secrets** (Worker → Settings → Variables and secrets, type **Secret**), or
   `npx wrangler secret put <NAME>`:

   | Name | Value |
   |---|---|
   | `APPS_SCRIPT_URL` | the Web app URL from Step 2 (ends in `/exec`) |
   | `APPS_SCRIPT_KEY` | the `API_KEY` from Step 2 |
   | `REFRESH_KEY` | the `REFRESH_KEY` from Step 2 |
   | `TURNSTILE_SECRET` | optional, see below |

5. **Build variables** (Worker → Settings → Builds → **Variables and secrets**; the build reads the sheet, so it needs
   the key too):

   | Name | Value |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `PUBLIC_ORDER_MODE` | `checkout` (overrides `orderMode` in `shop.config.json`, so GitHub Pages can keep phase 1) |
   | `SITE_URL` | the site address, e.g. `https://onemore.<account>.workers.dev` |
   | `APPS_SCRIPT_URL` | as above |
   | `APPS_SCRIPT_KEY` | as above (Secret) |

6. **Deploy hook** (for PublishNow and the nightly rebuild): Worker → Settings → Builds → **Deploy Hooks** → Add
   (branch `main`). Put the URL in the Apps Script property `DEPLOY_HOOK_URL`.
7. Push a commit (or **Retry build**). The build log should say `Catalogue (google-sheet, checkout mode): …`.
   If the sheet can't be read, or returns no products, the build stops on purpose and the previous version stays online.
8. In the Orders sheet: menu **oneMore → Set website address…** → `SITE_URL` (the workers.dev address, or your domain
   later) and `DEPLOY_HOOK_URL`. Also set `shop.config.json` → `siteUrl`.

**Optional – bot protection (free)**: Cloudflare → Turnstile → Add widget for your domain. Put the *site key* in
`shop.config.json` → `turnstileSiteKey` and the *secret key* in the `TURNSTILE_SECRET` variable.

**Free visitor statistics**: Cloudflare → **Web Analytics** → add the site (no cookies, no banner needed).

### Step 4 – Domain
1. Buy the domain (for example `onemore.in`) from an Indian registrar that takes UPI.
2. Cloudflare → **Add a domain** (free plan) → it gives you two nameservers → enter them at your registrar
   (takes up to a few hours).
3. Worker → Settings → **Domains & Routes** → Add → **Custom domain** → `onemore.in`, and again for `www.onemore.in`.
4. Update `siteUrl` in `shop.config.json` and `SITE_URL` in the Apps Script properties to the new domain.
5. **Email**: Cloudflare → your domain → Email → **Email Routing** → forward `info@onemore.in` to your Gmail. Free.

### Step 5 – Google Business Profile
Search for your shop on Google Maps. If it's there, tap **Claim this business**. If not, add it at business.google.com.
Add the website link, hours and photos, and the link `https://onemore.in/?src=gbp` (so you can see orders that came from Google).
Use `?src=ig` in your Instagram bio and `?src=bag` on the QR sticker on carry bags.

---

## Part 3 – Launch checklist

- [ ] Written answer from the Tiruvarur **Food Safety Officer** on whether website sales need a separate/Central FSSAI licence.
- [ ] FSSAI number in `shop.config.json` → `fssaiNumber` (it shows in the footer and on terms).
- [ ] Every `[placeholder]` in `shop.config.json` replaced (the build log lists any that are left).
- [ ] UPI ID set; ₹1 test payment by "Pay to UPI ID" works and shows the right name (`upiNameCustomersSee`).
- [ ] Real prices, MRP, stock, NetQty/Unit and BestBefore for every product; placeholder rows fixed or set inactive.
- [ ] **Verified** ticked only for tubs with an importer sticker and a distributor bill.
- [ ] Product info (label details) filled at least for bestsellers; label photos added.
- [ ] Delivery areas, pincodes and fees confirmed.
- [ ] **AllowPuducherry = No** unless you are GST-registered.
- [ ] AlertEmail set; a test order reaches the sheet, the email arrives, and Cancelled puts the stock back.
- [ ] **PreviewBanner = No**.
- [ ] Domain, email forwarding, Google Business Profile done.

Things to re-check from time to time: the UPI merchant fee (0.4% above ₹2,000 announced, postponed in October 2026),
and the 2027 rule about showing the lowest price of the last 30 days next to a discount (the Apps Script already keeps a
**Price log** tab for this).

---

## Part 4 – For developers

**Stack**: [Astro](https://astro.build) (static pages, fast on cheap phones) + small [Preact](https://preactjs.com) islands
(cart, filters, checkout) + Tailwind CSS 4, on a Cloudflare Worker with static assets and KV. Orders and catalogue live in
Google Sheets behind a Google Apps Script web app. No framework server, no database to run.

```
shop.config.json          shop details (WhatsApp, UPI, address, legal)
src/shared/catalog.js     catalogue rules: columns, settings, visibility, live feed  (shared by build, browser, functions)
src/shared/order.js       order rules: validation, delivery fee, WhatsApp text, UPI link
src/pages/                pages (/, /shop/, /shop/<category>/, /p/<slug>/, /checkout/, /order/, policies)
src/components/*.jsx      Preact islands; src/client/store.js = cart, live feed, saved orders
functions/api/            order.js, utr.js, live.js, refresh.js  (API handlers, Pages Functions shape)
worker/index.js           Cloudflare Worker entry: routes /api/* to functions/api/, the rest is static files
wrangler.jsonc            Worker name, KV binding, asset settings (no secrets: the repository is public)
functions/_lib/data/      the ONLY place that talks to the order store (Apps Script today)
apps-script/              Google Apps Script code (copy into the Orders spreadsheet's script editor)
scripts/prepare-data.mjs  runs before every build: fetches the catalogue (or uses data/seed/) → src/data/catalog.json, public/feed.json
scripts/make-seed.mjs     regenerates the starter catalogue (data/seed/, sheets/*.csv, apps-script/SeedData.gs)
docs/api-contract.md      contract between the site and the Apps Script
```

**How data flows**
- *Build*: `prepare-data.mjs` calls the script's `catalog` action and bakes products into the pages, plus `public/feed.json` as a snapshot.
- *Live stock*: the script pushes a small `{id: [price, mrp, stock, visible]}` feed to `/api/refresh` after every order, cancel and sheet edit (debounced) and every 5 minutes if changed. `/api/refresh` writes KV only when the hash changes; `/api/live` serves it with a 30 s cache. The browser falls back to `/feed.json`.
- *Orders*: `/api/order` validates, then the script re-prices from the sheet, checks and holds stock under a lock, and returns `ORD-####`. The same `idemKey` always returns the same order, so retries never duplicate.

**Commands**

```sh
npm install
npm run dev        # http://localhost:4321 (uses data/seed/ unless APPS_SCRIPT_URL/KEY are in .env)
npm run build      # → dist/
npm test           # unit tests for shared rules, the API handlers and the Worker routing
npm run seed       # rebuild the starter catalogue files
node scripts/make-images.mjs   # re-render og.png and icons
```

`npm run dev` serves the pages only. To run the API locally too, `npm run build` then `npx wrangler dev` with a
`.dev.vars` file holding the same secrets as Cloudflare. `functions/api/*.js` keep the Pages Functions shape
(`onRequestGet({ request, env, waitUntil })`); `worker/index.js` routes `/api/*` to them.

**Moving orders to Cloudflare D1 later**: write `functions/_lib/data/d1.js` exporting `createStore(env)` with
`getCatalog`, `createOrder`, `attachPaymentRef` and `notifyOrder` (same results as `apps-script.js`), change the one line in
`functions/_lib/data/index.js`, and move stock into D1 too so the stock check and the insert share one transaction.
