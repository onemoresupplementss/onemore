/**
 * Feed.gs - keeps the website's live prices and stock in step with the Products file.
 *
 *   pushLiveFeed        sends prices/stock/visibility + public settings + delivery areas to
 *                       <SITE_URL>/api/refresh (after orders, cancels, edits and every 5 minutes)
 *   onProductsEdit      trigger on the Products file: schedules a push ~30 s later; "PublishNow" tick
 *   checkProducts       fills the Check column (and blank Group cells)
 *   rebuildWebsite      calls the Cloudflare deploy hook (new products, names, photos)
 *   Price log tab       one row whenever an ID's price or MRP changes (for the 30-day lowest price rule)
 */

const DEBOUNCE_MS = 30 * 1000;

/* =====================================================================
 * Live feed
 * ===================================================================== */

/**
 * Builds the live feed and sends it to the website.
 * reason: 'order' | 'cancel' | 'edit' | 'timer' | 'manual'.
 * opts: { data: already-read Products file, onlyIfChanged: skip when same as last success, dryRun: just build it }
 */
function pushLiveFeed(reason, opts) {
  reason = typeof reason === 'string' ? reason : 'manual';
  opts = opts || {};
  const data = opts.data || readProductsFile_(productsSpreadsheet_(), { info: false });
  const model = modelFromData_(data, todayIST());
  const feed = buildFeed(model, new Date(data.readAt || Date.now()).toISOString());
  if (opts.dryRun) return { ok: true, dryRun: true, feed: feed, model: model };

  try {
    logPriceChanges_(data.ss, feed.items);
  } catch (err) {
    console.error('Price log failed: ' + err);
  }

  const props = PropertiesService.getScriptProperties();
  if (opts.onlyIfChanged && props.getProperty('LAST_FEED_HASH') === feed.v) return { ok: true, skipped: true, v: feed.v };

  const site = (props.getProperty('SITE_URL') || '').replace(/\/+$/, '');
  const key = props.getProperty('REFRESH_KEY') || '';
  let status;
  let ok = false;
  if (!site || !key) {
    status = 'Not synced – set SITE_URL and REFRESH_KEY in Script Properties';
  } else {
    try {
      const res = UrlFetchApp.fetch(site + '/api/refresh', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(feed),
        headers: { 'X-Refresh-Key': key },
        muteHttpExceptions: true,
        followRedirects: true,
      });
      const code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        ok = true;
        props.setProperty('LAST_FEED_HASH', feed.v);
        status = 'Last sync ' + nowText_() + ' – OK';
      } else {
        const hint = code === 401 ? ' (REFRESH_KEY differs from Cloudflare)' : code === 404 ? ' (check SITE_URL)' : '';
        status = 'Last sync attempt ' + nowText_() + ' – FAILED: HTTP ' + code + hint + ' ' + res.getContentText().slice(0, 120);
      }
    } catch (err) {
      status = 'Last sync attempt ' + nowText_() + ' – FAILED: could not reach ' + site + ' (' + ((err && err.message) || err) + ')';
    }
  }
  props.setProperty('STATUS_SYNC', status);
  writeSiteStatus_(data.ss);
  if (!ok) console.warn('Live feed (' + reason + '): ' + status);
  return { ok: ok, v: feed.v, status: status };
}

/* =====================================================================
 * Products-file edit trigger (installed by setupProductsFile)
 * ===================================================================== */

function onProductsEdit(e) {
  try {
    const range = e && e.range;
    if (!range) return;
    const sheet = range.getSheet();
    const tab = normKey(sheet.getName());
    if (tab === 'pricelog') return;
    if (tab === 'settings' && publishNowTicked_(sheet, range)) rebuildWebsite_(sheet.getParent(), 'Publish now');
    scheduleFeedPush_();
  } catch (err) {
    console.error('onProductsEdit: ' + (err && err.stack ? err.stack : err));
  }
}

// True when this edit ticked the PublishNow checkbox.
function publishNowTicked_(sheet, range) {
  const values = sheet.getDataRange().getValues();
  const row = settingsRowOf_(values, 'PublishNow');
  if (!row) return false;
  const valueCol = settingsCols_(values[0]).valueCol + 1;
  const inside = row >= range.getRow() && row <= range.getLastRow() && valueCol >= range.getColumn() && valueCol <= range.getLastColumn();
  return inside && parseBool(values[row - 1][valueCol - 1]);
}

// Debounce: many quick edits -> one push about 30 seconds after the first one.
function scheduleFeedPush_() {
  const props = PropertiesService.getScriptProperties();
  const recent = (at) => at && Date.now() - at < 5 * 60 * 1000;
  if (recent(Number(props.getProperty('FEED_PUSH_SCHEDULED_AT')))) return; // already scheduled
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // the 5-minute timer will pick the change up anyway
  try {
    if (recent(Number(props.getProperty('FEED_PUSH_SCHEDULED_AT')))) return;
    deleteTriggers_('runScheduledFeedPush');
    ScriptApp.newTrigger('runScheduledFeedPush').timeBased().after(DEBOUNCE_MS).create();
    props.setProperty('FEED_PUSH_SCHEDULED_AT', String(Date.now()));
  } finally {
    lock.releaseLock();
  }
}

// One-off trigger made by scheduleFeedPush_.
function runScheduledFeedPush() {
  PropertiesService.getScriptProperties().deleteProperty('FEED_PUSH_SCHEDULED_AT');
  deleteTriggers_('runScheduledFeedPush');
  const data = readProductsFile_(productsSpreadsheet_(), { info: true });
  checkProducts_(data);
  pushLiveFeed('edit', { data: data, onlyIfChanged: true });
}

// Every 5 minutes: return stock of cancelled orders (if an edit was missed), update the
// Check column, and push the feed only if something changed since the last successful push.
function timerTick() {
  if (!prop_('PRODUCTS_SHEET_ID')) return;
  const props = PropertiesService.getScriptProperties();
  const scheduled = Number(props.getProperty('FEED_PUSH_SCHEDULED_AT'));
  if (scheduled && Date.now() - scheduled > 10 * 60 * 1000) {
    props.deleteProperty('FEED_PUSH_SCHEDULED_AT'); // a one-off trigger got lost - clean up
    deleteTriggers_('runScheduledFeedPush');
  }
  try {
    returnCancelledStock_();
  } catch (err) {
    console.error('Cancelled-stock sweep failed: ' + err);
  }
  const data = readProductsFile_(productsSpreadsheet_(), { info: true });
  checkProducts_(data);
  pushLiveFeed('timer', { data: data, onlyIfChanged: true });
}

/* =====================================================================
 * Check column + Group
 * ===================================================================== */

// Menu / editor: check the products now.
function checkProducts() {
  const n = checkProducts_(readProductsFile_(productsSpreadsheet_(), { info: true }));
  return n;
}

// Writes only cells whose value changes. Returns the number of active rows with problems.
function checkProducts_(data) {
  const sheet = data.products.sheet;
  const values = data.products.values;
  const header = values[0];
  const checkCol = findCol(header, CHECK_COLUMN);
  const groupCol = findCol(header, PRODUCT_COLUMNS.group);
  const result = productChecks({
    products: rowsAsObjects_(values),
    info: rowsAsObjects_(data.info.values),
    settings: settingsMap_(data.settings.values),
  }, todayIST());

  // Group: fill once when blank, never overwrite.
  if (groupCol >= 0) {
    result.fills.forEach((f) => {
      sheet.getRange(f.row + 2, groupCol + 1).setValue(f.group);
      values[f.row + 1][groupCol] = f.group;
    });
  }

  if (checkCol >= 0 && values.length > 1) {
    const changed = [];
    result.checks.forEach((msg, i) => {
      if (text(values[i + 1][checkCol]) !== msg) changed.push(i);
    });
    if (changed.length > 10) {
      sheet.getRange(2, checkCol + 1, result.checks.length, 1).setValues(result.checks.map((m) => [m]));
    } else {
      changed.forEach((i) => sheet.getRange(i + 2, checkCol + 1).setValue(result.checks[i]));
    }
    changed.forEach((i) => {
      values[i + 1][checkCol] = result.checks[i];
    });
  }

  const props = PropertiesService.getScriptProperties();
  const note = result.problemRows ? result.problemRows + ' active product rows need attention (see Check column)' : 'All product rows OK';
  if (props.getProperty('STATUS_CHECK') !== note) {
    props.setProperty('STATUS_CHECK', note);
    writeSiteStatus_(data.ss);
  }
  return result.problemRows;
}

/* =====================================================================
 * SiteStatus row in Settings
 * ===================================================================== */

function writeSiteStatus_(ss) {
  const props = PropertiesService.getScriptProperties();
  const parts = [props.getProperty('STATUS_SYNC'), props.getProperty('STATUS_REBUILD'), props.getProperty('STATUS_CHECK')].filter(Boolean);
  const textNow = parts.join(' · ');
  const sheet = findSheet_(ss, 'Settings');
  if (!sheet) return;
  const values = sheet.getDataRange().getValues();
  let row = settingsRowOf_(values, 'SiteStatus');
  const cols = settingsCols_(values[0]);
  if (!row) {
    row = values.length + 1;
    sheet.getRange(row, cols.keyCol + 1).setValue('SiteStatus');
  } else if (text(values[row - 1][cols.valueCol]) === textNow) return;
  sheet.getRange(row, cols.valueCol + 1).setNumberFormat('@').setValue(guardText(textNow));
}

/* =====================================================================
 * Website rebuild (Cloudflare Pages deploy hook)
 * ===================================================================== */

// Menu "Rebuild website now".
function rebuildWebsite() {
  const msg = rebuildWebsite_(productsSpreadsheet_(), 'Rebuild');
  say_('Rebuild website', msg);
  return msg;
}

// Daily trigger (about 5 am): picks up new products, names and photos without anyone ticking PublishNow.
function dailyRebuild() {
  if (!prop_('DEPLOY_HOOK_URL') || !prop_('PRODUCTS_SHEET_ID')) return;
  rebuildWebsite_(productsSpreadsheet_(), 'Daily rebuild');
}

function rebuildWebsite_(ss, label) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('DEPLOY_HOOK_URL');
  let msg;
  if (!url) {
    msg = label + ' not started – DEPLOY_HOOK_URL is not set in Script Properties';
  } else {
    try {
      const res = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true });
      const code = res.getResponseCode();
      msg = code >= 200 && code < 300
        ? label + ' requested ' + nowText_() + ' – OK (site updates in about 2–5 min)'
        : label + ' ' + nowText_() + ' – FAILED: HTTP ' + code + ' (check DEPLOY_HOOK_URL)';
    } catch (err) {
      msg = label + ' ' + nowText_() + ' – FAILED: ' + ((err && err.message) || err);
    }
  }
  untickPublishNow_(ss);
  props.setProperty('STATUS_REBUILD', msg);
  writeSiteStatus_(ss);
  return msg;
}

function untickPublishNow_(ss) {
  const sheet = findSheet_(ss, 'Settings');
  if (!sheet) return;
  const values = sheet.getDataRange().getValues();
  const row = settingsRowOf_(values, 'PublishNow');
  const valueCol = settingsCols_(values[0]).valueCol;
  if (row && values[row - 1][valueCol] !== false) sheet.getRange(row, valueCol + 1).setValue(false);
}

/* =====================================================================
 * Price log (for "lowest price in the last 30 days")
 * ===================================================================== */

// Adds a row for each ID whose price or MRP differs from the last logged value.
function logPriceChanges_(ss, items) {
  const props = PropertiesService.getScriptProperties();
  let cache = loadPriceCache_(props);
  if (!cache) cache = priceCacheFromTab_(ss);
  const now = new Date();
  const rows = [];
  Object.keys(items).forEach((id) => {
    const key = items[id][0] + '/' + items[id][1];
    if (cache[id] !== key) {
      rows.push([now, id, items[id][0], items[id][1]]);
      cache[id] = key;
    }
  });
  if (!rows.length) return 0;
  const sheet = priceLogSheet_(ss);
  const start = sheet.getLastRow() + 1;
  if (start + rows.length - 1 > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 500);
  const range = sheet.getRange(start, 1, rows.length, 4);
  range.setNumberFormats(rows.map(() => ['yyyy-mm-dd hh:mm', '@', MONEY_FORMAT, MONEY_FORMAT]));
  range.setValues(rows);
  savePriceCache_(props, cache);
  return rows.length;
}

function priceLogSheet_(ss) {
  let sheet = findSheet_(ss, 'Price log');
  if (!sheet) {
    sheet = ss.insertSheet('Price log');
    sheet.getRange(1, 1, 1, 4).setValues([['Date', 'ID', 'Price', 'MRP']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Last logged "price/mrp" per ID, read from the tab (only when the saved copy is missing).
function priceCacheFromTab_(ss) {
  const cache = {};
  const sheet = findSheet_(ss, 'Price log');
  if (!sheet) return cache;
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    const id = text(values[r][1]);
    if (id) cache[id] = values[r][2] + '/' + values[r][3];
  }
  return cache;
}

// Saved in Script Properties in pieces of 8,000 characters (one property holds at most 9 KB).
function loadPriceCache_(props) {
  const all = props.getProperties();
  if (!('PRICE_CACHE_0' in all)) return null;
  let s = '';
  for (let i = 0; ('PRICE_CACHE_' + i) in all; i++) s += all['PRICE_CACHE_' + i];
  try {
    return JSON.parse(s);
  } catch (err) {
    return null;
  }
}

function savePriceCache_(props, cache) {
  const s = JSON.stringify(cache);
  const chunks = {};
  let n = 0;
  for (let i = 0; i < s.length; i += 8000) chunks['PRICE_CACHE_' + n++] = s.slice(i, i + 8000);
  props.setProperties(chunks);
  const all = props.getProperties();
  for (let i = n; ('PRICE_CACHE_' + i) in all; i++) props.deleteProperty('PRICE_CACHE_' + i);
}

/* =====================================================================
 * Triggers helper
 * ===================================================================== */

function deleteTriggers_(handler) {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
}
